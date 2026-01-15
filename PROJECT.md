# Dispatch App

**Version:** 1.2.0  
**Last Updated:** January 15, 2026  
**Status:** MVP Development - Dispatch Module In Progress

## Overview

A bus/coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch operations.

Built with:
- **Frontend:** Vanilla JS, deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite)
- **Geocoding:** Nominatim (OpenStreetMap - free, no API key)
- **Routing:** OSRM (for smart assignment distance calculations)

## Live URLs

- **Frontend:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

## Deployment Workflow

### Standard Deployment (using deploy.bat)

1. Claude provides downloadable files to `/mnt/user-data/outputs/`
2. User downloads files to `C:\Users\Giovanni\Downloads\`
3. User double-clicks `deploy.bat` which:
   - Copies `index.html` to `despatch-app\frontend\`
   - Copies `*.ts` files to `despatch-app\workers\src\routes\`
   - Runs `npx wrangler deploy` for backend
   - Git commits & pushes frontend (auto-deploys via Cloudflare Pages)

### Database Migrations (Manual Step)

```bash
cd C:\Users\Giovanni\Downloads\despatch-app\workers
npx wrangler d1 execute dispatch-db --remote --file=migration_name.sql
```

### Project Paths

- **Local Root:** `C:\Users\Giovanni\Downloads\despatch-app\`
- **Frontend:** `despatch-app\frontend\index.html`
- **Backend Routes:** `despatch-app\workers\src\routes\`
- **Migrations:** `despatch-app\workers\` (or `src\db\`)

### Manual Deployment Commands (if needed)

```bash
# Copy files
copy C:\Users\Giovanni\Downloads\index.html C:\Users\Giovanni\Downloads\despatch-app\frontend\index.html
copy C:\Users\Giovanni\Downloads\dispatch.ts C:\Users\Giovanni\Downloads\despatch-app\workers\src\routes\dispatch.ts

# Deploy backend
cd C:\Users\Giovanni\Downloads\despatch-app\workers
npx wrangler deploy

# Deploy frontend
cd C:\Users\Giovanni\Downloads\despatch-app
git add .
git commit -m "Deploy update"
git push
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cloudflare    │     │   Cloudflare    │     │   Cloudflare    │
│     Pages       │────▶│    Workers      │────▶│       D1        │
│   (Frontend)    │     │   (API)         │     │   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                               │
         │              ┌─────────────────┐              │
         └─────────────▶│   Nominatim     │◀─────────────┘
                        │  (Geocoding)    │
                        └─────────────────┘
```

## Current Development Focus

### Location Feature (In Progress)
- **Database:** `location_name`, `location_lat`, `location_lng` fields added to duty lines
- **Shifts:** Location autocomplete with Nominatim in shift template editor ✅
- **Dispatch:** Location column in inline duty list ✅
- **Smart Assignment:** Uses real coordinates for distance calculations ✅

### Issues Being Fixed
1. **Insert duty (+/- buttons)** - Works locally, doesn't persist to database
   - `insertDuty()` creates temp ID `d-${Date.now()}`
   - Need to call `create-duty-line` API with `shift.entryId`
   
2. **Add Adhoc Duty** - Inconsistent behavior + doesn't persist
   - Time validation issue causing it to sometimes not work
   - No backend API call

## Core Concepts

### Data Model
```
Shift Templates (reusable definitions)
  └── Duty Blocks (assignable units, e.g., "AM Block", "PM Block")
       └── Duty Lines (time segments within a block)
            └── Location (optional - for smart assignment)

Rosters (date range containers, e.g., "Week 3 Jan 2026")
  └── Roster Entries (assignments: block + date + driver)
       └── Roster Duty Lines (instance copies with edits)
