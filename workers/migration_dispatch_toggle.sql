-- Migration: Add dispatch inclusion toggle for unassigned roster entries
-- Run with: npx wrangler d1 execute dispatch-db --remote --file=migration_dispatch_toggle.sql

-- Add column to track if unassigned block should appear in dispatch
-- 0 = omit from dispatch (default)
-- 1 = include in dispatch as unassigned
ALTER TABLE roster_entries ADD COLUMN include_in_dispatch INTEGER DEFAULT 0;
