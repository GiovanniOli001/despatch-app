# Dispatch App

**Version:** 0.5.0  
**Last Updated:** January 15, 2025  
**Status:** MVP Development

## Overview

A bus/coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch operations.

**Tech Stack:**
- **Frontend:** Single-page vanilla JS app, deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite)

**Live URLs:**
- **Frontend:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

---

## Workflow Summary

```
CREATE SHIFTS → ASSIGN TO ROSTER → VIEW IN DISPATCH
     │                │                    │
     ▼                ▼                    ▼
Shift Templates   Roster (date range)   Daily operations
with Duty Blocks  with shift entries    Gantt view
```

---

## Data Model

### Complete Hierarchy

```
SHIFT TEMPLATE (e.g. "AM-01 Morning Route")
│   - code, name, type (regular/charter/school)
│
├── DUTY BLOCK "City Run" ← Assignable to a Driver
│   │   - driver_id: Pre-assigned driver (optional)
│   │
│   ├── LINE: 06:00-07:00 | Driving | Bus-101 | STD
│   ├── LINE: 07:00-07:30 | Break   | —       | UNP  
│   └── LINE: 07:30-09:00 | Driving | Bus-101 | STD
│
└── DUTY BLOCK "Suburbs Run"
    └── ... more lines

ROSTER (e.g. "Week 1 January 2025")
│   - code, name, start_date, end_date, status
│
├── DAY: 2025-01-06 (Monday)
│   ├── ROSTER ENTRY: "AM-01 - City Run" → Driver A
│   │   └── Duties (from template lines)
│   └── ROSTER ENTRY: "AM-01 - Suburbs Run" → Driver B
│
├── DAY: 2025-01-07 (Tuesday)
│   └── ... more entries
│
└── ... more days

OPERATIONS CALENDAR
│   - View rosters across time periods
│   └── Links to roster details
```

### Key Concepts

| Concept | Description | Level |
|---------|-------------|-------|
| **Shift Template** | Reusable work definition | Template |
| **Duty Block** | Assignable unit within shift | Template |
| **Duty Line** | Time segment with vehicle/pay | Template |
| **Roster** | Date range container | Schedule |
| **Roster Entry** | Shift assigned to a date/driver | Schedule |
| **Roster Duty** | Instantiated duty line | Schedule |

---

## Database Schema

### Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `tenants` | Multi-tenancy | ✅ |
| `depots` | Operating locations | ✅ |
| `employees` | Drivers and staff | ✅ Full CRUD |
| `vehicles` | Fleet vehicles | ✅ Full CRUD |
| `duty_types` | Driving, break, etc. | ✅ Seeded |
| `pay_types` | STD, OT, DT, etc. | ✅ Seeded |
| `shift_templates` | Shift definitions | ✅ Full CRUD |
| `shift_template_duty_blocks` | Duty blocks | ✅ |
| `shift_template_duty_lines` | Time segments | ✅ |
| `rosters` | Date range containers | ✅ NEW |
| `roster_entries` | Shifts on dates | ✅ |
| `roster_duties` | Instantiated duties | ✅ |

### Duty Blocks Schema

```sql
shift_template_duty_blocks (
  id, shift_template_id, sequence, name, driver_id
)

shift_template_duty_lines (
  id, duty_block_id, sequence, start_time, end_time,
  duty_type, description, vehicle_id, pay_type
)
```

### Rosters Schema

```sql
rosters (
  id, tenant_id, code, name, start_date, end_date, status, notes
)

roster_entries (
  id, tenant_id, roster_id, shift_template_id, date, name,
  start_time, end_time, driver_id, vehicle_id, status
)
```

---

## API Endpoints

### Employees ✅
```
GET/POST   /api/employees
GET/PUT/DELETE /api/employees/:id
```

### Vehicles ✅
```
GET/POST   /api/vehicles
GET/PUT/DELETE /api/vehicles/:id
```

### Shift Templates ✅
```
GET    /api/shifts                    - List
GET    /api/shifts/:id                - Get with duty_blocks
POST   /api/shifts                    - Create with duty_blocks
PUT    /api/shifts/:id                - Update
DELETE /api/shifts/:id                - Soft delete
POST   /api/shifts/:id/duplicate      - Copy
```

