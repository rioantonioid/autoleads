# AutoLead CRM — Chery Batam

Multi-user Lead Management System with shared database.

## Quick Start

```bash
cd autolead-crm
npm install
node server.js
```

Open http://localhost:3000 — Login: `admin` / `admin123`

## How It Works

All users connect to the same server, same database. When User A adds a lead, User B sees it automatically (syncs every 30 seconds + on tab focus).

- **Database:** SQLite (file: `db/autolead.db`, auto-created on first run)
- **Session:** Server-side sessions (cookie-based)
- **Passwords:** bcrypt hashed
- **Photos:** Base64 stored in database

## Deploy to Render.com (Free)

1. Push to GitHub
2. Go to render.com → New Web Service
3. Connect your repo
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Add env: `SESSION_SECRET=your-random-secret-here`

## Deploy to Railway.app (Free)

1. Push to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. It auto-detects Node.js
4. Add env: `SESSION_SECRET=your-random-secret-here`

## Deploy to VPS

```bash
git clone <your-repo> && cd autolead-crm
npm install
SESSION_SECRET=your-secret PORT=3000 node server.js
```

Use PM2 for production: `pm2 start server.js`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| SESSION_SECRET | autolead-crm-secret-change-this | Session encryption key (CHANGE THIS!) |

## Default Login

- Username: `admin`
- Password: `admin123`
- **Change immediately after first login**
