-- Migration: Phase 2 - Add employee default pay type (safe version)
-- Date: January 16, 2026
-- Note: Leaving multiplier column in pay_types (unused but harmless)

-- Add default pay type to employees (no FK constraint for SQLite simplicity)
ALTER TABLE employees ADD COLUMN default_pay_type_id TEXT;