### Rosters ✅ NEW
```
GET    /api/roster/containers         - List rosters
GET    /api/roster/containers/:id     - Get roster with entries
POST   /api/roster/containers         - Create roster
PUT    /api/roster/containers/:id     - Update roster
DELETE /api/roster/containers/:id     - Soft delete
POST   /api/roster/containers/:id/add-shift - Add shift to roster day
```

### Roster Entries
```
GET    /api/roster                    - List entries
GET    /api/roster/date/:date         - Get day
GET    /api/roster/week/:date         - Get week
POST   /api/roster                    - Create entry
PUT    /api/roster/:id                - Update
DELETE /api/roster/:id                - Remove
```

---

## Frontend Screens

| Screen | Status | Description |
|--------|--------|-------------|
| **Dispatch** | ✅ Prototype | Gantt timeline (fake data) |
| **HRM** | ✅ Full CRUD | Employee management |
| **Vehicles** | ✅ Full CRUD | Fleet management |
| **Shift Templates** | ✅ Full CRUD | Duty block editor with driver/vehicle |
| **Roster** | 🔲 In Progress | Gantt-style shift assignment |
| **Operations Calendar** | 🔲 Planned | Roster overview |

---

## Project Structure

```
despatch-app/
├── PROJECT.md
├── frontend/
│   └── index.html
└── workers/
    ├── wrangler.toml
    └── src/
        ├── index.ts
        ├── db/
        │   ├── schema.sql
        │   ├── migration_duty_blocks.sql
        │   └── migration_rosters.sql
        └── routes/
            ├── employees.ts
            ├── vehicles.ts
            ├── shifts.ts
            ├── roster.ts
            ├── dispatch.ts
            └── config.ts
```

---

## Development Commands

### Local Repository
```
C:\Users\Giovanni\Downloads\despatch-app
```

### Deploy API
```bash
cd C:\Users\Giovanni\Downloads\despatch-app\workers
npx wrangler deploy
```

### Run Migrations
```bash
cd C:\Users\Giovanni\Downloads\despatch-app\workers
npx wrangler d1 execute dispatch-db --remote --file=C:\Users\Giovanni\Downloads\despatch-app\workers\src\db\migration_duty_blocks.sql
npx wrangler d1 execute dispatch-db --remote --file=C:\Users\Giovanni\Downloads\despatch-app\workers\src\db\migration_rosters.sql
```

### Push to GitHub
```bash
cd C:\Users\Giovanni\Downloads\despatch-app
git add .
git commit -m "message"
git push
```

---

## Roadmap

### ✅ Phase 1: Core Infrastructure
- [x] API deployed
- [x] Database schema
- [x] Employee CRUD
- [x] Vehicle CRUD

### ✅ Phase 2: Shift Templates
- [x] Shift template CRUD
- [x] Duty block structure
- [x] Driver assignment per block
- [x] Vehicle/pay per line

### 🔲 Phase 3: Roster (In Progress)
- [x] Roster container API
- [x] Add shift to roster API
- [ ] Roster list UI
- [ ] Roster Gantt view
- [ ] Drag-and-drop assignment
- [ ] Overlap prevention
- [ ] Leave placeholder
- [ ] Public holidays awareness

### 🔲 Phase 4: Operations Calendar
- [ ] Calendar view
- [ ] Roster assignment to periods
- [ ] Summary view with links

### 🔲 Phase 5: Connect Dispatch
- [ ] Replace fake data with roster data
- [ ] Real-time editing

---

## Architecture Notes

### Decimal Time Format
Times stored as decimal hours: 6.5 = 06:30, 14.25 = 14:15

### Shift → Roster Flow
When adding a shift to a roster:
1. Each duty block becomes a roster_entry
2. Each duty line becomes a roster_duty
3. Driver/vehicle assignments carry over or can be overridden

### Overlap Prevention
API checks for driver conflicts when assigning shifts to roster dates.

---

## Contact

Repository: https://github.com/GiovanniOli001/despatch-app
