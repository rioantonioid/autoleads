const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb, run, get, all, lastId } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({limit:'10mb'}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'autolead-crm-secret-change-this',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24*60*60*1000 }
}));

const RC = {
  director:       { level:5, viewAll:true, canExport:true, canUsers:true, canSettings:true },
  admin:          { level:5, viewAll:true, canExport:true, canUsers:true, canSettings:true },
  branch_manager: { level:4, viewAll:true, canExport:true, canUsers:true, canSettings:true },
  sales_manager:  { level:3, viewAll:true, canExport:true, canUsers:true, canSettings:true },
  supervisor:     { level:2, viewAll:false, canExport:false, canUsers:false, canSettings:false },
  sales:          { level:1, viewAll:false, canExport:false, canUsers:false, canSettings:false },
};

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = get('SELECT id,username,fullName,role,supervisorId,active FROM users WHERE id=? AND active=1', [req.session.userId]);
  if (!user) return res.status(401).json({ error: 'Session invalid' });
  req.user = user; next();
}

// ══════ AUTH ══════
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = get('SELECT * FROM users WHERE username=? AND active=1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials or account disabled' });
  req.session.userId = user.id;
  res.json({ ok: true, userId: user.id });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json({ user: req.user, permissions: RC[req.user.role] }));

// ══════ DUPLICATE CHECK (checks ALL leads, not just visible) ══════
app.get('/api/check-phone', auth, (req, res) => {
  const phone = (req.query.phone || '').replace(/[^0-9]/g, '');
  const excludeId = Number(req.query.excludeId) || 0;
  if (phone.length < 4) return res.json([]);
  const leads = all('SELECT id,name,phone,status,source,createdBy,createdAt FROM leads WHERE status != ? ORDER BY id DESC', ['LOST']);
  const dupes = leads.filter(l => {
    if (excludeId && l.id === excludeId) return false;
    return l.phone.replace(/[^0-9]/g, '') === phone;
  });
  // Enrich with user names
  const users = all('SELECT username,fullName FROM users');
  const byUn = {}; users.forEach(u => byUn[u.username] = u.fullName);
  res.json(dupes.map(d => ({...d, salesName: byUn[d.createdBy] || d.createdBy})));
});

// ══════ CHANGE PASSWORD ══════
app.put('/api/me/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 1) return res.status(400).json({ error: 'New password is required' });
  const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!bcrypt.compareSync(currentPassword, user.password))
    return res.status(403).json({ error: 'Current password is incorrect' });
  run('UPDATE users SET password=? WHERE id=?', [bcrypt.hashSync(newPassword, 10), user.id]);
  res.json({ ok: true });
});

// ══════ SYNC — The magic endpoint ══════
// Returns ALL data the frontend needs in one call
// Frontend stores in memory, uses G()/S() like before
app.get('/api/sync', auth, (req, res) => {
  const u = req.user;
  const cfg = RC[u.role];

  // Get all leads (visibility filtered)
  let leads;
  if (cfg.viewAll) {
    leads = all('SELECT * FROM leads ORDER BY id DESC');
  } else if (u.role === 'supervisor') {
    const team = all('SELECT username FROM users WHERE supervisorId=?', [u.id]).map(x => x.username);
    team.push(u.username);
    const ph = team.map(() => '?').join(',');
    leads = all(`SELECT * FROM leads WHERE createdBy IN (${ph}) ORDER BY id DESC`, team);
  } else {
    leads = all('SELECT * FROM leads WHERE createdBy=? ORDER BY id DESC', [u.username]);
  }

  // Convert SQLite integers to booleans for frontend compat
  leads = leads.map(l => ({...l, spkSection: !!l.spkSection, doSection: !!l.doSection}));

  const users = all('SELECT id,username,fullName,role,supervisorId,active,createdAt FROM users ORDER BY id');
  const activities = all('SELECT * FROM activities ORDER BY id DESC');
  const checkins = all('SELECT * FROM checkins ORDER BY id DESC');
  const simApproved = all('SELECT groupKey FROM sim_approved').map(r => r.groupKey);

  // Settings
  const settingsRows = all('SELECT * FROM settings');
  const settings = {};
  settingsRows.forEach(r => { try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; } });

  res.json({
    al_leads: leads,
    al_users: users.map(u => ({...u, active: !!u.active})),
    al_activities: activities,
    al_checkins: checkins,
    al_sim_approved: simApproved,
    al_schedules: all('SELECT * FROM schedules ORDER BY date,username'),
    al_events: all('SELECT * FROM events ORDER BY startDate DESC'),
    al_stock: JSON.parse((get("SELECT value FROM settings WHERE key='stock'") || {}).value || '[]'),
    al_stock_meta: JSON.parse((get("SELECT value FROM settings WHERE key='stock_meta'") || {}).value || '{}'),
    al_stock_colors: JSON.parse((get("SELECT value FROM settings WHERE key='stock_colors'") || {}).value || 'null'),
    al_statuses: settings.statuses || ['Hot','Warm','Cold','SPK','LOST'],
    al_sources: settings.sources || ['Walk-in','Social Media','Ads','Referral','Exhibition','Event','Movex'],
    al_cartypes: settings.carTypes || [],
    al_custom_colors: settings.statusColors || {},
    al_source_colors: settings.sourceColors || {},
    al_session: u.id,
    al_version: 8,
    al_theme: null, // theme stays local
  });
});

