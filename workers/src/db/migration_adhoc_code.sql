-- Migration: Add adhoc_code to roster_entries
-- Date: 2026-01-15

ALTER TABLE roster_entries ADD COLUMN adhoc_code TEXT;
