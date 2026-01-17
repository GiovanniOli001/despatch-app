---
name: dispatch-architecture
description: Deep knowledge of the Dispatch App architecture, data flow, and component relationships. Use when explaining how the app works, understanding feature interactions, or planning new features.
allowed-tools: Read, Glob, Grep
user-invocable: true
---

# Dispatch App Architecture Knowledge

## Application Overview

The Dispatch App is a bus and coach operations system with these core modules:

```
┌─────────────────────────────────────────────────────────────┐
│                      DISPATCH APP                           │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│   HRM    │ Vehicles │  Shifts  │  Roster  │    Dispatch    │
│ (hrm.js) │(vehicles)│(shifts.js│(roster.js│  (dispatch.js) │
├──────────┴──────────┴──────────┴──────────┴────────────────┤
│                    API Layer (api.js)                       │
├─────────────────────────────────────────────────────────────┤
│              Cloudflare Workers (TypeScript)                │
├─────────────────────────────────────────────────────────────┤
│                  Cloudflare D1 (SQLite)                     │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Shift Template → Roster → Dispatch

```
shift_templates          Create reusable shift definitions
       │
       ▼
shift_template_duty_blocks   Group duties into blocks
       │
       ▼
shift_template_duty_lines    Define individual duty lines
       │
       │ (PUBLISH)
       ▼
roster_entries           Assign shifts to dates/drivers
       │
       ▼
roster_duty_lines        Instance-level duty data (copied from template)
       │
       │ (SCHEDULE ON CALENDAR)
       ▼
dispatch view            Daily operations view
```

### Adhoc Shifts (Separate Path)

```
dispatch_adhoc_shifts        Standalone shifts (no template)
       │
       ▼
dispatch_adhoc_duty_lines    Duty lines for adhoc shifts
```

## Key Relationships

### Roster States
- **Draft**: Editable, not on calendar
- **Published**: Locked, creates roster_duty_lines from templates
- **Scheduled**: On calendar, appears in dispatch

### Duty Line Sources
- `source_duty_line_id IS NOT NULL`: From template (can be recreated)
- `source_duty_line_id IS NULL`: User-added inline (must preserve)

### Lockout Matrix
| Roster State | Edit Template | Edit Roster | Delete Roster |
|--------------|---------------|-------------|---------------|
| Draft        | Yes           | Yes         | Yes           |
| Published    | No            | No          | Yes           |
| Scheduled    | No            | No          | No            |

## Module Responsibilities

### HRM (hrm.js)
- Employee CRUD
- Custom fields with layout designer
- Pay type assignment

### Vehicles (vehicles.js)
- Vehicle fleet management
- Capacity tracking

### Shifts (shifts.js)
- Shift template CRUD
- Duty block management
- Duty line configuration

### Roster (roster.js)
- Roster container CRUD
- Gantt-style assignment view
- Publish/unpublish workflow
- Calendar scheduling

### Dispatch (dispatch.js)
- Daily operations view
- Driver and vehicle timelines
- Inline duty editing
- Adhoc shift creation
- Duty cancellation
- Pay commit system
