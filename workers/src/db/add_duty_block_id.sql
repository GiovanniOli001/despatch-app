-- Add duty_block_id column to roster_entries
ALTER TABLE roster_entries ADD COLUMN duty_block_id TEXT REFERENCES shift_template_duty_blocks(id);
