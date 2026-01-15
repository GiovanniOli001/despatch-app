-- Migration: Dispatch Duty Cancellations
-- Date: 2026-01-15
-- Purpose: Track cancelled duty lines at dispatch level without affecting roster data

CREATE TABLE IF NOT EXISTS dispatch_duty_cancellations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  roster_duty_line_id TEXT NOT NULL,
  reason TEXT,
  cancelled_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for fast lookup when loading dispatch day
CREATE INDEX IF NOT EXISTS idx_duty_cancellations_line 
  ON dispatch_duty_cancellations(roster_duty_line_id);

-- Index for tenant isolation
CREATE INDEX IF NOT EXISTS idx_duty_cancellations_tenant 
  ON dispatch_duty_cancellations(tenant_id);
