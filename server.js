const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Hostinger HTTPS
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'autolead-crm-secret-2026',
  resave: false, saveUninitialized: false,
  proxy: true,
  cookie: { httpOnly: true, maxAge: 24*60*60*1000, secure: false, sameSite: 'lax' }
}));

const RC = {
  director:            { level:6, viewAll:true },
  director_assistant:  { level:5, viewAll:true },
  branch_manager:      { level:4, viewAll:true },
  sales_manager:       { level:3, viewAll:true },
  admin:               { level:2, viewAll:true },
  trainer:             { level:2, viewAll:true },
  supervisor:          { level:2, viewAll:false },
  sales:               { level:1, viewAll:false },
};

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.findUserById(req.session.userId);
  if (!user || !user.active) return res.status(401).json({ error: 'Session invalid' });
  req.user = user;
  req.rc = RC[user.role] || RC.sales;
  next();
}

app.get('/api/version', (req, res) => res.json({ build: '2026-03-14', status: 'ok' }));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.findUser(username);
  if (!user || user.password !== password || !user.active)
    return res.status(401).json({ error: 'Invalid credentials or account disabled' });
  req.session.userId = user.id;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

app.get('/api/check-phone', auth, (req, res) => {
  const phone = req.query.phone || '';
  const excludeId = Number(req.query.excludeId) || 0;
  res.json(db.checkPhone(phone, excludeId));
});

app.get('/api/sync', auth, (req, res) => {
  res.json(db.getSync(req.user, req.rc));
});

app.post('/api/save', auth, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key required' });
    db.setKey(key, value, req.user, req.rc);
    res.json({ ok: true });
  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/me/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: 'New password required' });
  const store = db.getStore();
  const user = store.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (currentPassword && user.password !== currentPassword)
    return res.status(400).json({ error: 'Current password is incorrect' });
  user.password = newPassword;
  db.save();
  res.json({ ok: true });
});

app.get('/api/reset-settings', (req, res) => {
  const fs = require('fs');
  try { fs.unlinkSync(path.join(__dirname, 'db', 'data.json')); } catch(e) {}
  delete require.cache[require.resolve('./db/database')];
  const freshDb = require('./db/database');
  res.json({ ok: true, cartypes: freshDb.getStore().cartypes?.length });
});

app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`\n🚗 Chery Batam CRM running at http://localhost:${PORT}\n   Build: 2026-03-14\n`));
