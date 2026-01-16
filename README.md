# Dispatch App

Bus and coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch.

**Version:** 1.8.0 | **Last Updated:** January 17, 2026

## Live App

- **App:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

## Tech Stack

- **Frontend:** Vanilla JS (modular files) → Cloudflare Pages
- **Backend:** TypeScript → Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Geocoding:** Nominatim (OpenStreetMap)

## Features

### Completed ✅
- **HRM** - Employee management with custom fields and layout designer
- **Vehicles** - Fleet management with capacity tracking
- **Shift Templates** - Reusable shift definitions with duty blocks/lines
- **Roster** - Gantt-style drag-drop shift assignment
- **Ops Calendar** - Week/month view with publish/unpublish
- **Dispatch** - Daily operations view (driver & vehicle centric)
- **Inline Editing** - Edit duties directly in dispatch view
- **Adhoc Shifts** - Create duties without templates
- **Location Autocomplete** - Nominatim integration
- **Published Roster Protection** - Blocks editing when published
- **Duty Cancellation** - Cancel/reinstate duties with reason tracking
- **Custom Fields** - Configurable employee fields with layout designer
- **Pay Types** - Hourly rate definitions (STD, OT, etc.)
- **Dispatch Commit** - Lock days and generate pay records

### In Progress
- Employee Pay Records Tab (Phase 4)

### Planned
- Reports & exports
- Charters module

## Project Structure

```
dispatch-app/
├── frontend/
│   ├── index.html              ← HTML shell + modals
│   ├── css/
│   │   └── main.css            ← All styles (~4,700 lines)
│   └── js/
│       ├── api.js              ← API client
│       ├── app.js              ← Constants, navigation, utilities
│       ├── dispatch.js         ← Dispatch screen (~7,900 lines)
│       ├── hrm.js              ← Employees + custom fields
│       ├── vehicles.js         ← Vehicle CRUD
│       ├── shifts.js           ← Shift templates
│       └── roster.js           ← Roster + calendar
└── workers/
    ├── wrangler.toml           ← Cloudflare config
    └── src/
        ├── index.ts            ← Main router
        ├── routes/
        │   ├── employees.ts
        │   ├── employee-fields.ts
        │   ├── vehicles.ts
        │   ├── shifts.ts
        │   ├── roster.ts
        │   ├── dispatch.ts
        │   ├── dispatch-commit.ts
        │   ├── ops-calendar.ts
        │   └── config.ts
        └── db/
            └── schema.sql
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) (LTS version)
- [Git](https://git-scm.com)
- [Cloudflare account](https://dash.cloudflare.com)

### Initial Setup

```bash
git clone https://github.com/GiovanniOli001/despatch-app.git
cd despatch-app
cd workers && npm install
npx wrangler login
npx wrangler d1 create dispatch-db
npx wrangler d1 execute dispatch-db --remote --file=src/db/schema.sql
npx wrangler deploy
```

### Making Changes

**Backend:**
```
cd workers
npx wrangler deploy
```

**Frontend:**
```
git add .
git commit -m "your message"
git push
```

Cloudflare auto-deploys frontend in ~30 seconds.

## Database Schema

### Key Tables
| Table | Purpose |
|-------|---------|
| employees | Driver/staff records |
| vehicles | Fleet management |
| shift_templates | Reusable shift definitions |
| shift_template_duty_blocks | Duty blocks within shifts |
| shift_template_duty_lines | Individual duty lines |
| rosters | Roster containers (week/period) |
| roster_entries | Assigned duties per date |
| roster_duty_lines | Instance-level duty data |
| dispatch_adhoc_shifts | Standalone adhoc shifts |
| dispatch_adhoc_duty_lines | Adhoc duty lines |
| pay_types | Hourly rate definitions |
| dispatch_commits | Committed date tracking |
| employee_pay_records | Generated pay records |

### Foreign Key Deletion Order
When purging data, delete in this order:
1. `roster_duty_lines`
2. `roster_entries`
3. `rosters`
4. `shift_template_duty_lines`
5. `shift_template_duty_blocks`
6. `shift_templates`
7. `dispatch_adhoc_duty_lines`
8. `dispatch_adhoc_shifts`

## API Endpoints

| Resource | Key Endpoints |
|----------|---------------|
| Dispatch | GET /:date, commit, cancel-duty-line, create-adhoc-shift |
| Roster | containers, publish, unpublish, assign |
| Shifts | CRUD + lock-status |
| Employees | Full CRUD |
| Pay Types | CRUD |

## Documentation

See **[PROJECT-MD.txt](PROJECT-MD.txt)** for complete technical documentation including:
- Full database schema with all columns
- Backend modification protocol
- Lessons learned
- API endpoint details
- Deployment procedures

## ⚠️ Backend Modification Warning

Before making backend changes:
1. Verify schema: `npx wrangler d1 execute dispatch-db --remote --command="PRAGMA table_info(table_name);"`
2. Type check: `npx tsc --noEmit`
3. Monitor logs: `npx wrangler tail`

See PROJECT-MD.txt Section 2 for full protocol.

## Version History

### v1.8.0 (January 17, 2026)
- Adhoc shift refactoring - standalone tables
- Fixed inline duty insertion time bug

### v1.7.0 (January 16, 2026)
- Pay Types Admin (Phase 1)
- Employee Pay Type Association (Phase 2)
- Dispatch Commit system (Phase 3)
- Comprehensive documentation with verified schema
- Backend modification protocol

### v1.6.0 (January 16, 2026)
- Frontend restructured into modular files

### v1.5.0 (January 16, 2026)
- HRM custom fields with layout designer

### v1.4.0 (January 15, 2026)
- Duty cancellation with visual indicators

### v1.3.0 (January 15, 2026)
- Published roster protection

### v1.2.0 (January 15, 2026)
- Adhoc shift creation

### v1.1.0 (January 2026)
- Roster module with drag-drop

### v1.0.0 (December 2025)
- Initial release

## License

MIT
