-- ============================================
-- Charter Journeys Migration
-- ============================================
-- Adds journey-level detail below trips
-- A trip can now have multiple journeys (pickup → dropoff segments)
-- ============================================

CREATE TABLE IF NOT EXISTS charter_journeys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  trip_id TEXT NOT NULL REFERENCES charter_trips(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 1,
  pickup_name TEXT,
  pickup_address TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  pickup_time TEXT,  -- HH:MM format
  dropoff_name TEXT,
  dropoff_address TEXT,
  dropoff_lat REAL,
  dropoff_lng REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_charter_journeys_trip ON charter_journeys(trip_id);
CREATE INDEX IF NOT EXISTS idx_charter_journeys_sequence ON charter_journeys(trip_id, sequence);
