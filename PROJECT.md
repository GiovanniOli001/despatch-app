# Dispatch App

**Version:** 2.0.0  
**Last Updated:** January 15, 2026  
**Status:** MVP Development - Dispatch & Roster Complete

## Overview

A bus/coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch operations.

Built with:
- **Frontend:** Vanilla JS, deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite)

## Live URLs

- **Frontend:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

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
Shift Templates (reusable definitions - MASTER TEMPLATES)
  └── Duty Blocks (assignable units, e.g., "AM Block", "PM Block")
       └── Duty Lines (time segments within a block)

Rosters (date range containers, e.g., "Week 3 Jan 2026")
  └── Roster Entries (assignments: block + date + driver)
       └── Roster Duty Lines (INSTANCE COPIES - editable in Dispatch)
```

### Copy-on-Write Architecture (NEW)
- **Shift Templates** contain master duty lines (never modified by Dispatch)
- When a roster entry is created, duty lines are **copied** to `roster_duty_lines`
- **Dispatch edits modify instance copies**, not the original templates
- This allows per-day customization without affecting future rosters

### Roster → Dispatch Flow
```
1. Create Roster (Ops Calendar)
2. Add Shifts to Roster (Roster screen)
3. Assign Drivers OR Toggle "Include in Dispatch"
4. Publish Roster
5. View in Dispatch (only published rosters appear)
6. Edit duty lines in Dispatch (edits saved to roster_duty_lines)
```

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
| `shift_template_duty_lines` | Time segments within a duty block (MASTER) |
| `rosters` | Date range containers with status (draft/published/archived) |
| `roster_entries` | Assignments (block + date + driver) |
| `roster_duty_lines` | **Instance copies** for Dispatch editing (NEW) |

### Key Table Structures

**shift_template_duty_blocks**
```sql
id TEXT PRIMARY KEY,
shift_template_id TEXT NOT NULL,
sequence INTEGER NOT NULL,
name TEXT NOT NULL,
driver_id TEXT  -- Default driver (optional)
```

**shift_template_duty_lines** (Master - never edited by Dispatch)
```sql
id TEXT PRIMARY KEY,
duty_block_id TEXT NOT NULL,
sequence INTEGER NOT NULL,
start_time REAL NOT NULL,  -- Decimal hours (6.5 = 06:30)
end_time REAL NOT NULL,
duty_type TEXT NOT NULL DEFAULT 'driving',
vehicle_id TEXT,
pay_type TEXT NOT NULL DEFAULT 'STD'
```

**roster_duty_lines** (Instance copies - edited by Dispatch)
```sql
id TEXT PRIMARY KEY,
tenant_id TEXT NOT NULL,
roster_entry_id TEXT NOT NULL,  -- Links to roster_entries
source_duty_line_id TEXT,       -- Links back to template
sequence INTEGER NOT NULL,
start_time REAL NOT NULL,
end_time REAL NOT NULL,
duty_type TEXT,
description TEXT,
vehicle_id TEXT,
vehicle_number TEXT,  -- Denormalized for display
pay_type TEXT DEFAULT 'STD',
created_at TEXT,
updated_at TEXT
```

**rosters**
```sql
id TEXT PRIMARY KEY,
code TEXT NOT NULL UNIQUE,
name TEXT NOT NULL,
start_date TEXT NOT NULL,
end_date TEXT NOT NULL,
status TEXT DEFAULT 'draft',  -- draft, published, archived
calendar_start_date TEXT,     -- Optional custom calendar range
calendar_end_date TEXT
```

**roster_entries**
```sql
id TEXT PRIMARY KEY,
roster_id TEXT,
shift_template_id TEXT,
duty_block_id TEXT,
date TEXT NOT NULL,
driver_id TEXT,
start_time REAL,
end_time REAL,
include_in_dispatch INTEGER DEFAULT 0  -- For unassigned blocks
```

## API Endpoints

### Dispatch (Daily Operations)
- `GET /api/dispatch/:date` - Full day data (drivers, vehicles, unassigned jobs)
- `POST /api/dispatch/assign` - Assign driver to roster entry
- `POST /api/dispatch/transfer` - Transfer between drivers
- `POST /api/dispatch/unassign` - Remove driver/vehicle assignment
- `POST /api/dispatch/update-duty-line` - Update duty line (time, type, vehicle, pay)

### Ops Calendar
- `GET /api/ops-calendar/:year/:month` - Month view with roster spans

### Roster Containers
- `GET /api/roster/containers` - List all rosters
- `GET /api/roster/containers/:id` - Get roster with drivers
- `POST /api/roster/containers` - Create roster
- `PUT /api/roster/containers/:id` - Update roster
- `DELETE /api/roster/containers/:id` - Soft delete
- `POST /api/roster/containers/:id/publish` - Publish roster (visible in Dispatch)
- `POST /api/roster/containers/:id/unpublish` - Unpublish (back to draft)

### Roster Day View
- `GET /api/roster/day/:rosterId/:date` - Get day view with all blocks

### Roster Assignment
- `POST /api/roster/assign` - Assign block(s) to driver (copies duty lines)
- `POST /api/roster/unassign` - Remove assignment

### Dispatch Toggle (for unassigned blocks)
- `POST /api/roster/toggle-dispatch` - Toggle single block
- `POST /api/roster/toggle-dispatch-day` - Toggle all blocks for a day
- `POST /api/roster/toggle-dispatch-all` - Toggle entire roster

### Shift Templates
- `GET /api/shifts` - List templates
- `GET /api/shifts/:id` - Get template with duty blocks and lines
- `POST /api/shifts` - Create template
- `PUT /api/shifts/:id` - Update template (smart upsert preserves IDs)
- `DELETE /api/shifts/:id` - Soft delete

### Employees
- `GET /api/employees` - List (with search, status, role filters)
- `GET /api/employees/:id` - Get single
- `POST /api/employees` - Create
- `PUT /api/employees/:id` - Update
- `DELETE /api/employees/:id` - Soft delete

### Vehicles
- `GET /api/vehicles` - List (with search, capacity filters)
- `GET /api/vehicles/:id` - Get single
- `POST /api/vehicles` - Create
- `PUT /api/vehicles/:id` - Update
- `DELETE /api/vehicles/:id` - Soft delete

### Config
- `GET /api/config/duty-types` - List duty types
- `GET /api/config/pay-types` - List pay types

## Frontend Screens

| Screen | Status | Description |
|--------|--------|-------------|
| Dispatch | ✅ Complete | Daily operations board with Gantt timeline, driver/vehicle views, inline duty editing |
| Operations Calendar | ✅ Complete | Month view with roster bars, publish/unpublish, create roster |
| HRM | ✅ Complete | Employee CRUD with modals |
| Vehicles | ✅ Complete | Vehicle CRUD with modals |
| Shift Templates | ✅ Complete | Template builder with duty blocks/lines, visual Gantt preview |
| Roster | ✅ Complete | Gantt-style drag-drop assignment, dispatch toggle |
| Charters | 🔲 Placeholder | Charter bookings |
| Customers | 🔲 Placeholder | Customer management |
| Maintenance | 🔲 Placeholder | Vehicle maintenance |

## Dispatch Screen Features

### Views
- **Driver-centric**: Drivers on left, assign vehicles to their duties
- **Vehicle-centric**: Vehicles on left, assign drivers to their duties
- **Style variants**: A through E (different visualizations)

### Functionality
- **Gantt timeline**: Visual blocks 5am-11pm
- **Sidebar detail panel**: Shows selected driver/vehicle/job duties
- **Inline duty editing**: Click to edit time, type, description, vehicle, pay type
- **Drag & drop**: Assign unassigned jobs to drivers/vehicles
- **Transfer**: Move shifts between drivers
- **Real/Fake data toggle**: Switch between API data and generated test data
- **Vehicle assignment strips**: Color-coded vehicle indicators on shifts

### Data Flow
```
Published Roster → roster_entries → roster_duty_lines → Dispatch Display
                                                     ↓
                                              User Edits
                                                     ↓
                                         POST /api/dispatch/update-duty-line
                                                     ↓
                                         roster_duty_lines (updated)
