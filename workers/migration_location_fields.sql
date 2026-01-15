-- Migration: Add location fields to duty lines
-- Supports optional lat/lng for smart assignment, with free text fallback

-- Add to shift_template_duty_lines (master templates)
ALTER TABLE shift_template_duty_lines ADD COLUMN location_name TEXT;
ALTER TABLE shift_template_duty_lines ADD COLUMN location_lat REAL;
ALTER TABLE shift_template_duty_lines ADD COLUMN location_lng REAL;

-- Add to roster_duty_lines (instance copies)
ALTER TABLE roster_duty_lines ADD COLUMN location_name TEXT;
ALTER TABLE roster_duty_lines ADD COLUMN location_lat REAL;
ALTER TABLE roster_duty_lines ADD COLUMN location_lng REAL;

-- Verify columns added
SELECT name FROM pragma_table_info('shift_template_duty_lines') WHERE name LIKE 'location%';
SELECT name FROM pragma_table_info('roster_duty_lines') WHERE name LIKE 'location%';
