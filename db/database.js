const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'data.json');
let store = {};

function load() {
  try { if (fs.existsSync(DB_PATH)) store = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch(e) { store = {}; }
  if (!store.users || !store.users.length) seed();
}

function save() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(store), 'utf8'); } catch(e) { console.error('DB save:', e.message); }
}

function seed() {
  store.users = [
    {id:1,username:'rio',password:'123',fullName:'Rio Antonio',role:'director',supervisorId:null,active:true,createdAt:'2026-01-01'},
    {id:2,username:'admin',password:'123',fullName:'Maria',role:'director_assistant',supervisorId:null,active:true,createdAt:'2026-01-01'},
    {id:3,username:'bm',password:'1',fullName:'Rocky',role:'branch_manager',supervisorId:null,active:true,createdAt:'2026-01-01'},
    {id:4,username:'sm',password:'1',fullName:'Rizky',role:'sales_manager',supervisorId:null,active:true,createdAt:'2026-01-01'},
    {id:5,username:'yanwar',password:'1',fullName:'Yanwar',role:'supervisor',supervisorId:null,active:true,createdAt:'2026-01-01'},
    {id:6,username:'sarul',password:'1',fullName:'Sarul',role:'supervisor',supervisorId:null,active:true,createdAt:'2026-01-01'},
    {id:7,username:'chandra',password:'1',fullName:'Chandra',role:'supervisor',supervisorId:null,active:true,createdAt:'2026-01-01'},
    {id:101,username:'budi',password:'1',fullName:'Budi',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:102,username:'ellis',password:'1',fullName:'Ellis',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:103,username:'putri',password:'1',fullName:'Putri',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:104,username:'ruddy',password:'1',fullName:'Ruddy',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:105,username:'siska',password:'1',fullName:'Siska',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:106,username:'steven',password:'1',fullName:'Steven',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:107,username:'sutriawan',password:'1',fullName:'Sutriawan',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:108,username:'yudi',password:'1',fullName:'Yudi',role:'sales',supervisorId:7,active:true,createdAt:'2026-01-01'},
    {id:201,username:'hendro',password:'1',fullName:'Hendro',role:'sales',supervisorId:6,active:true,createdAt:'2026-01-01'},
    {id:202,username:'alfan',password:'1',fullName:'Alfan',role:'sales',supervisorId:6,active:true,createdAt:'2026-01-01'},
    {id:203,username:'ilham',password:'1',fullName:'Ilham',role:'sales',supervisorId:6,active:true,createdAt:'2026-01-01'},
    {id:204,username:'nickel',password:'1',fullName:'Nickel',role:'sales',supervisorId:6,active:true,createdAt:'2026-01-01'},
    {id:205,username:'rizal',password:'1',fullName:'Rizal',role:'sales',supervisorId:6,active:true,createdAt:'2026-01-01'},
    {id:206,username:'silvia',password:'1',fullName:'Silvia',role:'sales',supervisorId:6,active:true,createdAt:'2026-01-01'},
    {id:207,username:'wahyu',password:'1',fullName:'Wahyu',role:'sales',supervisorId:6,active:true,createdAt:'2026-01-01'},
    {id:301,username:'tri',password:'1',fullName:'Tri',role:'sales',supervisorId:5,active:true,createdAt:'2026-01-01'},
    {id:302,username:'ade',password:'1',fullName:'Ade',role:'sales',supervisorId:5,active:true,createdAt:'2026-01-01'},
    {id:303,username:'adinda',password:'1',fullName:'Adinda',role:'sales',supervisorId:5,active:true,createdAt:'2026-01-01'},
    {id:304,username:'galang',password:'1',fullName:'Galang',role:'sales',supervisorId:5,active:true,createdAt:'2026-01-01'},
    {id:305,username:'haidin',password:'1',fullName:'Haidin',role:'sales',supervisorId:5,active:true,createdAt:'2026-01-01'},
  ];
  ['leads','activities','checkins','sim_approved','schedules','events'].forEach(k=>{if(!store[k])store[k]=[]});
  if(!store.settings) store.settings={};
  save();
  console.log('  Seeded ' + store.users.length + ' users');
}