```

## Ops Calendar Features

- **Month grid view**: Shows all days with roster bars spanning date ranges
- **Roster bars**: Draft (dotted/gray), Published (solid/colored)
- **Publish/Unpublish**: Click roster bar to toggle status
- **Create roster**: Click day or use "+ New Roster" button
- **QLD holidays**: Orange badges on public holidays
- **Navigate months**: Arrow buttons to move between months

## Project Structure

```
dispatch-app/
├── frontend/
│   ├── index.html          # Single-file app (HTML + CSS + JS)
│   └── (deployed to Cloudflare Pages)
└── workers/
    ├── wrangler.toml       # Cloudflare config
    ├── src/
    │   ├── index.ts        # Main router, CORS, helpers
    │   ├── routes/
    │   │   ├── employees.ts
    │   │   ├── vehicles.ts
    │   │   ├── shifts.ts       # Shift templates with blocks/lines
    │   │   ├── roster.ts       # Rosters + assignments + dispatch toggle
    │   │   ├── dispatch.ts     # Dispatch day view + duty line edits
    │   │   ├── ops-calendar.ts # Month view
    │   │   └── config.ts
    │   └── db/
    │       ├── schema.sql
    │       ├── migration_duty_blocks.sql
    │       ├── migration_rosters.sql
    │       ├── migration_dispatch_toggle.sql
    │       ├── migration_roster_duty_lines.sql  # NEW
    │       └── various other migrations
    └── (deployed to Cloudflare Workers)