```

### Roster Design
- **All shift duty blocks appear in Unassigned by default** for every day
- User drags blocks from Unassigned rows to Driver rows to create assignments
- Each shift template gets its own row in the Unassigned section
- Multi-block shifts prompt: "Move all connected blocks?" or "Just this one?"
- Blocks with pre-assigned drivers show ⚡ quick-assign button
- Australian public holidays (QLD) displayed as orange badge

### Dispatch Design
- **Driver-centric view:** Click driver to see their shifts/duties
- **Vehicle-centric view:** Click vehicle to see its assignments
- **Inline editing:** Edit times, types, descriptions, locations directly in duty list
- **Smart assignment:** Suggests next jobs based on driver's last location + travel time

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenancy support (single tenant for MVP) |
| `depots` | Operating locations/bases |
| `employees` | Drivers and staff |
| `vehicles` | Fleet vehicles |
| `duty_types` | Configurable duty types (driving, break, etc.) |
| `pay_types` | Pay categories (standard, overtime, etc.) |
| `shift_templates` | Reusable shift definitions |
| `shift_template_duty_blocks` | Assignable units within a shift |
| `shift_template_duty_lines` | Time segments with location |
| `rosters` | Date range containers |
| `roster_entries` | Assignments (block + date + driver) |
| `roster_duty_lines` | Instance copies for dispatch editing |

### Key Table Structures

**shift_template_duty_lines**
```sql
id TEXT PRIMARY KEY,
duty_block_id TEXT NOT NULL,
sequence INTEGER NOT NULL,
start_time REAL NOT NULL,  -- Decimal hours (6.5 = 06:30)
end_time REAL NOT NULL,
duty_type TEXT NOT NULL DEFAULT 'driving',
description TEXT,
vehicle_id TEXT,
pay_type TEXT NOT NULL DEFAULT 'STD',
location_name TEXT,        -- Free text or selected location
location_lat REAL,         -- Latitude for smart assignment
location_lng REAL          -- Longitude for smart assignment
```

**roster_duty_lines**
```sql
id TEXT PRIMARY KEY,
tenant_id TEXT NOT NULL,
roster_entry_id TEXT NOT NULL,
source_duty_line_id TEXT,  -- Links to template line
sequence INTEGER NOT NULL,
start_time REAL NOT NULL,
end_time REAL NOT NULL,
duty_type TEXT NOT NULL DEFAULT 'driving',
description TEXT,
vehicle_id TEXT,
vehicle_number TEXT,       -- Denormalized for display
pay_type TEXT NOT NULL DEFAULT 'STD',
location_name TEXT,
location_lat REAL,
location_lng REAL,
created_at TEXT,
updated_at TEXT,
deleted_at TEXT
```

## API Endpoints

### Dispatch
- `GET /api/dispatch/:date` - Get full dispatch day view (drivers, vehicles, duties)
- `POST /api/dispatch/assign-vehicle` - Assign vehicle to duty
- `POST /api/dispatch/unassign` - Unassign driver/vehicle from entry
- `POST /api/dispatch/update-duty-line` - Update existing duty line
- `POST /api/dispatch/create-duty-line` - Create new duty line (needs roster_entry_id)

### Roster Containers
- `GET /api/roster/containers` - List all rosters
- `GET /api/roster/containers/:id` - Get roster with drivers
- `POST /api/roster/containers` - Create roster
- `PUT /api/roster/containers/:id` - Update roster
- `DELETE /api/roster/containers/:id` - Soft delete

### Roster Day View
- `GET /api/roster/day/:rosterId/:date` - Get day view with all blocks

### Roster Assignment
- `POST /api/roster/assign` - Assign block(s) to driver
- `POST /api/roster/unassign` - Remove assignment

### Shift Templates
- `GET /api/shifts` - List templates
- `GET /api/shifts/:id` - Get template with duty blocks and lines
- `POST /api/shifts` - Create template
- `PUT /api/shifts/:id` - Update template
- `DELETE /api/shifts/:id` - Soft delete

### Employees & Vehicles
- Standard CRUD endpoints at `/api/employees` and `/api/vehicles`

### Config
- `GET /api/config/duty-types` - List duty types
- `GET /api/config/pay-types` - List pay types

## Frontend Screens

| Screen | Status | Description |
|--------|--------|-------------|
| Dispatch | 🔨 In Progress | Daily operations board with inline editing |
| Operations Calendar | 🔲 Placeholder | Week/month view |
| Charters | 🔲 Placeholder | Charter bookings (quote-to-invoice planned) |
| Customers | 🔲 Placeholder | Customer management |
| HRM | ✅ Complete | Employee CRUD with modals |
| Vehicles | ✅ Complete | Vehicle CRUD with modals |
| Shift Templates | ✅ Complete | Template builder with location fields |
| Roster | ✅ Complete | Gantt-style drag-drop assignment |
| Maintenance | 🔲 Placeholder | Vehicle maintenance |

## Project Structure

```
dispatch-app/
├── frontend/
│   ├── index.html          # Single-file app (HTML + CSS + JS)
│   └── (deployed to Cloudflare Pages)
└── workers/
    ├── wrangler.toml       # Cloudflare config
    ├── deploy.bat          # Windows deployment script
    ├── src/
    │   ├── index.ts        # Main router, CORS, helpers
    │   ├── routes/
    │   │   ├── employees.ts
    │   │   ├── vehicles.ts
    │   │   ├── shifts.ts   # Shift templates with blocks/lines/locations
    │   │   ├── roster.ts   # Roster containers + day view + assignments
    │   │   ├── dispatch.ts # Dispatch view + duty line CRUD
    │   │   └── config.ts
    │   └── db/
    │       ├── schema.sql
    │       └── various migrations
    └── (deployed to Cloudflare Workers)
