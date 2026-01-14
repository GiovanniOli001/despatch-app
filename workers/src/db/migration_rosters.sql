-- ============================================
-- MIGRATION: Rosters Container
-- Adds rosters table as container for roster_entries
-- ============================================

-- ============================================
-- ROSTERS (date range containers)
-- ============================================
CREATE TABLE IF NOT EXISTS rosters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,           -- YYYY-MM-DD
  end_date TEXT NOT NULL,             -- YYYY-MM-DD
  status TEXT DEFAULT 'draft',        -- 'draft', 'published', 'archived'
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_rosters_tenant ON rosters(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_rosters_dates ON rosters(start_date, end_date);

-- ============================================
-- Update roster_entries to link to rosters
-- ============================================
-- Add roster_id column if it doesn't exist
ALTER TABLE roster_entries ADD COLUMN roster_id TEXT REFERENCES rosters(id);

-- Create index for roster lookup
CREATE INDEX IF NOT EXISTS idx_roster_entries_roster ON roster_entries(roster_id, date);