```

## Development Workflow

### Using deploy.bat (Recommended)
1. Download files from Claude to Downloads folder
2. Double-click `deploy.bat`
3. Script copies files and deploys automatically

### Manual Deployment

**Frontend Changes:**
```bash
cd dispatch-app
git add .
git commit -m "description"
git push
# Auto-deploys to Cloudflare Pages in ~30 seconds
```

**Backend Changes:**
```bash
cd dispatch-app/workers
npx wrangler deploy
```

**Database Migrations:**
```bash
cd dispatch-app/workers
npx wrangler d1 execute dispatch-db --remote --file=migration_name.sql
```

## Key Design Decisions

1. **Single HTML File**: All frontend code in one file for simplicity. CSS at top, HTML in middle, JS at bottom.

2. **Copy-on-Write for Duty Lines**: 
   - Templates remain immutable (shift_template_duty_lines)
   - Dispatch edits go to instance copies (roster_duty_lines)
   - Prevents template corruption from daily edits

3. **Duty Blocks vs Duty Lines**: 
   - Blocks are assignable units (what gets dragged to drivers)
   - Lines are time segments within blocks (for detailed scheduling)

4. **Roster Status Flow**:
   - Draft → visible in Ops Calendar (gray), not in Dispatch
   - Published → visible in Dispatch, edits persist
   - Archived → hidden from active views

5. **Cross-Roster Conflict Detection**: Prevents same driver being assigned overlapping times across ANY roster

6. **Soft Deletes**: All deletions set `deleted_at` timestamp, never hard delete.

7. **Decimal Time**: Times stored as decimal hours (6.5 = 06:30) for easy math.

## Australian Holidays (QLD)

Hardcoded for 2025-2027:
- New Year's Day
- Australia Day
- Good Friday, Easter Saturday, Easter Monday
- ANZAC Day
- Labour Day (QLD)
- King's Birthday (QLD)
- Royal Queensland Show (Brisbane)
- Christmas Day, Boxing Day

## Known Issues / TODO

1. **Leave/Availability**: Employee daily status not yet integrated
2. **Real-time Updates**: No WebSocket/polling yet
3. **Authentication**: Not implemented (open access)
4. **Mobile**: Not optimized for mobile screens
5. **Charters Module**: Placeholder only
6. **Reporting**: No exports yet

## Next Steps (Suggested)

1. Add employee leave/availability display in Dispatch
2. Build Charters module (bookings, customers)
3. Add reporting/exports (daily sheets, timesheets)
4. Implement vehicle maintenance scheduling
5. Add user authentication
6. Mobile-responsive layout

## Default Data

**Duty Types:**
- Driving (blue), Out of Vehicle (amber), Meal Break (green)
- Waiting (gray), Charter (purple), Dead Running (red)

**Pay Types:**
- Standard (1.0x), Overtime (1.5x), Double Time (2.0x)
- Penalty Rate (1.25x), Allowance (1.0x), Unpaid (0x)

## Deployment Checklist

When making changes:
- [ ] Download files from Claude
- [ ] Copy to project folders (or use deploy.bat)
- [ ] Run any new migrations first
- [ ] Deploy backend: `npx wrangler deploy`
- [ ] Deploy frontend: `git push`
- [ ] Verify in browser (may take 30-60s to propagate)
