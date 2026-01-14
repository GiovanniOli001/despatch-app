-- Safe migration: Create rosters table if it doesn't exist
-- Run this if getting "no such table: rosters" error

CREATE TABLE IF NOT EXISTS rosters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_rosters_tenant ON rosters(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_rosters_dates ON rosters(start_date, end_date);
