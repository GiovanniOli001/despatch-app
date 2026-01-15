-- Migration: Add location fields to shift_template_duty_lines
-- Run this in D1 console if not already done

-- Check if columns exist first (SQLite will error if they already exist)
-- Run each line separately if needed

ALTER TABLE shift_template_duty_lines ADD COLUMN location_name TEXT;
ALTER TABLE shift_template_duty_lines ADD COLUMN location_lat REAL;
ALTER TABLE shift_template_duty_lines ADD COLUMN location_lng REAL;
