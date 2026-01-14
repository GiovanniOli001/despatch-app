-- Safe migration: Create duty blocks tables if they don't exist

CREATE TABLE IF NOT EXISTS shift_template_duty_blocks (
  id TEXT PRIMARY KEY,
  shift_template_id TEXT NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  name TEXT NOT NULL,
  driver_id TEXT REFERENCES employees(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_duty_blocks_template ON shift_template_duty_blocks(shift_template_id, sequence);

CREATE TABLE IF NOT EXISTS shift_template_duty_lines (
  id TEXT PRIMARY KEY,
  duty_block_id TEXT NOT NULL REFERENCES shift_template_duty_blocks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  duty_type TEXT NOT NULL DEFAULT 'driving',
  description TEXT,
  vehicle_id TEXT REFERENCES vehicles(id),
  pay_type TEXT NOT NULL DEFAULT 'STD',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_duty_lines_block ON shift_template_duty_lines(duty_block_id, sequence);