```

## Key Design Decisions

1. **Single HTML File**: All frontend code in one file for simplicity. CSS at top, HTML in middle, JS at bottom.

2. **Duty Blocks vs Duty Lines**: 
   - Blocks are the assignable units (what gets dragged to drivers)
   - Lines are time segments within blocks (for detailed scheduling)

3. **Roster Duty Lines (Instance Copies)**:
   - When a block is assigned, duty lines are copied to `roster_duty_lines`
   - Allows per-instance edits without affecting template
   - Preserves `source_duty_line_id` for reference

4. **Location for Smart Assignment**:
   - Optional lat/lng on duty lines
   - Nominatim autocomplete (free, no API key)
   - Falls back to description parsing for legacy data
   - Jobs with real coordinates score higher in suggestions

5. **Decimal Time**: Times stored as decimal hours (6.5 = 06:30) for easy math.

6. **Soft Deletes**: All deletions set `deleted_at` timestamp, never hard delete.

## Australian Holidays (QLD)

Hardcoded for 2025-2027:
- New Year's Day, Australia Day
- Good Friday, Easter Saturday, Easter Monday
- ANZAC Day, Labour Day (QLD)
- King's Birthday (QLD), Royal Queensland Show (Brisbane)
- Christmas Day, Boxing Day

## Known Issues / TODO

1. **Insert Duty Persistence**: New duties from +/- buttons don't save to DB
2. **Adhoc Duty**: Inconsistent behavior and no persistence
3. **Vehicle Assignment**: At entry level, not fully at line level
4. **Leave/Availability**: Employee daily status not yet integrated
5. **Real-time Updates**: No WebSocket/polling yet
6. **Authentication**: Not implemented (open access)
7. **Mobile**: Not optimized for mobile screens

## Next Steps

1. Fix insert duty to call `create-duty-line` API
2. Fix adhoc duty time validation + persistence
3. Build charters module (quote-to-invoice workflow)
4. Add copy roster week functionality
5. Build reporting/exports

## Default Data

**Duty Types:**
- Driving (blue), Out of Vehicle (amber), Meal Break (green)
- Waiting (gray), Charter (purple), Dead Running (red)

**Pay Types:**
- Standard (1.0x), Overtime (1.5x), Double Time (2.0x)
- Penalty Rate (1.25x), Allowance (1.0x), Unpaid (0x)
