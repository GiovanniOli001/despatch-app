-- Purge roster and shift data (keeps employees and vehicles)
-- Run this to start fresh with dispatch/roster system

-- Clear roster duty lines (instance copies)
DELETE FROM roster_duty_lines;

-- Clear roster entries
DELETE FROM roster_entries;

-- Clear rosters
DELETE FROM rosters;

-- Clear shift template duty lines
DELETE FROM shift_template_duty_lines;

-- Clear shift template duty blocks
DELETE FROM shift_template_duty_blocks;

-- Clear shift templates
DELETE FROM shift_templates;

-- Verify what's left
SELECT 'employees' as table_name, COUNT(*) as count FROM employees
UNION ALL
SELECT 'vehicles', COUNT(*) FROM vehicles
UNION ALL
SELECT 'rosters', COUNT(*) FROM rosters
UNION ALL
SELECT 'roster_entries', COUNT(*) FROM roster_entries
UNION ALL
SELECT 'shift_templates', COUNT(*) FROM shift_templates;
