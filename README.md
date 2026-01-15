# Dispatch App

Bus and coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch.

**Version:** 1.3.0 | **Last Updated:** January 15, 2026

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
- **Ops Calendar** - Week/month view with publish/unpublish
- **Dispatch** - Daily operations view (driver & vehicle centric)
- **Inline Editing** - Edit duties directly in dispatch view
- **Adhoc Shifts** - Create duties without templates
- **Location Autocomplete** - Nominatim integration
- **Published Roster Protection** - Blocks editing when published

### Planned
- Charters module (quote-to-invoice)
- Maintenance tracking
- Reporting/exports

## Database Schema

### Key Tables & Relationships

```
shift_templates
    └── shift_template_duty_blocks (FK: shift_template_id)
            └── shift_template_duty_lines (FK: duty_block_id)

rosters
    └── roster_entries (FK: roster_id, shift_template_id, duty_block_id)
            └── roster_duty_lines (FK: roster_entry_id)

employees (referenced by duty_blocks.driver_id, roster_entries.driver_id)
vehicles (referenced by duty_lines.vehicle_id)
```

### Foreign Key Deletion Order (CRITICAL!)
When purging data, delete in this order to avoid FK constraint errors:
1. `roster_duty_lines`
2. `roster_entries`
3. `rosters`
4. `shift_template_duty_lines`
5. `shift_template_duty_blocks`
6. `shift_templates`

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
        │   ├── ops-calendar.ts
        │   └── config.ts
        └── db/
            └── schema.sql
```

## API Endpoints

| Resource | Key Endpoints |
|----------|---------------|
| Dispatch | `GET /api/dispatch/:date`, create-duty-line, create-adhoc-shift, update-duty-line |
| Roster | `GET/POST /api/roster/containers`, publish, unpublish, assign, unassign |
| Shifts | `GET/POST /api/shifts`, lock-status, duplicate |
| Employees | Full CRUD at `/api/employees` |
| Vehicles | Full CRUD at `/api/vehicles` |

## Roster Workflow

1. **Create Shift Template** - Define duty blocks and lines
2. **Create Roster** - Date range container (e.g., "Week 3 Jan")
3. **Assign Duties** - Drag blocks to drivers in roster view
4. **Schedule to Calendar** - Set calendar dates
5. **Publish** - Makes duties visible in Dispatch
6. **Unpublish** - Removes from Dispatch, allows editing

### Published Roster Protection
When published:
- Shifts used in roster cannot be edited/deleted
- Roster details cannot be modified
- Must unpublish first to make changes

## Version History

### v1.3.0 (January 15, 2026)
- Published roster protection for shifts and rosters
- Fixed shift editing FK constraint errors
- Fixed bulk vehicle assignment persistence
- Ops Calendar publish/unpublish workflow

### v1.2.0 (January 15, 2026)
- Adhoc shift creation with database persistence
- Location autocomplete fixes

### v1.1.0 (January 2026)
- Roster module with drag-drop
- Dispatch day view with inline editing

### v1.0.0 (December 2025)
- Initial release with HRM, Vehicles, Shift Templates

## Documentation

See [PROJECT-MD.txt](PROJECT-MD.txt) for complete technical documentation including:
- Full database schema with all columns
- API endpoint details
- Troubleshooting guide
- Deployment procedures

## License

MIT
