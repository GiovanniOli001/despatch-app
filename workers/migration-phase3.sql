-- Migration: Phase 3 - Dispatch Commit & Pay Records
-- Date: January 16, 2026

-- Track committed dispatch dates
CREATE TABLE IF NOT EXISTS dispatch_commits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  commit_date TEXT NOT NULL,
  scope TEXT NOT NULL,                -- 'all' or 'individual'
  employee_id TEXT,                   -- NULL if scope='all', employee_id if individual
  committed_by TEXT NOT NULL,         -- who performed the commit
  committed_at TEXT NOT NULL,         -- timestamp
  notes TEXT,
  UNIQUE(tenant_id, commit_date, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_commits_date ON dispatch_commits(tenant_id, commit_date);

-- Employee pay records (generated on commit)
CREATE TABLE IF NOT EXISTS employee_pay_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  shift_template_id TEXT,
  shift_name TEXT,                    -- Denormalized for history
  duty_block_id TEXT,
  duty_name TEXT,                     -- Denormalized for history
  pay_type_id TEXT,
  pay_type_code TEXT,                 -- Denormalized
  hours REAL NOT NULL,
  rate REAL NOT NULL,                 -- Rate at time of commit
  total_amount REAL NOT NULL,         -- hours * rate
  source_duty_line_id TEXT,           -- Link back to roster_duty_lines
  source_type TEXT DEFAULT 'roster',  -- 'roster' or 'adhoc'
  is_manual INTEGER DEFAULT 0,        -- 1 if manually adjusted
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pay_records_employee ON employee_pay_records(tenant_id, employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_pay_records_date ON employee_pay_records(tenant_id, work_date);

-- Audit log for tracking changes
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,          -- 'employee', 'pay_record', 'dispatch_commit', etc.
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,               -- 'create', 'update', 'delete'
  field_name TEXT,                    -- Which field changed
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_date ON audit_log(tenant_id, changed_at);
