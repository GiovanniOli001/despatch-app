-- Migration: Phase 3 - Dispatch Commit & Pay Records (clean version)
-- Date: January 16, 2026
-- Note: Drops and recreates tables to ensure clean state

-- Drop existing tables if any (in reverse dependency order)
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS employee_pay_records;
DROP TABLE IF EXISTS dispatch_commits;

-- Track committed dispatch dates
CREATE TABLE dispatch_commits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  commit_date TEXT NOT NULL,
  scope TEXT NOT NULL,
  employee_id TEXT,
  committed_by TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX idx_dispatch_commits_date ON dispatch_commits(tenant_id, commit_date);

-- Employee pay records (generated on commit)
CREATE TABLE employee_pay_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  shift_template_id TEXT,
  shift_name TEXT,
  duty_block_id TEXT,
  duty_name TEXT,
  pay_type_id TEXT,
  pay_type_code TEXT,
  hours REAL NOT NULL,
  rate REAL NOT NULL,
  total_amount REAL NOT NULL,
  source_duty_line_id TEXT,
  source_type TEXT DEFAULT 'roster',
  is_manual INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_pay_records_employee ON employee_pay_records(tenant_id, employee_id, work_date);
CREATE INDEX idx_pay_records_date ON employee_pay_records(tenant_id, work_date);

-- Audit log for tracking changes
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_date ON audit_log(tenant_id, changed_at);
