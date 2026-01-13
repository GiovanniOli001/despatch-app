# Dispatch App

**Version:** 0.2.0  
**Last Updated:** January 15, 2025  
**Status:** MVP Development - Dispatch Prototype Integrated

## Overview

A bus/coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch operations.

Built with:
- **Frontend:** Single-page vanilla JS app (prototype-based), deployed on Cloudflare Pages
- **Backend:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite)

## Live URLs

- **Frontend:** https://despatch-app.pages.dev/
- **API:** https://dispatch-api.oliveri-john001.workers.dev

## Current State

The app is built from the dispatch prototype (`despatch_0.0.0.html`) which has been integrated as the main application. The dispatch screen retains all prototype functionality with fake generated data, while HRM and Vehicles screens now connect to the real API.

### What's Working

| Feature | Status | Data Source |
|---------|--------|-------------|
| **Dispatch Screen** | ✅ Full prototype | Fake data (104 drivers, 80 vehicles) |
| **HRM Screen** | ✅ Full CRUD | Real API |
| **Vehicles Screen** | ✅ Full CRUD | Real API |
| **Shift Templates** | 🔲 Placeholder | — |
| **Roster** | 🔲 Placeholder | — |
| **Other Screens** | 🔲 Placeholder | — |

### Dispatch Screen Features (from prototype)

- Driver/Vehicle Gantt timeline with multiple visual styles (A-E)
- Horizontal and vertical view modes
- Driver-centric and vehicle-centric allocation modes
- Sidebar with full duty management:
  - Inline time editing (start/end)
  - Duty type selection
  - Vehicle assignment per duty
  - Pay type selection per duty
  - Hours tracking with shift totals
  - Insert duty above/below with arrows
  - Delete duties
- Transfer shifts between drivers
- Unassign shifts back to unassigned pool
- Bulk assign vehicles to all duties
- Filter/search/sort on all sections
- Resizable sections
- Smart suggestions for nearby jobs
- Batman AI assistant integration

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cloudflare    │     │   Cloudflare    │     │   Cloudflare    │
│     Pages       │────▶│    Workers      │────▶│       D1        │
│   (Frontend)    │     │   (API)         │     │   (Database)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Core Concepts

### Data Flow (Target Architecture)
```
Shift Templates    →    Roster Entries    →    Dispatch View
(What work looks)       (When + Who)           (Daily operations)
```

- **Shift Template:** Reusable definition of a shift (start time, end time, duties)
- **Roster Entry:** A shift scheduled on a specific date, optionally assigned to a driver/vehicle
- **Dispatch:** The daily view showing all roster entries for today

**Note:** Dispatch currently uses fake generated data. Integration with real roster data is next phase.

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenancy support (single tenant for MVP) |
| `depots` | Operating locations/bases |
| `employees` | Drivers and staff |
| `employee_daily_status` | Leave, availability per day |
| `vehicles` | Fleet vehicles |
| `vehicle_daily_status` | Maintenance status per day |
| `customers` | Charter customers |
| `routes` | Regular service routes |
| `duty_types` | Configurable duty types (driving, break, etc.) |
| `pay_types` | Pay categories (standard, overtime, etc.) |
| `shift_templates` | Reusable shift definitions |
| `shift_template_duties` | Duties within a template (offset-based) |
| `roster_entries` | Scheduled shifts on specific dates |
| `roster_duties` | Actual duties for a roster entry |
| `locations` | Pickup/dropoff locations |
| `audit_log` | Change tracking |

## API Endpoints

### Health
- `GET /api/health` - API status check

### Employees ✅ Connected to UI
- `GET /api/employees` - List (with search, status, role filters)
- `GET /api/employees/:id` - Get single employee
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Soft delete

### Vehicles ✅ Connected to UI
- `GET /api/vehicles` - List (with search, capacity filters)
- `GET /api/vehicles/:id` - Get single vehicle
- `POST /api/vehicles` - Create vehicle
- `PUT /api/vehicles/:id` - Update vehicle
- `DELETE /api/vehicles/:id` - Soft delete