// ══════ SAVE — Receives writes from frontend S() ══════
app.post('/api/save', auth, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });

  const td = new Date().toISOString().split('T')[0];
  const tm = new Date().toTimeString().slice(0,5);

  try {
    switch(key) {
      case 'al_leads': {
        // SMART MERGE: Only touch leads this user can see, preserve everyone else's
        if (!Array.isArray(value)) break;
        const u = req.user;
        const cfg = RC[u.role];

        // Get IDs of leads this user could previously see
        let visibleIds;
        if (cfg.viewAll) {
          visibleIds = new Set(all('SELECT id FROM leads').map(r => r.id));
        } else if (u.role === 'supervisor') {
          const team = all('SELECT username FROM users WHERE supervisorId=?', [u.id]).map(x => x.username);
          team.push(u.username);
          const ph = team.map(() => '?').join(',');
          visibleIds = new Set(all(`SELECT id FROM leads WHERE createdBy IN (${ph})`, team).map(r => r.id));
        } else {
          visibleIds = new Set(all('SELECT id FROM leads WHERE createdBy=?', [u.username]).map(r => r.id));
        }

        const incomingIds = new Set(value.map(l => l.id));

        // Upsert all incoming leads
        value.forEach(l => {
          const exists = get('SELECT id FROM leads WHERE id=?', [l.id]);
          if (exists) {
            run(`UPDATE leads SET name=?,phone=?,carType=?,source=?,date=?,status=?,followUp=?,notes=?,createdBy=?,createdAt=?,updatedAt=?,updatedBy=?,spkSection=?,spkDate=?,doSection=?,doDate=?,doPhoto=? WHERE id=?`,
              [l.name, l.phone, l.carType||'Sedan', l.source||'Walk-in', l.date||td, l.status||'Hot',
               l.followUp||null, l.notes||null, l.createdBy, l.createdAt||td, l.updatedAt||td, l.updatedBy||null,
               l.spkSection?1:0, l.spkDate||null, l.doSection?1:0, l.doDate||null, l.doPhoto||null, l.id]);
          } else {
            run(`INSERT INTO leads (id,name,phone,carType,source,date,status,followUp,notes,createdBy,createdAt,updatedAt,updatedBy,spkSection,spkDate,doSection,doDate,doPhoto)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [l.id, l.name, l.phone, l.carType||'Sedan', l.source||'Walk-in', l.date||td, l.status||'Hot',
               l.followUp||null, l.notes||null, l.createdBy, l.createdAt||td, l.updatedAt||td, l.updatedBy||null,
               l.spkSection?1:0, l.spkDate||null, l.doSection?1:0, l.doDate||null, l.doPhoto||null]);
          }
        });

        // Delete only leads that were visible to this user but are no longer in their list (user deleted them)
        visibleIds.forEach(id => {
          if (!incomingIds.has(id)) run('DELETE FROM leads WHERE id=?', [id]);
        });
        break;
      }
      case 'al_users': {
        // Sync users — update existing, insert new (don't touch passwords from frontend)
        if (Array.isArray(value)) {
          const existing = all('SELECT id FROM users');
          const existingIds = new Set(existing.map(u => u.id));
          value.forEach(u => {
            if (existingIds.has(u.id)) {
              // Update without touching password (unless it's a plain text password from user form)
              if (u.password && !u.password.startsWith('$2')) {
                run('UPDATE users SET fullName=?,role=?,supervisorId=?,active=?,password=? WHERE id=?',
                  [u.fullName, u.role, u.supervisorId||null, u.active?1:0, bcrypt.hashSync(u.password,10), u.id]);
              } else {
                run('UPDATE users SET fullName=?,role=?,supervisorId=?,active=? WHERE id=?',
                  [u.fullName, u.role, u.supervisorId||null, u.active?1:0, u.id]);
              }
            } else {
              const pw = u.password && !u.password.startsWith('$2') ? bcrypt.hashSync(u.password,10) : u.password || bcrypt.hashSync('password123',10);
              run('INSERT INTO users (id,username,password,fullName,role,supervisorId,active,createdAt) VALUES (?,?,?,?,?,?,?,?)',
                [u.id, u.username, pw, u.fullName, u.role, u.supervisorId||null, u.active?1:0, u.createdAt||td]);
            }
          });
          // Delete removed users
          const newIds = new Set(value.map(u => u.id));
          existing.forEach(u => { if (!newIds.has(u.id)) run('DELETE FROM users WHERE id=?', [u.id]); });
        }
        break;
      }
      case 'al_activities': {
        // Smart merge — upsert by id, don't delete others
        if (Array.isArray(value)) {
          value.forEach(a => {
            const exists = get('SELECT id FROM activities WHERE id=?', [a.id]);
            if (!exists) {
              run('INSERT INTO activities (id,leadId,user,action,detail,date,time) VALUES (?,?,?,?,?,?,?)',
                [a.id, a.leadId, a.user, a.action, a.detail||'', a.date||td, a.time||tm]);
            }
          });
        }
        break;
      }
      case 'al_checkins': {
        // Append new checkins only
        if (Array.isArray(value)) {
          value.forEach(c => {
            const exists = get('SELECT id FROM checkins WHERE user=? AND date=?', [c.user, c.date]);
            if (!exists) {
              run('INSERT INTO checkins (user,date,time) VALUES (?,?,?)', [c.user, c.date, c.time]);
            }
          });
        }
        break;
      }
      case 'al_sim_approved': {
        // Sync approved list
        if (Array.isArray(value)) {
          const existing = new Set(all('SELECT groupKey FROM sim_approved').map(r => r.groupKey));
          const incoming = new Set(value);
          // Add new approvals
          value.forEach(k => { if (!existing.has(k)) run('INSERT OR IGNORE INTO sim_approved (groupKey) VALUES (?)', [k]); });
          // Remove revoked approvals
          existing.forEach(k => { if (!incoming.has(k)) run('DELETE FROM sim_approved WHERE groupKey=?', [k]); });
        }
        break;
      }
      case 'al_schedules': {
        run('DELETE FROM schedules');
        if (Array.isArray(value)) {
          value.forEach(s => {
            run('INSERT OR IGNORE INTO schedules (date,username,shift,eventId,activity,setBy,setAt) VALUES (?,?,?,?,?,?,?)',
              [s.date, s.username, s.shift||'', s.eventId||null, s.activity||'', s.setBy||req.user.username, s.setAt||new Date().toISOString()]);
          });
        }
        break;
      }
      case 'al_events': {
        run('DELETE FROM events');
        if (Array.isArray(value)) {
          value.forEach(e => {
            run('INSERT INTO events (id,name,location,startDate,endDate,color,status,createdBy,createdAt,updatedBy,updatedAt,approvedBy,approvedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
              [e.id, e.name, e.location||'', e.startDate, e.endDate, e.color||'', e.status||'active',
               e.createdBy||req.user.username, e.createdAt||td, e.updatedBy||null, e.updatedAt||null, e.approvedBy||null, e.approvedAt||null]);
          });
        }
        break;
      }
      case 'al_statuses':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['statuses', JSON.stringify(value)]);
        break;
      case 'al_sources':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['sources', JSON.stringify(value)]);
        break;
      case 'al_cartypes':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['carTypes', JSON.stringify(value)]);
        break;
      case 'al_custom_colors':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['statusColors', JSON.stringify(value)]);
        break;
      case 'al_source_colors':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['sourceColors', JSON.stringify(value)]);
        break;
      case 'al_stock':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['stock', JSON.stringify(value)]);
        break;
      case 'al_stock_meta':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['stock_meta', JSON.stringify(value)]);
        break;
      case 'al_stock_colors':
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', ['stock_colors', JSON.stringify(value)]);
        break;
      // Local-only keys — skip
      case 'al_session':
      case 'al_version':
      case 'al_theme':
        break;
      default:
        break;
    }
    res.json({ ok: true });
  } catch(err) {
    console.error('Save error:', key, err.message);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

(async () => {
  await getDb();
  app.listen(PORT, () => console.log(`\n🚗 Chery Batam CRM running at http://localhost:${PORT}\n`));
})();