function findUser(username) { return (store.users||[]).find(u=>u.username===username); }
function findUserById(id) { return (store.users||[]).find(u=>u.id===id); }

function checkPhone(phone, excludeId) {
  const clean = phone.replace(/[^0-9]/g,'');
  if (clean.length < 4) return [];
  return (store.leads||[]).filter(l=>{
    if(Number(l.id)===Number(excludeId)) return false;
    const lp = (l.phone||'').replace(/[^0-9]/g,'');
    return lp===clean || lp.endsWith(clean) || clean.endsWith(lp);
  }).map(l=>{
    const u = (store.users||[]).find(x=>x.username===l.createdBy);
    return {id:l.id,name:l.name,phone:l.phone,status:l.status,createdBy:l.createdBy,salesName:u?u.fullName:l.createdBy};
  });
}

function getSync(user, rc) {
  const users = (store.users||[]).map(u=>({id:u.id,username:u.username,fullName:u.fullName,role:u.role,supervisorId:u.supervisorId,active:u.active,createdAt:u.createdAt,password:u.password}));
  let leads = store.leads || [];
  if (!rc.viewAll) {
    if (user.role==='supervisor') {
      const team = users.filter(u=>u.supervisorId===user.id).map(u=>u.username);
      team.push(user.username);
      leads = leads.filter(l=>team.includes(l.createdBy));
    } else {
      leads = leads.filter(l=>l.createdBy===user.username);
    }
  }
  return {
    al_users:users, al_leads:leads, al_activities:store.activities||[],
    al_checkins:store.checkins||[], al_sim_approved:store.sim_approved||[],
    al_schedules:store.schedules||[], al_events:store.events||[],
    al_stock:store.stock||[], al_stock_meta:store.stock_meta||{},
    al_stock_colors:store.stock_colors||null, al_trainings:store.trainings||[],
    al_statuses:store.statuses||['Hot','Warm','Cold','SPK','LOST'],
    al_sources:store.sources||['Walk-in','Social Media','Ads','Referral','Exhibition','Event','Movex'],
    al_cartypes:store.cartypes||[], al_custom_colors:store.custom_colors||{},
    al_source_colors:store.source_colors||{}, al_session:user.id,
    al_side_config:store.side_config||null, al_dash_config:store.dash_config||null,
  };
}

function setKey(key, value, user, rc) {
  const map = {al_users:'users',al_leads:'leads',al_activities:'activities',al_checkins:'checkins',
    al_sim_approved:'sim_approved',al_schedules:'schedules',al_events:'events',
    al_stock:'stock',al_stock_meta:'stock_meta',al_stock_colors:'stock_colors',al_trainings:'trainings',
    al_statuses:'statuses',al_sources:'sources',al_cartypes:'cartypes',
    al_custom_colors:'custom_colors',al_source_colors:'source_colors',
    al_side_config:'side_config',al_dash_config:'dash_config'};
  const k = map[key];
  if (!k) return;
  
  if (k==='leads' && !rc.viewAll) {
    // Merge: keep leads not visible to this user
    const existing = store.leads || [];
    let visibleUns;
    if (user.role==='supervisor') {
      visibleUns = (store.users||[]).filter(u=>u.supervisorId===user.id).map(u=>u.username);
      visibleUns.push(user.username);
    } else { visibleUns = [user.username]; }
    const others = existing.filter(l=>!visibleUns.includes(l.createdBy));
    store.leads = [...value, ...others.filter(o=>!value.find(v=>Number(v.id)===Number(o.id)))];
  } else if (k==='users') {
    // Merge: update existing, add new, handle deletes for visible users
    const incoming = value;
    store.users = incoming;
  } else {
    store[k] = value;
  }
  save();
}

load();
module.exports = { findUser, findUserById, checkPhone, getSync, setKey, getStore:()=>store, save };
