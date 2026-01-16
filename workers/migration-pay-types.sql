-- Migration: Pay Types Table
-- Date: January 16, 2026
-- Phase 1 of Pay Management System

-- Create pay_types table
CREATE TABLE IF NOT EXISTS pay_types (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  hourly_rate REAL NOT NULL,
  multiplier REAL DEFAULT 1.0,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Create index for tenant queries
CREATE INDEX IF NOT EXISTS idx_pay_types_tenant ON pay_types(tenant_id, deleted_at);

-- Seed default pay types
INSERT OR IGNORE INTO pay_types (id, tenant_id, code, name, hourly_rate, multiplier, display_order, is_active, created_at, updated_at)
VALUES 
  ('pt_std_001', 'default', 'STD', 'Standard', 32.00, 1.0, 1, 1, datetime('now'), datetime('now')),
  ('pt_ot_001', 'default', 'OT', 'Overtime', 48.00, 1.5, 2, 1, datetime('now'), datetime('now')),
  ('pt_dt_001', 'default', 'DT', 'Double Time', 64.00, 2.0, 3, 1, datetime('now'), datetime('now')),
  ('pt_pen_001', 'default', 'PEN', 'Penalty Rate', 40.00, 1.25, 4, 1, datetime('now'), datetime('now'));
