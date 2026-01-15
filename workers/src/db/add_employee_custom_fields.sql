-- Employee Custom Fields Migration
-- Run this to add custom field support to HRM

-- Field definitions (tenant-wide)
CREATE TABLE IF NOT EXISTS employee_custom_field_definitions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    field_name TEXT NOT NULL,           -- Display name: "Training Date"
    field_key TEXT NOT NULL,            -- Unique key: "training_date"
    field_type TEXT NOT NULL,           -- text, number, date, select, boolean
    field_options TEXT,                 -- JSON for select options: ["Option1", "Option2"]
    is_required INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    tab_name TEXT DEFAULT 'Custom',     -- Which tab to display on
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(tenant_id, field_key)
);

-- Field values per employee
CREATE TABLE IF NOT EXISTS employee_custom_field_values (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    field_definition_id TEXT NOT NULL REFERENCES employee_custom_field_definitions(id),
    value TEXT,                         -- Stored as text, parsed by field type
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(employee_id, field_definition_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_field_values_employee ON employee_custom_field_values(employee_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_definition ON employee_custom_field_values(field_definition_id);
