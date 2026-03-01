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

function persist() {
  if (!db) return;
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    stmt.free();
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    const cols = stmt.getColumnNames();
    const vals = stmt.get();
    const row = {};
    cols.forEach((c, i) => row[c] = vals[i]);
    rows.push(row);
  }
  stmt.free();
  return rows;
}

function lastId() {
  const r = get('SELECT last_insert_rowid() as id');
  return r ? r.id : null;
}

function initSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, fullName TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'sales',
    supervisorId INTEGER, active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT (date('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
    carType TEXT DEFAULT 'Sedan', source TEXT DEFAULT 'Walk-in',
    date TEXT NOT NULL DEFAULT (date('now')), status TEXT DEFAULT 'New',
    followUp TEXT, notes TEXT, createdBy TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (date('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}

function seedData() {
  const row = get('SELECT COUNT(*) as c FROM users');
  if (row && row.c > 0) return;

  const h = pw => bcrypt.hashSync(pw, 10);
  const users = [
    [1,'director',h('pass123'),'Tan Wei Ming','director',null],
    [2,'admin',h('admin123'),'Nurul Hana','admin',null],
    [3,'branchmgr',h('pass123'),'Ahmad Razak','branch_manager',null],
    [4,'salesmgr',h('pass123'),'Lim Mei Ling','sales_manager',null],
    [5,'supv_ali',h('pass123'),'Ali bin Hassan','supervisor',null],
    [6,'supv_siti',h('pass123'),'Siti Nurhaliza','supervisor',null],
    [7,'sarah',h('pass123'),'Sarah Rahman','sales',5],
    [8,'james',h('pass123'),'James Ong','sales',5],
    [9,'farah',h('pass123'),'Farah Aminah','sales',6],
    [10,'kevin',h('pass123'),'Kevin Loh','sales',6],
  ];
  users.forEach(u => db.run(
    'INSERT INTO users (id,username,password,fullName,role,supervisorId,active,createdAt) VALUES (?,?,?,?,?,?,1,?)',
    [...u, '2026-01-01']
  ));

  const leads = [
    ['Rizal Hakim','+60 12-345 6789','SUV','Walk-in','2026-02-20','Interested','2026-02-25','Interested in Honda CR-V.','sarah','2026-02-20'],
    ['Nurul Aisyah','+60 13-987 6543','Sedan','Website','2026-02-19','New','2026-02-24','Inquired Honda Civic pricing.','james','2026-02-19'],
    ['David Tan','+60 11-222 3344','Hatchback','Referral','2026-02-18','Test Drive','2026-02-22','Test drove Honda Jazz.','sarah','2026-02-18'],
    ['Priya Devi','+60 16-555 7788','SUV','Social Media','2026-02-17','Negotiation','2026-02-21','Negotiating Honda HR-V.','james','2026-02-17'],
    ['Michael Lee','+60 12-111 9999','Electric','Auto Show','2026-02-15','Sold',null,'Purchased Honda e:N1.','farah','2026-02-15'],
    ['Siti Fatimah','+60 19-876 5432','MPV','Phone Call','2026-02-14','Lost',null,'Chose Toyota Veloz.','farah','2026-02-14'],
    ['Jason Wong','+60 17-333 4455','Sedan','Online Ads','2026-02-22','New','2026-02-26','Google Ad click.','kevin','2026-02-22'],
    ['Amirah Hassan','+60 14-666 7788','Hybrid','Walk-in','2026-02-21','Contacted','2026-02-24','Showed City Hybrid.','kevin','2026-02-21'],
    ['Ahmad Faisal','+60 18-999 1122','SUV','Referral','2026-02-23','New','2026-02-27','Referred by Michael Lee.','sarah','2026-02-23'],
    ['Jenny Tan','+60 12-444 5566','Sedan','Website','2026-02-22','Contacted','2026-02-25','Requested Civic RS spec.','farah','2026-02-22'],
  ];
  leads.forEach(l => db.run(
    'INSERT INTO leads (name,phone,carType,source,date,status,followUp,notes,createdBy,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)', l
  ));

  const settings = {
    statuses: ['New','Contacted','Interested','Test Drive','Negotiation','Hot','Warm','Cold','Sold','Lost'],
    sources: ['Walk-in','Phone Call','Website','Social Media','Referral','Auto Show','Online Ads','Other'],
    carTypes: ['Sedan','SUV','Hatchback','MPV','Pickup Truck','Coupe','Convertible','Electric','Hybrid','Commercial'],
    statusColors: {
      New:'#3B82F6',Contacted:'#F59E0B',Interested:'#06B6D4','Test Drive':'#A78BFA',
      Negotiation:'#F59E0B',Sold:'#22C55E',Lost:'#EF4444',Hot:'#EF4444',
      Warm:'#F59E0B',Cold:'#06B6D4',Pending:'#64748B'
    }
  };
  Object.entries(settings).forEach(([k, v]) =>
    db.run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', [k, JSON.stringify(v)])
  );

  console.log('✅ Database seeded with demo data');
}

module.exports = { getDb, run, get, all, lastId, persist };
