---
paths:
  - "workers/**/*.ts"
---

# Backend Development Rules

## Before Making Changes
1. Read the current file content first
2. Check schema-reference.sql for table structures
3. Verify column names match the schema exactly

## Database Operations

### Always Include
- `tenant_id = 'default'` in all INSERT statements
- `deleted_at IS NULL` in SELECT WHERE clauses
- Parameterized queries (never string concatenation)

### Column Name Verification
These column names are commonly mistaken:
- Use `employee_id` not `driver_id` in dispatch_adhoc_shifts
- Use `roster_duty_line_id` not `duty_line_id` in dispatch_duty_cancellations
- Use `commit_date` not `date` in dispatch_commits
- Use `work_date` not `date` in employee_pay_records
- Use `hourly_rate` not `multiplier` in pay_types
- Use `display_order` not `sort_order` in pay_types

## Response Patterns

```typescript
// Success response
return json({ success: true, data: result });

// Error response
return error('Error message', 400);

// List response
return json({ items: results });
```

## Pre-Deploy Checklist
1. Run `npx tsc --noEmit`
2. Fix any type errors
3. Test endpoint manually if possible
4. Deploy with `npx wrangler deploy`
