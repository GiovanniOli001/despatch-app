-- Migration: Create adhoc shift tables
-- Date: 2026-01-16

CREATE TABLE IF NOT EXISTS dispatch_adhoc_shifts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  date TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'ADHOC',
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  vehicle_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS dispatch_adhoc_duty_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  adhoc_shift_id TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  duty_type TEXT NOT NULL DEFAULT 'driving',
  description TEXT,
  vehicle_id TEXT,
  pay_type TEXT NOT NULL DEFAULT 'STD',
  location_name TEXT,
  location_lat REAL,
  location_lng REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
