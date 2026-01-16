-- Migration: Phase 2 - Remove multiplier, add employee pay type
-- Date: January 16, 2026

-- Recreate pay_types without multiplier
DROP TABLE IF EXISTS pay_types;

CREATE TABLE pay_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hourly_rate REAL NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_pay_types_tenant ON pay_types(tenant_id, deleted_at);

-- Seed default pay types
INSERT INTO pay_types (id, tenant_id, code, name, hourly_rate, display_order, is_active, created_at, updated_at)
VALUES 
  ('pt_std_001', 'default', 'STD', 'Standard', 32.00, 1, 1, datetime('now'), datetime('now')),
  ('pt_ot_001', 'default', 'OT', 'Overtime', 48.00, 2, 1, datetime('now'), datetime('now')),
  ('pt_dt_001', 'default', 'DT', 'Double Time', 64.00, 3, 1, datetime('now'), datetime('now')),
  ('pt_pen_001', 'default', 'PEN', 'Penalty Rate', 40.00, 4, 1, datetime('now'), datetime('now'));

-- Add default pay type to employees
ALTER TABLE employees ADD COLUMN default_pay_type_id TEXT REFERENCES pay_types(id);
