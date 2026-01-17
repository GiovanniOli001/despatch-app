# Dispatch App - Claude Code Configuration

Bus and coach dispatch operations system for managing drivers, vehicles, shifts, rosters, and daily dispatch.

## Project Overview

- **Live App:** https://despatch-app.pages.dev/
- **Live API:** https://dispatch-api.oliveri-john001.workers.dev
- **User:** John (Windows PC, Brisbane QLD Australia)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla JS (modular files) → Cloudflare Pages |
| Backend | TypeScript → Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Geocoding | Nominatim (OpenStreetMap) |

## Project Structure

```
dispatch-app/
├── frontend/
│   ├── index.html              # HTML shell + modals
│   ├── css/main.css            # All styles (~4,700 lines)
│   └── js/
│       ├── api.js              # API client
│       ├── app.js              # Constants, navigation, utilities
│       ├── dispatch.js         # Dispatch screen (~8,000 lines)
│       ├── hrm.js              # Employees + custom fields
│       ├── vehicles.js         # Vehicle CRUD
│       ├── shifts.js           # Shift templates
│       └── roster.js           # Roster + calendar
├── workers/
│   ├── wrangler.toml           # Cloudflare Workers config
│   └── src/
│       ├── index.ts            # Main router, CORS, helpers
│       └── routes/
│           ├── employees.ts
│           ├── employee-fields.ts
│           ├── vehicles.ts
│           ├── shifts.ts
│           ├── roster.ts
│           ├── dispatch.ts
│           ├── dispatch-commit.ts
│           ├── ops-calendar.ts
│           ├── pay-types.ts
│           └── config.ts
├── PROJECT-MD.txt              # Complete technical documentation
├── README.md                   # Quick reference
└── schema-reference.sql        # Database schema reference
```

## Build & Deploy Commands

### Backend (Cloudflare Workers)
```bash
cd workers
npx tsc --noEmit          # Type check (ALWAYS run before deploy)
npx wrangler deploy       # Deploy to production
npx wrangler tail         # Monitor logs
```

### Frontend (Cloudflare Pages)
```bash
git add .
git commit -m "feat: your message"
git push                  # Auto-deploys in ~30 seconds
```

## Git Commit Convention

Use semantic commit messages following the Conventional Commits specification.

### Format
```
<type>(<scope>): <description>

[optional body]
```

### Types
| Type | Description |
|------|-------------|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting, whitespace (no code change) |
| `refactor` | Code restructuring (no feature/fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance, dependencies, config |

### Scopes (optional)
- `frontend` - Frontend changes
- `backend` - Backend/API changes
- `db` - Database/schema changes
- `ui` - UI/styling changes
- `api` - API endpoint changes

### Examples
```
feat(frontend): add dark mode toggle
fix(backend): correct pay type hourly rate calculation
docs: update API endpoint reference
refactor(dispatch): extract duty line validation
chore: update wrangler dependencies
```

### Database Operations
```bash
# Verify schema
npx wrangler d1 execute dispatch-db --remote --command="PRAGMA table_info(table_name);"

# Export schema
npx wrangler d1 execute dispatch-db --remote --command=".schema" > schema-output.txt
```

## Code Style Guidelines

### General
- Use 2-space indentation
- Prefer async/await over callbacks
- Always include tenant_id in database INSERT statements
- Check NOT NULL constraints before INSERT operations
- Use decimal hours for time (6.5 = 06:30)

### Frontend (Vanilla JS)
- Functions use camelCase
- DOM IDs use camelCase or kebab-case
- Use `escapeHtml()` for user-provided content
- Use `showToast(message, isError)` for notifications
- Use `showConfirmModal()` instead of browser `confirm()`
- Use `apiRequest()` from api.js for all API calls

### Backend (TypeScript)
- Use the helper functions from index.ts: `json()`, `error()`, `uuid()`, `parseBody()`
- Always return proper CORS headers
- Log errors with `console.error('API Error:', err)`

## Important Business Rules

### Roster State Management
- **Roster assignments** (driver_id on roster_entries) are USER-CONTROLLED
- **Clear Despatch** removes calendar scheduling but PRESERVES roster assignments
- **Unpublish** reverts to draft but PRESERVES roster assignments and user-added duties
- **Remove from calendar** only clears calendar dates, preserves everything else

### Inline Duties
- Users can add duties in Dispatch using + buttons
- These create `roster_duty_lines` with `source_duty_line_id = NULL`
- Unpublish MUST preserve these (only delete where source_duty_line_id IS NOT NULL)
- Republish recreates template duties while keeping user-added ones

### Lockout Logic
- **Published rosters:** Cannot edit shift templates, cannot open roster for editing
- **Scheduled rosters:** Cannot delete, cannot open for editing
- Both frontend and backend enforce lockouts

### Adhoc Shifts
- Standalone shifts created in dispatch (not from templates)
- Stored in `dispatch_adhoc_shifts` and `dispatch_adhoc_duty_lines` tables
- Do NOT create fake roster/template records

## Database Schema Notes

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

### Important Column Notes
- `source_duty_line_id` in roster_duty_lines: NULL = user-added, NOT NULL = from template
- `employee_id` (not driver_id) in dispatch_adhoc_shifts
- `roster_duty_line_id` (not duty_line_id) in dispatch_duty_cancellations
- `commit_date` (not date) in dispatch_commits
- `work_date` (not date) in employee_pay_records
- `hourly_rate` (not multiplier) in pay_types
- `display_order` (not sort_order) in pay_types

### Foreign Key Deletion Order
When purging data, delete in this order:
1. roster_duty_lines → roster_entries → rosters
2. shift_template_duty_lines → shift_template_duty_blocks → shift_templates
3. dispatch_adhoc_duty_lines → dispatch_adhoc_shifts

## API Endpoints Reference

### Pay Types
- `GET /api/pay-types` - List all pay types
- `POST /api/pay-types` - Create pay type
- `PUT /api/pay-types/:id` - Update pay type

**Note:** Endpoint is `/pay-types` NOT `/config/pay-types`

### Dispatch
- `GET /api/dispatch/:date` - Get day's dispatch data
- `POST /api/dispatch/commit` - Commit day to payroll
- `POST /api/dispatch/create-duty-line` - Create inline duty
- `POST /api/dispatch/update-duty-line` - Update duty
- `POST /api/dispatch/cancel-duty-line` - Cancel duty
- `POST /api/dispatch/create-adhoc-shift` - Create adhoc shift

### Roster
- `GET /api/roster/containers` - List rosters
- `GET /api/roster/containers/:id` - Get roster
- `POST /api/roster/containers` - Create roster
- `PUT /api/roster/containers/:id` - Update roster
- `DELETE /api/roster/containers/:id` - Delete roster (with lockout checks)
- `POST /api/roster/containers/:id/publish` - Publish
- `POST /api/roster/containers/:id/unpublish` - Unpublish
- `POST /api/roster/containers/:id/schedule` - Add to calendar
- `POST /api/roster/containers/:id/unschedule` - Remove from calendar

## Reference Files

See @PROJECT-MD.txt for complete technical documentation.
See @schema-reference.sql for full database schema.
See @README.md for quick start guide.
