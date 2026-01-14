-- Migration: Add roster_id and duty_block_id to roster_entries
-- Run this AFTER the rosters and shift_template_duty_blocks tables exist

-- Add roster_id column (links entry to roster container)
ALTER TABLE roster_entries ADD COLUMN roster_id TEXT REFERENCES rosters(id);

-- Add duty_block_id column (links entry to specific duty block from template)
ALTER TABLE roster_entries ADD COLUMN duty_block_id TEXT REFERENCES shift_template_duty_blocks(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_roster_entries_roster ON roster_entries(roster_id, date);
CREATE INDEX IF NOT EXISTS idx_roster_entries_block ON roster_entries(duty_block_id, date);
