# Dispatch App

**Version:** 1.1.1  
**Last Updated:** January 15, 2026  
**Status:** MVP Development - Dispatch Screen In Progress

## Overview

A bus/coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch operations.

Built with:
- **Frontend:** Vanilla JS, deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite)

## Live URLs

- **Frontend:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

## Local File Paths (Windows)

```
C:\Users\Giovanni\Downloads\despatch-app\
├── frontend\
│   └── index.html          # Single-file app (HTML + CSS + JS)
└── workers\
    ├── wrangler.toml       # Cloudflare config
    └── src\
        ├── index.ts        # Main router
        └── routes\
            ├── dispatch.ts # Dispatch API endpoints
            ├── employees.ts
            ├── vehicles.ts
            ├── shifts.ts
            ├── roster.ts
            └── config.ts
```

## Deployment Workflow

### Frontend Changes (index.html)

1. Download the new `index.html` from Claude
2. Copy to project:
```cmd
copy C:\Users\Giovanni\Downloads\index.html C:\Users\Giovanni\Downloads\despatch-app\frontend\index.html
```
3. Deploy (run each line separately):
```cmd
cd C:\Users\Giovanni\Downloads\despatch-app
```
```cmd
git add .
```
```cmd
git commit -m "description"
```
```cmd
git push
```
Auto-deploys to Cloudflare Pages in ~30 seconds.

### Backend Changes (workers/*.ts)

1. Download new `.ts` file(s) from Claude
2. Copy to project:
```cmd
copy C:\Users\Giovanni\Downloads\dispatch.ts C:\Users\Giovanni\Downloads\despatch-app\workers\src\routes\dispatch.ts
```
3. Deploy (run each line separately):
```cmd
cd C:\Users\Giovanni\Downloads\despatch-app\workers
```
```cmd
npx wrangler deploy
```

### Database Migrations

Run each line separately:
```cmd
cd C:\Users\Giovanni\Downloads\despatch-app\workers
```
```cmd
npx wrangler d1 execute dispatch-db --remote --file=src\db\migration_name.sql
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cloudflare    │     │   Cloudflare    │     │   Cloudflare    │
│     Pages       │────▶│    Workers      │────▶│       D1        │
│   (Frontend)    │     │   (API)         │     │   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Core Concepts

### Data Model
```
Shift Templates (reusable definitions)
  └── Duty Blocks (assignable units, e.g., "AM Block", "PM Block")
       └── Duty Lines (time segments within a block)

Rosters (date range containers, e.g., "Week 3 Jan 2026")
  └── Roster Entries (assignments: block + date + driver)
       └── Roster Duty Lines (instance-specific copies for editing)
```

## API Endpoints

### Dispatch
- `GET /api/dispatch/:date` - Full day view (drivers, vehicles, duties)
- `POST /api/dispatch/assign` - Assign driver/vehicle to entry
- `POST /api/dispatch/transfer` - Transfer shift between drivers
- `POST /api/dispatch/unassign` - Remove assignment
- `POST /api/dispatch/update-duty-line` - Update existing duty line
- `POST /api/dispatch/create-duty-line` - Create NEW duty line
- `POST /api/dispatch/delete-duty-line` - Delete duty line

### Roster
- `GET /api/roster/containers` - List rosters
- `POST /api/roster/assign` - Assign block to driver
- `GET /api/roster/day/:rosterId/:date` - Day view

### Shift Templates
- `GET /api/shifts` - List templates
- `GET /api/shifts/:id` - Get template with blocks/lines
- `POST /api/shifts` - Create template
- `PUT /api/shifts/:id` - Update template

### Employees & Vehicles
- Standard CRUD at `/api/employees` and `/api/vehicles`

## Database Schema

### Key Tables

| Table | Purpose |
|-------|---------|
| `roster_entries` | Assignments (block + date + driver) |
| `roster_duty_lines` | Instance copies for dispatch editing |
| `shift_template_duty_blocks` | Reusable duty blocks |
| `shift_template_duty_lines` | Template duty lines |

### roster_duty_lines
```sql
id TEXT PRIMARY KEY,
tenant_id TEXT NOT NULL,
roster_entry_id TEXT NOT NULL,
sequence INTEGER NOT NULL,
start_time REAL NOT NULL,
end_time REAL NOT NULL,
duty_type TEXT NOT NULL DEFAULT 'driving',
description TEXT,
vehicle_id TEXT,
vehicle_number TEXT,
pay_type TEXT NOT NULL DEFAULT 'STD',
location_name TEXT,
location_lat REAL,
location_lng REAL
```

## Frontend Screens

| Screen | Status |
|--------|--------|
| Dispatch | 🟡 In Progress |
| HRM | ✅ Complete |
| Vehicles | ✅ Complete |
| Shift Templates | ✅ Complete |
| Roster | ✅ Complete |

## Key Design Decisions

1. **Single HTML File**: All frontend code in one file. CSS at top, HTML in middle, JS at bottom.
2. **Duty Blocks vs Lines**: Blocks are assignable units; Lines are time segments within blocks.
3. **Decimal Time**: Times stored as decimal hours (6.5 = 06:30).
4. **Soft Deletes**: All deletions set `deleted_at` timestamp.
5. **Instance Editing**: Dispatch edits go to `roster_duty_lines`, not templates.

## Current Issues / TODO

- [ ] Adhoc duties don't persist (no roster_entry_id)
- [ ] Vehicle assignment at duty line level
- [ ] Leave/availability display
- [ ] Real-time updates (WebSocket)
- [ ] Authentication

## Claude Instructions

When providing files:
1. Provide complete downloadable files
2. Give simple copy commands for Windows
3. Frontend = git push, Backend = wrangler deploy
4. Always check PROJECT-MD.txt for current file paths
5. **ALWAYS give commands LINE BY LINE, never use && or ; to chain commands**
6. Each command must be in its own code block so user can copy individually
