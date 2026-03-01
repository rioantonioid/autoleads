const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb, run, get, all, lastId } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'autolead-crm-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Role config
const RC = {
  director:       { level:5, viewAll:true, canExport:true, canUsers:true, canSettings:true },
  admin:          { level:5, viewAll:true, canExport:true, canUsers:true, canSettings:true },
  branch_manager: { level:4, viewAll:true, canExport:true, canUsers:true, canSettings:true },
  sales_manager:  { level:3, viewAll:true, canExport:true, canUsers:true, canSettings:false },
  supervisor:     { level:2, viewAll:false, canExport:true, canUsers:false, canSettings:false },
  sales:          { level:1, viewAll:false, canExport:false, canUsers:false, canSettings:false },
};
const MGR_ROLES = ['director','admin','branch_manager','sales_manager'];

// Auth middleware
function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = get('SELECT id,username,fullName,role,supervisorId,active FROM users WHERE id=? AND active=1', [req.session.userId]);
  if (!user) return res.status(401).json({ error: 'Session invalid' });
  req.user = user;
  next();
}
function mgr(req, res, next) {
  if (!MGR_ROLES.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
}

function visibleLeads(user) {
  const cfg = RC[user.role];
  if (cfg.viewAll) return all('SELECT * FROM leads ORDER BY id DESC');
  if (user.role === 'supervisor') {
    const team = all('SELECT username FROM users WHERE supervisorId=?', [user.id]).map(u => u.username);
    team.push(user.username);
    const ph = team.map(() => '?').join(',');
    return all(`SELECT * FROM leads WHERE createdBy IN (${ph}) ORDER BY id DESC`, team);
  }
  return all('SELECT * FROM leads WHERE createdBy=? ORDER BY id DESC', [user.username]);
}

// ══════ AUTH ══════
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = get('SELECT * FROM users WHERE username=? AND active=1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials or account disabled' });
  req.session.userId = user.id;
  const { password: _, ...safe } = user;
  res.json({ user: safe, permissions: RC[user.role] });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json({ user: req.user, permissions: RC[req.user.role] }));

// ══════ CHANGE PASSWORD ══════
app.put('/api/me/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
  const user = get('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!bcrypt.compareSync(currentPassword, user.password))
    return res.status(403).json({ error: 'Current password is incorrect' });
  run('UPDATE users SET password=? WHERE id=?', [bcrypt.hashSync(newPassword, 10), user.id]);
  res.json({ ok: true });
});

