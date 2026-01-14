# Dispatch App

**Version:** 1.1.0  
**Last Updated:** January 15, 2026  
**Status:** MVP Development - Roster Module Complete

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
Shift Templates (reusable definitions)
  └── Duty Blocks (assignable units, e.g., "AM Block", "PM Block")
       └── Duty Lines (time segments within a block)

Rosters (date range containers, e.g., "Week 3 Jan 2026")
  └── Roster Entries (assignments: block + date + driver)
```

### Roster Design (NEW)
- **All shift duty blocks appear in Unassigned by default** for every day
- User drags blocks from Unassigned rows to Driver rows to create assignments
- Each shift template gets its own row in the Unassigned section
- Multi-block shifts prompt: "Move all connected blocks?" or "Just this one?"
- Blocks with pre-assigned drivers show ⚡ quick-assign button
- Australian public holidays (QLD) displayed as orange badge

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
| `shift_template_duty_lines` | Time segments within a duty block |
| `rosters` | Date range containers |
| `roster_entries` | Assignments (block + date + driver) |

### Key Table Structures

**shift_template_duty_blocks**
```sql
id TEXT PRIMARY KEY,
shift_template_id TEXT NOT NULL,
sequence INTEGER NOT NULL,
name TEXT NOT NULL,
driver_id TEXT  -- Default driver (optional)
```

**shift_template_duty_lines**
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

**rosters**
```sql
id TEXT PRIMARY KEY,
code TEXT NOT NULL UNIQUE,
name TEXT NOT NULL,
start_date TEXT NOT NULL,
end_date TEXT NOT NULL,
status TEXT DEFAULT 'draft'  -- draft, published, archived
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
end_time REAL
```

## API Endpoints

### Roster Containers
- `GET /api/roster/containers` - List all rosters
- `GET /api/roster/containers/:id` - Get roster with drivers
- `POST /api/roster/containers` - Create roster
- `PUT /api/roster/containers/:id` - Update roster
- `DELETE /api/roster/containers/:id` - Soft delete

### Roster Day View
- `GET /api/roster/day/:rosterId/:date` - Get day view with all blocks categorized by driver/unassigned

### Roster Assignment
- `POST /api/roster/assign` - Assign block(s) to driver
  ```json
  {
    "shift_template_id": "...",
    "duty_block_id": "...",
    "date": "2026-01-19",
    "driver_id": "..." or null,
    "include_connected": true/false
  }
  ```
- `POST /api/roster/unassign` - Remove assignment
  ```json
  { "entry_id": "..." }
  ```

### Shift Templates
- `GET /api/shifts` - List templates
- `GET /api/shifts/:id` - Get template with duty blocks and lines
- `POST /api/shifts` - Create template
- `PUT /api/shifts/:id` - Update template (replaces all blocks/lines)
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
| Dispatch | 🔲 Placeholder | Daily operations board |
| Operations Calendar | 🔲 Placeholder | Week/month view |
| Charters | 🔲 Placeholder | Charter bookings |
| Customers | 🔲 Placeholder | Customer management |
| HRM | ✅ Complete | Employee CRUD with modals |
| Vehicles | ✅ Complete | Vehicle CRUD with modals |
| Shift Templates | ✅ Complete | Template builder with duty blocks/lines, visual Gantt preview |
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
    ├── src/
    │   ├── index.ts        # Main router, CORS, helpers
    │   ├── routes/
    │   │   ├── employees.ts
    │   │   ├── vehicles.ts
    │   │   ├── shifts.ts   # Shift templates with blocks/lines
    │   │   ├── roster.ts   # Roster containers + day view + assignments
    │   │   ├── dispatch.ts
    │   │   └── config.ts
    │   └── db/
    │       ├── schema.sql
    │       ├── migration_duty_blocks.sql
    │       ├── migration_rosters.sql
    │       └── various other migrations
    └── (deployed to Cloudflare Workers)
```

## Development Workflow

### Frontend Changes
```bash
cd dispatch-app
git add .
git commit -m "description"
git push
# Auto-deploys to Cloudflare Pages in ~30 seconds
```

### Backend Changes
```bash
cd dispatch-app/workers
npx wrangler deploy
```

### Database Migrations
```bash
cd dispatch-app/workers
npx wrangler d1 execute dispatch-db --remote --file=src/db/migration_name.sql
```

## Key Design Decisions

1. **Single HTML File**: All frontend code in one file for simplicity. CSS at top, HTML in middle, JS at bottom.

2. **Duty Blocks vs Duty Lines**: 
   - Blocks are the assignable units (what gets dragged to drivers)
   - Lines are time segments within blocks (for detailed scheduling)

3. **Roster Day View**: 
   - API returns all blocks categorized as `unassigned` or `by_driver`
   - Frontend groups unassigned by shift (each shift = own row)
   - Prevents visual overlap of blocks

4. **Soft Deletes**: All deletions set `deleted_at` timestamp, never hard delete.

5. **Decimal Time**: Times stored as decimal hours (6.5 = 06:30) for easy math.

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

1. **Dispatch Screen**: Not yet implemented
2. **Vehicle Assignment**: Currently at entry level, not line level
3. **Leave/Availability**: Employee daily status not yet integrated
4. **Real-time Updates**: No WebSocket/polling yet
5. **Authentication**: Not implemented (open access)
6. **Mobile**: Not optimized for mobile screens

## Next Steps (Suggested)

1. Build Dispatch screen (daily operations view)
2. Add vehicle assignment at duty line level
3. Implement employee leave/availability display
4. Add copy roster week functionality
5. Build reporting/exports

## Default Data

**Duty Types:**
- Driving (blue), Out of Vehicle (amber), Meal Break (green)
- Waiting (gray), Charter (purple), Dead Running (red)

**Pay Types:**
- Standard (1.0x), Overtime (1.5x), Double Time (2.0x)
- Penalty Rate (1.25x), Allowance (1.0x), Unpaid (0x)