### Shift Templates (API ready, UI placeholder)
- `GET /api/shifts` - List templates
- `GET /api/shifts/:id` - Get template with duties
- `POST /api/shifts` - Create template
- `PUT /api/shifts/:id` - Update template
- `DELETE /api/shifts/:id` - Soft delete

### Roster (API ready, UI placeholder)
- `GET /api/roster` - List entries
- `GET /api/roster/date/:date` - Get single day with all duties
- `POST /api/roster` - Create entry
- `PUT /api/roster/:id` - Update entry
- `DELETE /api/roster/:id` - Remove entry

### Dispatch (API ready, UI uses fake data)
- `GET /api/dispatch/:date` - Full day data for dispatch view

### Config
- `GET /api/config/duty-types` - List duty types
- `GET /api/config/pay-types` - List pay types

## Frontend Screens

| Screen | Status | Description |
|--------|--------|-------------|
| Dispatch | ✅ Full prototype | Gantt timeline, sidebar duty management (fake data) |
| HRM | ✅ Full CRUD | Employee list, search/filter, add/edit/delete modals |
| Vehicles | ✅ Full CRUD | Vehicle list, search/filter, add/edit/delete modals |
| Operations Calendar | 🔲 Placeholder | Week/month view |
| Charters | 🔲 Placeholder | Charter bookings |
| Customers | 🔲 Placeholder | Customer management |
| Shift Templates | 🔲 Placeholder | Template builder |
| Roster | 🔲 Placeholder | Schedule management |
| Maintenance | 🔲 Placeholder | Vehicle maintenance |

## Project Structure

```
dispatch-app/
├── PROJECT.md              # This file
├── frontend/
│   └── index.html          # Single-page app (all HTML/CSS/JS inline, ~9500 lines)
└── workers/
    ├── package.json
    ├── wrangler.toml       # Cloudflare config
    └── src/
        ├── index.ts        # Main router
        ├── db/
        │   └── schema.sql  # Database schema
        └── routes/
            ├── employees.ts
            ├── vehicles.ts
            ├── shifts.ts
            ├── roster.ts
            ├── dispatch.ts
            └── config.ts
```

**Note:** The frontend is a single `index.html` file containing all HTML, CSS, and JavaScript inline (~9500 lines). This was ported from the dispatch prototype.

## Development Workflow

### Making Changes

1. Edit files locally or on GitHub
2. Push to GitHub:
   ```
   git add .
   git commit -m "description"
   git push
   ```
3. Cloudflare auto-deploys (~30 seconds)

### Database Changes

```bash
cd workers
npx wrangler d1 execute dispatch-db --remote --file=src/db/schema.sql
```

## Roadmap

### Phase 1: Core Infrastructure ✅ Complete
- [x] Cloudflare Workers API deployed
- [x] D1 database with full schema
- [x] All API endpoints implemented
- [x] Dispatch prototype integrated as main app
- [x] HRM screen with full CRUD
- [x] Vehicles screen with full CRUD

### Phase 2: Shift Templates & Roster (Next)
- [ ] Shift Templates screen - create/edit templates with duties
- [ ] Roster screen - week view with assignments
- [ ] Create roster entries from templates

### Phase 3: Connect Dispatch to Real Data
- [ ] Replace fake data generation with API calls
- [ ] Persist duty changes to database
- [ ] Real driver/vehicle assignment

### Phase 4: Polish & Advanced
- [ ] Authentication
- [ ] Charters module
- [ ] Reporting

## Default Data

The schema seeds these defaults:

**Duty Types:** Driving, Out of Vehicle, Meal Break, Waiting, Charter, Dead Running

**Pay Types:** Standard (1.0x), Overtime (1.5x), Double Time (2.0x), Penalty Rate (1.25x), Allowance (1.0x), Unpaid (0x)

**Depot:** Main Depot (default)