// ══════ LEADS ══════
app.get('/api/leads', auth, (req, res) => res.json(visibleLeads(req.user)));
app.post('/api/leads', auth, (req, res) => {
  const { name, phone, carType, source, date, status, followUp, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
  const td = new Date().toISOString().split('T')[0];
  run('INSERT INTO leads (name,phone,carType,source,date,status,followUp,notes,createdBy,createdAt,updatedAt,updatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [name, phone, carType||'Sedan', source||'Walk-in', date||td, status||'Hot', followUp||null, notes||null, req.user.username, td, td, req.user.username]);
  res.json(get('SELECT * FROM leads WHERE id=?', [lastId()]));
});
app.put('/api/leads/:id', auth, (req, res) => {
  const lead = get('SELECT * FROM leads WHERE id=?', [req.params.id]);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!RC[req.user.role].viewAll && req.user.role !== 'supervisor' && lead.createdBy !== req.user.username)
    return res.status(403).json({ error: 'Cannot edit this lead' });
  const { name, phone, carType, source, date, status, followUp, notes } = req.body;
  const td = new Date().toISOString().split('T')[0];
  run('UPDATE leads SET name=?,phone=?,carType=?,source=?,date=?,status=?,followUp=?,notes=?,updatedAt=?,updatedBy=? WHERE id=?',
    [name||lead.name, phone||lead.phone, carType||lead.carType, source||lead.source, date||lead.date, status||lead.status, followUp??lead.followUp, notes??lead.notes, td, req.user.username, lead.id]);
  res.json(get('SELECT * FROM leads WHERE id=?', [lead.id]));
});
app.patch('/api/leads/:id/status', auth, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });
  const td = new Date().toISOString().split('T')[0];
  run('UPDATE leads SET status=?,updatedAt=?,updatedBy=? WHERE id=?', [status, td, req.user.username, req.params.id]);
  res.json(get('SELECT * FROM leads WHERE id=?', [req.params.id]));
});
app.delete('/api/leads/:id', auth, (req, res) => {
  const lead = get('SELECT * FROM leads WHERE id=?', [req.params.id]);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!RC[req.user.role].viewAll && lead.createdBy !== req.user.username)
    return res.status(403).json({ error: 'Cannot delete' });
  run('DELETE FROM leads WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ══════ USERS ══════
app.get('/api/users', auth, (req, res) =>
  res.json(all('SELECT id,username,fullName,role,supervisorId,active,createdAt FROM users ORDER BY id'))
);
app.get('/api/users/team', auth, (req, res) => {
  const cfg = RC[req.user.role];
  if (cfg.viewAll) return res.json(all('SELECT id,username,fullName,role,supervisorId,active FROM users'));
  if (req.user.role === 'supervisor')
    return res.json(all('SELECT id,username,fullName,role,supervisorId,active FROM users WHERE supervisorId=? OR id=?', [req.user.id, req.user.id]));
  res.json([req.user]);
});
app.post('/api/users', auth, mgr, (req, res) => {
  const cnt = get('SELECT COUNT(*) as c FROM users');
  if (cnt.c >= 50) return res.status(400).json({ error: 'Max 50 users' });
  const { username, password, fullName, role, supervisorId, active } = req.body;
  if (!username || !password || !fullName || !role) return res.status(400).json({ error: 'Required fields missing' });
  if (role === 'sales' && !supervisorId) return res.status(400).json({ error: 'Sales must have a supervisor' });
  if (get('SELECT id FROM users WHERE username=?', [username])) return res.status(400).json({ error: 'Username exists' });
  run('INSERT INTO users (username,password,fullName,role,supervisorId,active) VALUES (?,?,?,?,?,?)',
    [username.toLowerCase(), bcrypt.hashSync(password, 10), fullName, role, supervisorId||null, active !== false ? 1 : 0]);
  res.json(get('SELECT id,username,fullName,role,supervisorId,active,createdAt FROM users WHERE id=?', [lastId()]));
});
app.put('/api/users/:id', auth, mgr, (req, res) => {
  const user = get('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, fullName, role, supervisorId, active } = req.body;
  if (role === 'sales' && !supervisorId) return res.status(400).json({ error: 'Sales must have a supervisor' });
  const newPw = password ? bcrypt.hashSync(password, 10) : user.password;
  const supId = (role || user.role) === 'sales' ? (supervisorId || null) : null;
  run('UPDATE users SET fullName=?,role=?,supervisorId=?,active=?,password=? WHERE id=?',
    [fullName||user.fullName, role||user.role, supId, active !== undefined ? (active ? 1 : 0) : user.active, newPw, user.id]);
  res.json(get('SELECT id,username,fullName,role,supervisorId,active,createdAt FROM users WHERE id=?', [user.id]));
});
app.delete('/api/users/:id', auth, mgr, (req, res) => {
  if (Number(req.params.id) === 1) return res.status(400).json({ error: 'Cannot delete the admin account' });
  run('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ══════ SETTINGS ══════
app.get('/api/settings', auth, (req, res) => {
  const rows = all('SELECT * FROM settings');
  const s = {};
  rows.forEach(r => { try { s[r.key] = JSON.parse(r.value); } catch { s[r.key] = r.value; } });
  res.json(s);
});
app.put('/api/settings/:key', auth, (req, res) => {
  if (!['director','admin','branch_manager'].includes(req.user.role))
    return res.status(403).json({ error: 'No settings permission' });
  run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', [req.params.key, JSON.stringify(req.body.value)]);
  res.json({ ok: true });
});

// ══════ EXPORT ══════
app.get('/api/export/csv', auth, (req, res) => {
  if (!RC[req.user.role].canExport) return res.status(403).json({ error: 'No export permission' });
  const leads = visibleLeads(req.user);
  const users = all('SELECT id,username,fullName,supervisorId FROM users');
  const byUn = {}, byId = {};
  users.forEach(u => { byUn[u.username] = u; byId[u.id] = u; });
  const h = ['Name','Phone','Car Type','Source','Date','Status','Follow Up','Notes','Sales Person','Supervisor','Created At'];
  let csv = h.join(',') + '\n';
  leads.forEach(l => {
    const u = byUn[l.createdBy]; const sup = u ? byId[u.supervisorId] : null;
    csv += [l.name,l.phone,l.carType,l.source,l.date,l.status,l.followUp||'',
      `"${(l.notes||'').replace(/"/g,'""')}"`,u?u.fullName:l.createdBy,sup?sup.fullName:'—',l.createdAt].join(',') + '\n';
  });
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition',`attachment; filename=CheryBatam_${req.user.role}_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(csv);
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start
(async () => {
  await getDb();
  app.listen(PORT, () => console.log(`\n🚗 Chery Batam CRM running at http://localhost:${PORT}\n`));
})();
