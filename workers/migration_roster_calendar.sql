-- Migration: Add calendar scheduling columns to rosters table
-- Run with: npx wrangler d1 execute dispatch-db --remote --file=src/db/migration_roster_calendar.sql

-- Add calendar scheduling columns
-- When NULL, roster is not on calendar
-- When set, roster appears on calendar for that date range
ALTER TABLE rosters ADD COLUMN calendar_start_date TEXT;
ALTER TABLE rosters ADD COLUMN calendar_end_date TEXT;

-- Note: calendar_start_date and calendar_end_date must be within the roster's start_date and end_date range
