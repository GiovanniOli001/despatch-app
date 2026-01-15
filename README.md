# Dispatch App

Bus and coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch.

**Version:** 1.2.0 | **Last Updated:** January 15, 2026

## Live App

- **App:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

## Tech Stack

- **Frontend:** Vanilla JS (single HTML file) → Cloudflare Pages
- **Backend:** TypeScript → Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Geocoding:** Nominatim (OpenStreetMap)

## Features

### Completed ✅
- **HRM** - Employee management with CRUD operations
- **Vehicles** - Fleet management with capacity tracking
- **Shift Templates** - Reusable shift definitions with duty blocks/lines
- **Roster** - Gantt-style drag-drop shift assignment
- **Dispatch** - Daily operations view (driver & vehicle centric)
- **Inline Editing** - Edit duties directly in dispatch view
- **Adhoc Shifts** - Create duties without templates
- **Location Autocomplete** - Nominatim integration

### Planned
- Operations Calendar (week/month view)
- Charters module (quote-to-invoice)
- Maintenance tracking
- Reporting/exports

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) (LTS version)
- [Git](https://git-scm.com)
- [Cloudflare account](https://dash.cloudflare.com)

### Initial Setup

```bash
# Clone the repo
git clone https://github.com/GiovanniOli001/despatch-app.git
cd despatch-app

# Install dependencies
cd workers && npm install

# Login to Cloudflare
npx wrangler login

# Create database (first time only)
npx wrangler d1 create dispatch-db
# Copy the database_id into wrangler.toml

# Initialize schema
npx wrangler d1 execute dispatch-db --remote --file=src/db/schema.sql

# Deploy API
npx wrangler deploy
```

### Making Changes

Edit files, then:

```bash
# Deploy backend
cd workers
npx wrangler deploy

# Deploy frontend
cd ..
git add .
git commit -m "your message"
git push
```

Cloudflare auto-deploys frontend in ~30 seconds.

## Project Structure

```
dispatch-app/
├── frontend/
│   └── index.html          # ALL frontend code (HTML + CSS + JS)
└── workers/
    ├── wrangler.toml       # Cloudflare config
    └── src/
        ├── index.ts        # Main router
        ├── routes/
        │   ├── employees.ts
        │   ├── vehicles.ts
        │   ├── shifts.ts
        │   ├── roster.ts
        │   ├── dispatch.ts
        │   └── config.ts
        └── db/
            └── schema.sql
```

## API Endpoints

| Resource | Endpoints |
|----------|-----------|
| Dispatch | `GET /api/dispatch/:date`, assign, transfer, unassign, create-duty-line, create-adhoc-shift |
| Roster | `GET/POST /api/roster/containers`, day view, assign, unassign |
| Shifts | `GET/POST /api/shifts`, `GET/PUT/DELETE /api/shifts/:id`, duplicate |
| Employees | `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/:id` |
| Vehicles | `GET/POST /api/vehicles`, `GET/PUT/DELETE /api/vehicles/:id` |
| Config | duty-types, pay-types |

See [PROJECT-MD.txt](PROJECT-MD.txt) for full documentation.

## Data Model

```
Shift Templates
  └── Duty Blocks (assignable units)
       └── Duty Lines (time segments)

Rosters
  └── Roster Entries (assignments)
       └── Roster Duty Lines (instance data)

Adhoc Entries (no template, created in dispatch)
  └── Roster Duty Lines
```

## Version History

### v1.2.0 (January 15, 2026)
- Adhoc shift creation with database persistence
- Location autocomplete fixes (z-index, shift templates)
- PAY dropdown width fix
- Add Duty prioritizes existing shifts

### v1.1.0 (January 2026)
- Roster module with drag-drop
- Dispatch day view with inline editing
- Location autocomplete

### v1.0.0 (December 2025)
- Initial release with HRM, Vehicles, Shift Templates

## License

MIT
