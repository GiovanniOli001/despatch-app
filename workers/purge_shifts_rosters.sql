-- Purge all shifts, rosters, and dispatch data
-- Keeps: vehicles, employees, depots, locations, tenants

-- Roster duty blocks (contains the duty line data)
DELETE FROM roster_duty_blocks;

-- Roster entries
DELETE FROM roster_entries;

-- Rosters
DELETE FROM rosters;

-- Shift template duty lines
DELETE FROM shift_template_duty_lines;

-- Shift template duty blocks
DELETE FROM shift_template_duty_blocks;

-- Shift templates
DELETE FROM shift_templates;
