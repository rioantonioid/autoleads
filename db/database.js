const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'autolead.db');
let db = null;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  initSchema();
  seedData();
  persist();
  return db;
}

function persist() { if (!db) return; fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }
function run(sql, params = []) { db.run(sql, params); persist(); }
function get(sql, params = []) {
  const stmt = db.prepare(sql); stmt.bind(params);
  if (stmt.step()) { const cols = stmt.getColumnNames(), vals = stmt.get(), row = {}; cols.forEach((c, i) => row[c] = vals[i]); stmt.free(); return row; }
  stmt.free(); return null;
}
function all(sql, params = []) {
  const stmt = db.prepare(sql); stmt.bind(params); const rows = [];
  while (stmt.step()) { const cols = stmt.getColumnNames(), vals = stmt.get(), row = {}; cols.forEach((c, i) => row[c] = vals[i]); rows.push(row); }
  stmt.free(); return rows;
}
function lastId() { const r = get('SELECT last_insert_rowid() as id'); return r ? r.id : null; }

function initSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, fullName TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'sales',
    supervisorId INTEGER, active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (date('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
    carType TEXT DEFAULT 'Tiggo 8 Comfort', source TEXT DEFAULT 'Walk-in',
    date TEXT NOT NULL DEFAULT (date('now')), status TEXT DEFAULT 'Hot',
    followUp TEXT, notes TEXT, createdBy TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (date('now')), updatedAt TEXT, updatedBy TEXT,
    spkSection INTEGER DEFAULT 0, spkDate TEXT,
    doSection INTEGER DEFAULT 0, doDate TEXT, doPhoto TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT, leadId INTEGER NOT NULL,
    user TEXT NOT NULL, action TEXT NOT NULL, detail TEXT,
    date TEXT NOT NULL DEFAULT (date('now')), time TEXT NOT NULL DEFAULT (time('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sim_approved (
    id INTEGER PRIMARY KEY AUTOINCREMENT, groupKey TEXT UNIQUE NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, username TEXT NOT NULL, shift TEXT NOT NULL,
    eventId INTEGER, activity TEXT, setBy TEXT, setAt TEXT,
    UNIQUE(date, username)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, location TEXT, startDate TEXT NOT NULL, endDate TEXT NOT NULL,
    color TEXT, status TEXT DEFAULT 'active',
    createdBy TEXT, createdAt TEXT,
    updatedBy TEXT, updatedAt TEXT,
    approvedBy TEXT, approvedAt TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  // Add missing columns to existing dbs
  try { db.run('ALTER TABLE leads ADD COLUMN spkSection INTEGER DEFAULT 0'); } catch(e){}
  try { db.run('ALTER TABLE leads ADD COLUMN spkDate TEXT'); } catch(e){}
  try { db.run('ALTER TABLE leads ADD COLUMN doSection INTEGER DEFAULT 0'); } catch(e){}
  try { db.run('ALTER TABLE leads ADD COLUMN doDate TEXT'); } catch(e){}
  try { db.run('ALTER TABLE leads ADD COLUMN doPhoto TEXT'); } catch(e){}
}

function seedData() {
  const h = pw => bcrypt.hashSync(pw, 10);
  const defaults = [
    { id:1, username:'rio',     pw:'123', fullName:'Rio Antonio', role:'director',       supId:null },
    { id:2, username:'admin',   pw:'123', fullName:'Maria',       role:'admin',          supId:null },
    { id:3, username:'bm',      pw:'1',   fullName:'Rocky',       role:'branch_manager', supId:null },
    { id:4, username:'sm',      pw:'1',   fullName:'Rizky',       role:'sales_manager',  supId:null },
    { id:5, username:'yanwar',  pw:'1',   fullName:'Yanwar',      role:'supervisor',     supId:null },
    { id:6, username:'sarul',   pw:'1',   fullName:'Sarul',       role:'supervisor',     supId:null },
    { id:7, username:'chandra', pw:'1',   fullName:'Chandra',     role:'supervisor',     supId:null },
  ];

  // Ensure each default user exists (by username)
  defaults.forEach(u => {
    const existing = get('SELECT id FROM users WHERE username=?', [u.username]);
    if (!existing) {
      // Check if the id slot is taken by another user
      const idTaken = get('SELECT id FROM users WHERE id=?', [u.id]);
      const useId = idTaken ? null : u.id;
      if (useId) {
        db.run('INSERT INTO users (id,username,password,fullName,role,supervisorId,active,createdAt) VALUES (?,?,?,?,?,?,1,?)',
          [useId, u.username, h(u.pw), u.fullName, u.role, u.supId, '2026-01-01']);
      } else {
        db.run('INSERT INTO users (username,password,fullName,role,supervisorId,active,createdAt) VALUES (?,?,?,?,?,1,?)',
          [u.username, h(u.pw), u.fullName, u.role, u.supId, '2026-01-01']);
      }
      console.log(`  ✅ Created user: ${u.username} (${u.role})`);
    } else {
      // Update name and role to match defaults
      db.run('UPDATE users SET fullName=?,role=? WHERE username=?', [u.fullName, u.role, u.username]);
    }
  });

  // Ensure settings exist
  const settings = {
    statuses: ['Hot','Warm','Cold','SPK','LOST'],
    sources: ['Walk-in','Social Media','Ads','Referral','Exhibition','Event','Movex'],
    carTypes: ['Tiggo 8 Comfort','Tiggo 8 Premium','Tiggo Cross Comfort','Tiggo Cross Premium','Tiggo Cross CSH','Chery E5','Chery C5 Z','Chery C5 RZ','Chery C5 CSH','J6 FWD','J6 IWD','J6T FWD','J6T IWD','Omoda GT FWD','Tiggo 9 CSH'],
    statusColors: { Hot:'var(--red)',Warm:'var(--org)',Cold:'var(--acc)',SPK:'var(--grn)',LOST:'var(--t3)' },
    sourceColors: { 'Walk-in':'var(--acc)','Social Media':'var(--pur)',Ads:'var(--red)',Referral:'var(--org)',Exhibition:'var(--pnk)',Event:'var(--cyn)',Movex:'var(--grn)' }
  };
  Object.entries(settings).forEach(([k, v]) =>
    db.run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', [k, JSON.stringify(v)]));
}

module.exports = { getDb, run, get, all, lastId, persist };
