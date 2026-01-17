---
paths:
  - "workers/src/db/**/*.sql"
  - "schema-reference.sql"
---

# Database Rules

## Schema Changes

### Before Any Schema Change
1. Backup current data if needed
2. Test on local development first
3. Use ALTER TABLE for additive changes
4. Update schema-reference.sql after changes

### Migration Files
- Location: `workers/src/db/*.sql`
- Name format: `migration_description.sql`
- Include rollback comments if applicable

## Query Patterns

### Soft Deletes
Most tables use soft deletes:
```sql
-- Mark as deleted
UPDATE table_name SET deleted_at = datetime('now') WHERE id = ?

-- Query active records only
SELECT * FROM table_name WHERE deleted_at IS NULL
```

### Multi-Tenant
Always include tenant_id:
```sql
INSERT INTO table (id, tenant_id, ...) VALUES (?, 'default', ...)
SELECT * FROM table WHERE tenant_id = 'default' AND deleted_at IS NULL
```

## Foreign Key Relationships

Delete child records before parent records:
1. roster_duty_lines
2. roster_entries
3. rosters
4. shift_template_duty_lines
5. shift_template_duty_blocks
6. shift_templates
