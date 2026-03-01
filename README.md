# AutoLead CRM

Car Dealership Lead Management System with role-based access control.

## Features

- 🔐 6-tier role hierarchy (Director, Admin, Branch Manager, Sales Manager, Supervisor, Sales)
- 📊 Dashboard with charts & analytics
- 📋 Lead management with filtering & search
- 👥 Team management & visibility rules
- 📥 CSV export
- 🎨 Customizable statuses with color coding
- 💾 SQLite database (shared across all users)

## Quick Start

```bash
npm install
npm start
```

Then open **http://localhost:3000**

## Demo Accounts

| Username | Password | Role |
|---|---|---|
| director | pass123 | Director |
| admin | admin123 | Admin |
| branchmgr | pass123 | Branch Manager |
| salesmgr | pass123 | Sales Manager |
| supv_ali | pass123 | Supervisor |
| supv_siti | pass123 | Supervisor |
| sarah | pass123 | Sales |
| james | pass123 | Sales |
| farah | pass123 | Sales |
| kevin | pass123 | Sales |

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite (better-sqlite3)
- **Auth:** bcrypt + express-session
- **Frontend:** Vanilla HTML/CSS/JS

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| PORT | 3000 | Server port |
| SESSION_SECRET | autolead-crm-secret-change-this | Session encryption key |
| NODE_ENV | development | Environment |

## Deploy to Render / Railway

1. Push to GitHub
2. Connect repo to Render or Railway
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add `SESSION_SECRET` environment variable
