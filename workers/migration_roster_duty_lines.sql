-- Migration: Create roster_duty_lines table
-- This table stores copies of duty lines for each roster entry
-- Edits in Dispatch modify this table, NOT the original shift template duty_lines

CREATE TABLE IF NOT EXISTS roster_duty_lines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    roster_entry_id TEXT NOT NULL REFERENCES roster_entries(id),
    source_duty_line_id TEXT,  -- Original template line (NULL if created in dispatch)
    sequence INTEGER NOT NULL DEFAULT 1,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    duty_type TEXT,
    description TEXT,
    vehicle_id TEXT REFERENCES vehicles(id),
    vehicle_number TEXT,  -- Denormalized for display
    pay_type TEXT DEFAULT 'STD',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Index for fast lookups by roster entry
CREATE INDEX IF NOT EXISTS idx_roster_duty_lines_entry ON roster_duty_lines(roster_entry_id);

-- Index for finding by source template line
CREATE INDEX IF NOT EXISTS idx_roster_duty_lines_source ON roster_duty_lines(source_duty_line_id);
