# Dispatch App

Bus and coach dispatch operations system. Manage drivers, vehicles, shifts, rosters, and daily dispatch.

## Tech Stack

- **Frontend:** Vanilla JS → Cloudflare Pages
- **Backend:** TypeScript → Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)

## Live App

- **App:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) (LTS version)
- [Git](https://git-scm.com)
- [Cloudflare account](https://dash.cloudflare.com)

### Initial Setup

```bash
# Clone the repo
git clone https://github.com/YOUR-USERNAME/dispatch-app.git
cd dispatch-app

# Install dependencies
npm install
cd workers && npm install && cd ..

# Login to Cloudflare
cd workers
npx wrangler login

# Create database (first time only)
npx wrangler d1 create dispatch-db
# Copy the database_id into wrangler.toml

# Initialize schema
npx wrangler d1 execute dispatch-db --remote --file=src/db/schema.sql

# Deploy API
npm run deploy
```

### Making Changes

Edit files, then:

```bash
git add .
git commit -m "your message"
git push
```

Cloudflare auto-deploys in ~30 seconds.

Or edit directly on GitHub - same result.

## API Endpoints

| Resource | Endpoints |
|----------|-----------|
| Health | `GET /api/health` |
| Employees | `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/:id` |
| Vehicles | `GET/POST /api/vehicles`, `GET/PUT/DELETE /api/vehicles/:id` |
| Shifts | `GET/POST /api/shifts`, `GET/PUT/DELETE /api/shifts/:id` |
| Roster | `GET/POST /api/roster`, copy-day, copy-week |
| Dispatch | `GET /api/dispatch/:date`, assign, transfer, unassign |
| Config | duty-types, pay-types, locations, routes, depots |

See [PROJECT.md](PROJECT.md) for full API documentation.

## Project Structure

```
dispatch-app/
├── frontend/           # Static frontend
│   ├── index.html
│   ├── css/main.css
│   └── js/
│       ├── api.js      # API client
│       └── app.js      # Main app
└── workers/            # Cloudflare Workers API
    ├── wrangler.toml   # Config (database ID here)
    └── src/
        ├── index.ts    # Router
        ├── db/schema.sql
        └── routes/     # API handlers
```

## Status

🟢 Backend API - Complete  
🟢 Database Schema - Complete  
🟢 Deployment Pipeline - Complete  
🟡 Frontend Screens - In Progress

## License

MIT
