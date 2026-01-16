/**
 * Roster API Routes - NEW DESIGN
 * /api/roster/*
 * 
 * Design:
 * - Rosters are date containers (e.g., "Week 3 Jan 2025")
 * - Each day automatically shows ALL shift template duty blocks in "Unassigned"
 * - User drags blocks from Unassigned to Drivers to create assignments
 * - roster_entries track assignments (block + date + driver)
 * 
 * Calendar Scheduling:
 * - Rosters don't appear on calendar until explicitly scheduled
 * - calendar_start_date / calendar_end_date define when roster appears on calendar
 * - Must be within roster's valid date range (start_date to end_date)
 * 
 * Dispatch Toggle:
 * - Unassigned blocks can be toggled to include/omit from dispatch
 * - include_in_dispatch = 1 means show as unassigned in dispatch
 * - include_in_dispatch = 0 means don't show in dispatch (default)
 * 
 * Status Flow:
 * - draft: Visible in Ops Calendar (when scheduled), NOT in Dispatch
 * - published: Visible in both Ops Calendar AND Dispatch
 * - archived: Hidden from active views
 */

import { Env, json, error, uuid, parseBody } from '../index';

const TENANT_ID = 'default';

// ============================================
// INTERFACES
// ============================================

interface RosterInput {
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  status?: string;
  notes?: string;
}

interface AssignInput {
  roster_id?: string;
  shift_template_id: string;
  duty_block_id: string;
  date: string;
  driver_id: string | null;
  include_connected?: boolean;
}

interface ScheduleInput {
  calendar_start_date: string;
  calendar_end_date: string;
}

interface ToggleDispatchInput {
  roster_id: string;
  duty_block_id: string;
  shift_template_id: string;
  date: string;
  include: boolean;  // true = include in dispatch, false = omit
}

interface ToggleDispatchDayInput {
  roster_id: string;
  date: string;
  include: boolean;
}

interface ToggleDispatchAllInput {
  roster_id: string;
  include: boolean;
}

// ============================================
// ROUTER
// ============================================

export async function handleRoster(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const seg1 = segments[0];
  const seg2 = segments[1];
  const seg3 = segments[2];

  try {
    // ROSTER CRUD
    if (seg1 === 'containers') {
      // GET /api/roster/containers/:id
      if (method === 'GET' && seg2 && !seg3) return getRoster(env, seg2);
      // GET /api/roster/containers
      if (method === 'GET' && !seg2) return listRosters(env);
      // POST /api/roster/containers
      if (method === 'POST' && !seg2) {
        const body = await parseBody<RosterInput>(request);
        if (!body) return error('Invalid request body');
        return createRoster(env, body);
      }
      // PUT /api/roster/containers/:id
      if (method === 'PUT' && seg2 && !seg3) {
        const body = await parseBody<Partial<RosterInput>>(request);
        if (!body) return error('Invalid request body');
        return updateRoster(env, seg2, body);
      }
      // DELETE /api/roster/containers/:id
      if (method === 'DELETE' && seg2 && !seg3) return deleteRoster(env, seg2);
      
      // POST /api/roster/containers/:id/schedule - Add to calendar
      if (method === 'POST' && seg2 && seg3 === 'schedule') {
        const body = await parseBody<ScheduleInput>(request);
        if (!body) return error('Invalid request body');
        return scheduleRoster(env, seg2, body);
      }
      
      // POST /api/roster/containers/:id/unschedule - Remove from calendar
      if (method === 'POST' && seg2 && seg3 === 'unschedule') {
        return unscheduleRoster(env, seg2);
      }
      
      // POST /api/roster/containers/:id/publish
      if (method === 'POST' && seg2 && seg3 === 'publish') {
        return publishRoster(env, seg2);
      }
      
      // POST /api/roster/containers/:id/unpublish
      if (method === 'POST' && seg2 && seg3 === 'unpublish') {
        return unpublishRoster(env, seg2);
      }
    }

    // DAY VIEW
    if (method === 'GET' && seg1 === 'day' && seg2 && seg3) {
      return getDayView(env, seg2, seg3);
    }

    // ASSIGNMENT
    if (method === 'POST' && seg1 === 'assign') {
      const body = await parseBody<AssignInput>(request);
      if (!body) return error('Invalid request body');
      return assignBlock(env, body);
    }

    if (method === 'POST' && seg1 === 'unassign') {
      const body = await parseBody<{ entry_id: string }>(request);
      if (!body) return error('Invalid request body');
      return unassignBlock(env, body.entry_id);
    }

    // DISPATCH TOGGLE ENDPOINTS
    // POST /api/roster/toggle-dispatch - Toggle single block for a date
    if (method === 'POST' && seg1 === 'toggle-dispatch' && !seg2) {
      const body = await parseBody<ToggleDispatchInput>(request);
      if (!body) return error('Invalid request body');
      return toggleDispatch(env, body);
    }
    
    // POST /api/roster/toggle-dispatch-day - Toggle all blocks for a day
    if (method === 'POST' && seg1 === 'toggle-dispatch-day') {
      const body = await parseBody<ToggleDispatchDayInput>(request);
      if (!body) return error('Invalid request body');
      return toggleDispatchDay(env, body);
    }
    
    // POST /api/roster/toggle-dispatch-all - Toggle all blocks for entire roster
    if (method === 'POST' && seg1 === 'toggle-dispatch-all') {
      const body = await parseBody<ToggleDispatchAllInput>(request);
      if (!body) return error('Invalid request body');
      return toggleDispatchAll(env, body);
    }

    return error('Not found', 404);
  } catch (err) {
    console.error('Roster API error:', err);
    return error(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// ============================================
// ROSTER CRUD
// ============================================

async function listRosters(env: Env): Promise<Response> {
  try {
    const result = await env.DB.prepare(`
      SELECT r.*, 
        (SELECT COUNT(*) FROM roster_entries re WHERE re.roster_id = r.id AND re.deleted_at IS NULL) as entry_count,
        (SELECT COUNT(*) FROM roster_entries re WHERE re.roster_id = r.id AND re.deleted_at IS NULL AND re.driver_id IS NOT NULL) as assigned_count
      FROM rosters r
      WHERE r.tenant_id = ? AND r.deleted_at IS NULL
      ORDER BY r.start_date DESC
    `).bind(TENANT_ID).all();
    
    return json({ data: result.results });
  } catch (err) {
    console.error('listRosters error:', err);
    return error(err instanceof Error ? err.message : 'Failed to list rosters', 500);
  }
}

async function getRoster(env: Env, id: string): Promise<Response> {
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  const drivers = await env.DB.prepare(`
    SELECT id, employee_number, first_name, last_name
    FROM employees
    WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active'
    ORDER BY first_name, last_name
  `).bind(TENANT_ID).all();
  
  // Get entry counts
  const stats = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total_entries,
      SUM(CASE WHEN driver_id IS NOT NULL THEN 1 ELSE 0 END) as assigned_entries
    FROM roster_entries
    WHERE roster_id = ? AND deleted_at IS NULL
  `).bind(id).first();
  
  return json({
    data: {
      ...roster,
      drivers: drivers.results,
      entry_count: (stats as any)?.total_entries || 0,
      assigned_count: (stats as any)?.assigned_entries || 0,
    }
  });
}

async function createRoster(env: Env, input: RosterInput): Promise<Response> {
  try {
    if (!input.code || !input.name || !input.start_date || !input.end_date) {
      return error('code, name, start_date, and end_date are required');
    }
    
    // Check if code already exists (including soft-deleted)
    const existing = await env.DB.prepare(`
      SELECT id, deleted_at FROM rosters WHERE tenant_id = ? AND code = ?
    `).bind(TENANT_ID, input.code).first();
    
    if (existing) {
      if ((existing as any).deleted_at) {
        return error(`Roster code "${input.code}" was used by a deleted roster. Please use a different code.`);
      } else {
        return error(`Roster code "${input.code}" already exists. Please use a different code.`);
      }
    }
    
    const id = uuid();
    const now = new Date().toISOString();
    
    await env.DB.prepare(`
      INSERT INTO rosters (id, tenant_id, code, name, start_date, end_date, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, TENANT_ID, input.code, input.name, input.start_date, input.end_date,
      input.status || 'draft', input.notes || null, now, now).run();
    
    return json({ data: { id, ...input } }, 201);
  } catch (err) {
    console.error('createRoster error:', err);
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('UNIQUE constraint')) {
      return error('A roster with this code already exists. Please use a different code.');
    }
    return error('Failed to create roster. Please try again.');
  }
}

async function updateRoster(env: Env, id: string, input: Partial<RosterInput>): Promise<Response> {
  // Check if roster is published
  const roster = await env.DB.prepare(`
    SELECT status FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  if ((roster as any).status === 'published') {
    return error('Cannot edit a published roster. Unpublish it first to make changes.', 403);
  }
  
  const updates: string[] = [];
  const bindings: any[] = [];
  
  if (input.code !== undefined) { updates.push('code = ?'); bindings.push(input.code); }
  if (input.name !== undefined) { updates.push('name = ?'); bindings.push(input.name); }
  if (input.start_date !== undefined) { updates.push('start_date = ?'); bindings.push(input.start_date); }
  if (input.end_date !== undefined) { updates.push('end_date = ?'); bindings.push(input.end_date); }
  if (input.status !== undefined) { updates.push('status = ?'); bindings.push(input.status); }
  if (input.notes !== undefined) { updates.push('notes = ?'); bindings.push(input.notes); }
  
  if (updates.length === 0) return error('No fields to update');
  
  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(id, TENANT_ID);
  
  await env.DB.prepare(`
    UPDATE rosters SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();
  
  return getRoster(env, id);
}

async function deleteRoster(env: Env, id: string): Promise<Response> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE rosters SET deleted_at = ? WHERE id = ? AND tenant_id = ?
  `).bind(now, id, TENANT_ID).run();
  return json({ success: true });
}

// ============================================
// CALENDAR SCHEDULING
// ============================================

async function scheduleRoster(env: Env, id: string, input: ScheduleInput): Promise<Response> {
  const { calendar_start_date, calendar_end_date } = input;
  
  if (!calendar_start_date || !calendar_end_date) {
    return error('calendar_start_date and calendar_end_date are required');
  }
  
  // Verify roster exists
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  // Validate dates are within roster's valid range
  const rosterData = roster as any;
  if (calendar_start_date < rosterData.start_date || calendar_end_date > rosterData.end_date) {
    return error(`Calendar dates must be within roster's valid range (${rosterData.start_date} to ${rosterData.end_date})`);
  }
  
  // Update roster with calendar dates
  await env.DB.prepare(`
    UPDATE rosters SET calendar_start_date = ?, calendar_end_date = ?, updated_at = ?
    WHERE id = ?
  `).bind(calendar_start_date, calendar_end_date, new Date().toISOString(), id).run();
  
  return json({ success: true, message: 'Roster scheduled to calendar' });
}

async function unscheduleRoster(env: Env, id: string): Promise<Response> {
  // Verify roster exists
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  // Can't unschedule if published
  if ((roster as any).status === 'published') {
    return error('Cannot unschedule a published roster. Unpublish it first.');
  }
  
  // Clear calendar dates
  await env.DB.prepare(`
    UPDATE rosters SET calendar_start_date = NULL, calendar_end_date = NULL, updated_at = ?
    WHERE id = ?
  `).bind(new Date().toISOString(), id).run();
  
  return json({ success: true, message: 'Roster removed from calendar' });
}

async function publishRoster(env: Env, id: string): Promise<Response> {
  // Verify roster exists and is scheduled
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  const rosterData = roster as any;
  
  if (!rosterData.calendar_start_date || !rosterData.calendar_end_date) {
    return error('Roster must be scheduled to calendar before publishing');
  }
  
  // Check for conflicts with other published rosters (time-level)
  const entries = await env.DB.prepare(`
    SELECT 
      re.id, re.date, re.driver_id, re.start_time, re.end_time, re.duty_block_id,
      db.name as block_name,
      st.code as shift_code
    FROM roster_entries re
    JOIN shift_template_duty_blocks db ON re.duty_block_id = db.id
    JOIN shift_templates st ON re.shift_template_id = st.id
    WHERE re.roster_id = ? AND re.deleted_at IS NULL AND re.driver_id IS NOT NULL
  `).bind(id).all();
  
  for (const entry of entries.results as any[]) {
    // Check for time overlaps with published rosters
    const conflict = await env.DB.prepare(`
      SELECT 
        re.id, re.start_time, re.end_time,
        db.name as block_name,
        st.code as shift_code,
        r.code as roster_code
      FROM roster_entries re
      JOIN shift_template_duty_blocks db ON re.duty_block_id = db.id
      JOIN shift_templates st ON re.shift_template_id = st.id
      JOIN rosters r ON re.roster_id = r.id
      WHERE re.date = ? 
        AND re.driver_id = ? 
        AND re.deleted_at IS NULL
        AND r.status = 'published'
        AND r.id != ?
        AND (
          (re.start_time < ? AND re.end_time > ?) OR
          (re.start_time >= ? AND re.start_time < ?) OR
          (re.end_time > ? AND re.end_time <= ?)
        )
      LIMIT 1
    `).bind(
      entry.date, entry.driver_id, id,
      entry.end_time, entry.start_time,
      entry.start_time, entry.end_time,
      entry.start_time, entry.end_time
    ).first();
    
    if (conflict) {
      const c = conflict as any;
      return error(`Conflict: Driver already assigned to ${c.shift_code} - ${c.block_name} (${c.start_time}-${c.end_time}) in roster "${c.roster_code}" on ${entry.date}. Your shift: ${entry.shift_code} - ${entry.block_name} (${entry.start_time}-${entry.end_time})`);
    }
  }
  
  // Recreate duty lines from template for ALL entries (ensures fresh state after unpublish)
  // Query all entries, not just assigned ones
  const allEntries = await env.DB.prepare(`
    SELECT re.id, re.duty_block_id
    FROM roster_entries re
    WHERE re.roster_id = ? AND re.deleted_at IS NULL
  `).bind(id).all();
  
  for (const entry of allEntries.results as any[]) {
    await copyDutyLinesToRosterEntry(env, entry.id, entry.duty_block_id);
  }
  
  // No conflicts, publish
  await env.DB.prepare(`
    UPDATE rosters SET status = 'published', updated_at = ? WHERE id = ?
  `).bind(new Date().toISOString(), id).run();
  
  return json({ success: true, message: 'Roster published' });
}

async function unpublishRoster(env: Env, id: string): Promise<Response> {
  // Verify roster exists
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  const now = new Date().toISOString();
  
  // Delete all roster_duty_lines for this roster's entries
  // This ensures fresh duty lines (without cancelled status) are created on next publish
  await env.DB.prepare(`
    DELETE FROM roster_duty_lines 
    WHERE roster_entry_id IN (
      SELECT id FROM roster_entries 
      WHERE roster_id = ? AND deleted_at IS NULL
    )
  `).bind(id).run();
  
  // FIX: Clear all driver assignments from roster_entries
  // This ensures assignments reset to unassigned state when republishing
  await env.DB.prepare(`
    UPDATE roster_entries 
    SET driver_id = NULL, updated_at = ?
    WHERE roster_id = ? AND deleted_at IS NULL
  `).bind(now, id).run();
  
  // Revert to draft
  await env.DB.prepare(`
    UPDATE rosters SET status = 'draft', updated_at = ? WHERE id = ?
  `).bind(now, id).run();
  
  return json({ success: true, message: 'Roster unpublished (reverted to draft, all assignments cleared)' });
}

// ============================================
// DAY VIEW
// ============================================

async function getDayView(env: Env, rosterId: string, date: string): Promise<Response> {
  try {
    // Verify roster
    const roster = await env.DB.prepare(`
      SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).bind(rosterId, TENANT_ID).first();
    
    if (!roster) return error('Roster not found', 404);
    
    // Get all duty blocks with calculated times
    const blocks = await env.DB.prepare(`
      SELECT 
        db.id,
        db.shift_template_id,
        db.sequence,
        db.name as block_name,
        db.driver_id as default_driver_id,
        st.code as shift_code,
        st.name as shift_name,
        st.shift_type,
        e.first_name || ' ' || e.last_name as default_driver_name,
        (SELECT MIN(start_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as start_time,
        (SELECT MAX(end_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as end_time,
        (SELECT COUNT(*) FROM shift_template_duty_blocks db2 WHERE db2.shift_template_id = db.shift_template_id) as blocks_in_shift
      FROM shift_template_duty_blocks db
      JOIN shift_templates st ON db.shift_template_id = st.id
      LEFT JOIN employees e ON db.driver_id = e.id
      WHERE st.tenant_id = ? AND st.deleted_at IS NULL AND st.is_active = 1
      ORDER BY st.code, db.sequence
    `).bind(TENANT_ID).all();
  
    // Get existing entries for this date (includes both assigned and dispatch-toggled)
    const entries = await env.DB.prepare(`
      SELECT 
        re.id as entry_id,
        re.duty_block_id,
        re.driver_id,
        re.include_in_dispatch,
        e.first_name || ' ' || e.last_name as driver_name,
        e.employee_number as driver_number
      FROM roster_entries re
      LEFT JOIN employees e ON re.driver_id = e.id
      WHERE re.roster_id = ? AND re.date = ? AND re.deleted_at IS NULL
    `).bind(rosterId, date).all();
    
    // Map entries by block ID
    const entryMap: Record<string, any> = {};
    for (const entry of entries.results as any[]) {
      if (entry.duty_block_id) {
        entryMap[entry.duty_block_id] = entry;
      }
    }
    
    // Get drivers
    const drivers = await env.DB.prepare(`
      SELECT id, employee_number, first_name, last_name
      FROM employees
      WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active'
      ORDER BY first_name, last_name
    `).bind(TENANT_ID).all();
    
    // Build response
    const unassigned: any[] = [];
    const byDriver: Record<string, any[]> = {};
    
    for (const block of blocks.results as any[]) {
      const entry = entryMap[block.id];
      
      const blockData = {
        id: block.id,
        shift_template_id: block.shift_template_id,
        shift_code: block.shift_code,
        shift_name: block.shift_name,
        shift_type: block.shift_type,
        block_name: block.block_name,
        sequence: block.sequence,
        start_time: block.start_time,
        end_time: block.end_time,
        default_driver_id: block.default_driver_id,
        default_driver_name: block.default_driver_name,
        blocks_in_shift: block.blocks_in_shift,
        entry_id: entry?.entry_id || null,
        include_in_dispatch: entry?.include_in_dispatch || 0,
      };
      
      if (entry?.driver_id) {
        const driverId = entry.driver_id;
        if (!byDriver[driverId]) {
          byDriver[driverId] = [];
        }
        byDriver[driverId].push({
          ...blockData,
          driver_id: driverId,
          driver_name: entry.driver_name,
          driver_number: entry.driver_number,
        });
      } else {
        unassigned.push(blockData);
      }
    }
    
    return json({
      data: {
        roster,
        date,
        drivers: drivers.results,
        unassigned,
        by_driver: byDriver,
      }
    });
  } catch (err) {
    console.error('getDayView error:', err);
    return error(err instanceof Error ? err.message : 'Failed to load day view', 500);
  }
}

// ============================================
// ASSIGNMENT
// ============================================

async function assignBlock(env: Env, input: AssignInput): Promise<Response> {
  const { roster_id, shift_template_id, duty_block_id, date, driver_id, include_connected } = input;
  
  if (!roster_id || !shift_template_id || !duty_block_id || !date) {
    return error('roster_id, shift_template_id, duty_block_id, and date are required');
  }
  
  // Get block info (for times)
  const block = await env.DB.prepare(`
    SELECT 
      db.id,
      db.name,
      db.sequence,
      st.code,
      (SELECT MIN(start_time) FROM shift_template_duty_lines WHERE duty_block_id = ?) as start_time,
      (SELECT MAX(end_time) FROM shift_template_duty_lines WHERE duty_block_id = ?) as end_time
    FROM shift_template_duty_blocks db
    JOIN shift_templates st ON db.shift_template_id = st.id
    WHERE db.id = ?
  `).bind(duty_block_id, duty_block_id, duty_block_id).first();
  
  if (!block) return error('Duty block not found', 404);
  
  const now = new Date().toISOString();
  const blockData = block as any;
  
  // Check for existing entry
  const existing = await env.DB.prepare(`
    SELECT id FROM roster_entries 
    WHERE roster_id = ? AND duty_block_id = ? AND date = ? AND deleted_at IS NULL
  `).bind(roster_id, duty_block_id, date).first();
  
  if (existing) {
    // Update existing entry
    await env.DB.prepare(`
      UPDATE roster_entries 
      SET driver_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(driver_id, now, (existing as any).id).run();
  } else {
    // Create new entry
    const entryId = uuid();
    await env.DB.prepare(`
      INSERT INTO roster_entries (
        id, tenant_id, roster_id, shift_template_id, duty_block_id, date,
        name, start_time, end_time, driver_id, status, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'manual', ?, ?)
    `).bind(
      entryId, TENANT_ID, roster_id, shift_template_id, duty_block_id, date,
      `${blockData.code} - ${blockData.name}`, blockData.start_time, blockData.end_time,
      driver_id, now, now
    ).run();
  }
  
  // If include_connected, also assign other blocks in same shift
  if (include_connected && driver_id) {
    const otherBlocks = await env.DB.prepare(`
      SELECT 
        db.id as duty_block_id,
        db.name,
        (SELECT MIN(start_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as start_time,
        (SELECT MAX(end_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as end_time
      FROM shift_template_duty_blocks db
      WHERE db.shift_template_id = ? AND db.id != ?
    `).bind(shift_template_id, duty_block_id).all();
    
    for (const otherBlock of otherBlocks.results as any[]) {
      // Check for existing entry for this block
      const existingOther = await env.DB.prepare(`
        SELECT id, driver_id FROM roster_entries 
        WHERE roster_id = ? AND duty_block_id = ? AND date = ? AND deleted_at IS NULL
      `).bind(roster_id, otherBlock.duty_block_id, date).first();
      
      if (existingOther) {
        // Only update if currently unassigned
        if (!(existingOther as any).driver_id) {
          await env.DB.prepare(`
            UPDATE roster_entries 
            SET driver_id = ?, updated_at = ?
            WHERE id = ?
          `).bind(driver_id, now, (existingOther as any).id).run();
        }
      } else {
        // Create new entry
        const newEntryId = uuid();
        await env.DB.prepare(`
          INSERT INTO roster_entries (
            id, tenant_id, roster_id, shift_template_id, duty_block_id, date,
            name, start_time, end_time, driver_id, status, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'manual', ?, ?)
        `).bind(
          newEntryId, TENANT_ID, roster_id, shift_template_id, otherBlock.duty_block_id, date,
          `${blockData.code} - ${otherBlock.name}`, otherBlock.start_time, otherBlock.end_time,
          driver_id, now, now
        ).run();
      }
    }
  }
  
  return json({ success: true, message: driver_id ? 'Block assigned' : 'Block unassigned' });
}

// Helper: Copy duty lines from template to roster entry
async function copyDutyLinesToRosterEntry(env: Env, entryId: string, dutyBlockId: string): Promise<void> {
  try {
    // First check if duty lines already exist for this entry
    const existingLines = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM roster_duty_lines WHERE roster_entry_id = ?
    `).bind(entryId).first();
    
    if ((existingLines as any)?.count > 0) {
      // Lines already exist, don't re-copy
      return;
    }
    
    // Get template duty lines
    const templateLines = await env.DB.prepare(`
      SELECT * FROM shift_template_duty_lines WHERE duty_block_id = ? ORDER BY sequence
    `).bind(dutyBlockId).all();
    
    if (templateLines.results.length === 0) return;
    
    const now = new Date().toISOString();
    
    // Copy each line to roster_duty_lines
    for (const line of templateLines.results as any[]) {
      const newId = crypto.randomUUID();
      
      // Get vehicle number if vehicle_id exists
      let vehicleNumber: string | null = null;
      if (line.vehicle_id) {
        const vehicle = await env.DB.prepare(`
          SELECT fleet_number FROM vehicles WHERE id = ?
        `).bind(line.vehicle_id).first() as { fleet_number: string } | null;
        if (vehicle) vehicleNumber = vehicle.fleet_number;
      }
      
      await env.DB.prepare(`
        INSERT INTO roster_duty_lines (
          id, tenant_id, roster_entry_id, source_duty_line_id, sequence,
          start_time, end_time, duty_type, description, vehicle_id, vehicle_number, pay_type,
          location_name, location_lat, location_lng,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newId, TENANT_ID, entryId, line.id, line.sequence,
        line.start_time, line.end_time, line.duty_type, line.description,
        line.vehicle_id, vehicleNumber, line.pay_type || 'STD',
        line.location_name || null, line.location_lat || null, line.location_lng || null,
        now, now
      ).run();
    }
  } catch (err) {
    console.log('copyDutyLinesToRosterEntry error:', err);
    // Don't throw - graceful fallback if table doesn't exist
  }
}

async function unassignBlock(env: Env, entryId: string): Promise<Response> {
  const now = new Date().toISOString();
  
  // Delete the entry (block goes back to unassigned)
  await env.DB.prepare(`
    UPDATE roster_entries SET deleted_at = ? WHERE id = ?
  `).bind(now, entryId).run();
  
  return json({ data: { unassigned: true } });
}

// ============================================
// DISPATCH TOGGLE
// ============================================

async function toggleDispatch(env: Env, input: ToggleDispatchInput): Promise<Response> {
  const { roster_id, duty_block_id, shift_template_id, date, include } = input;
  
  if (!roster_id || !duty_block_id || !shift_template_id || !date) {
    return error('roster_id, duty_block_id, shift_template_id, and date are required');
  }
  
  const now = new Date().toISOString();
  const includeValue = include ? 1 : 0;
  
  // Check if entry exists
  const existing = await env.DB.prepare(`
    SELECT id, driver_id FROM roster_entries 
    WHERE roster_id = ? AND duty_block_id = ? AND date = ? AND deleted_at IS NULL
  `).bind(roster_id, duty_block_id, date).first();
  
  if (existing) {
    // Update existing entry
    await env.DB.prepare(`
      UPDATE roster_entries SET include_in_dispatch = ?, updated_at = ? WHERE id = ?
    `).bind(includeValue, now, (existing as any).id).run();
    // Copy duty lines if they don't exist yet
    await copyDutyLinesToRosterEntry(env, (existing as any).id, duty_block_id);
  } else {
    // Create new entry with no driver (unassigned but toggled for dispatch)
    const block = await env.DB.prepare(`
      SELECT 
        (SELECT MIN(start_time) FROM shift_template_duty_lines WHERE duty_block_id = ?) as start_time,
        (SELECT MAX(end_time) FROM shift_template_duty_lines WHERE duty_block_id = ?) as end_time
    `).bind(duty_block_id, duty_block_id).first();
    
    const id = uuid();
    await env.DB.prepare(`
      INSERT INTO roster_entries (
        id, tenant_id, roster_id, shift_template_id, duty_block_id, date,
        name, start_time, end_time, driver_id, status, source, include_in_dispatch, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'Unassigned Block', ?, ?, NULL, 'scheduled', 'manual', ?, ?, ?)
    `).bind(
      id, TENANT_ID, roster_id, shift_template_id, duty_block_id, date,
      (block as any)?.start_time || 6, (block as any)?.end_time || 18,
      includeValue, now, now
    ).run();
    // Copy duty lines from template to instance
    await copyDutyLinesToRosterEntry(env, id, duty_block_id);
  }
  
  return json({ 
    success: true, 
    message: include ? 'Block will appear as unassigned in dispatch' : 'Block omitted from dispatch'
  });
}

async function toggleDispatchDay(env: Env, input: ToggleDispatchDayInput): Promise<Response> {
  const { roster_id, date, include } = input;
  
  if (!roster_id || !date) {
    return error('roster_id and date are required');
  }
  
  // Verify roster exists
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(roster_id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  const now = new Date().toISOString();
  const includeValue = include ? 1 : 0;
  
  // Get all duty blocks
  const blocks = await env.DB.prepare(`
    SELECT 
      db.id as duty_block_id,
      db.shift_template_id,
      (SELECT MIN(start_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as start_time,
      (SELECT MAX(end_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as end_time
    FROM shift_template_duty_blocks db
    JOIN shift_templates st ON db.shift_template_id = st.id
    WHERE st.tenant_id = ? AND st.deleted_at IS NULL AND st.is_active = 1
  `).bind(TENANT_ID).all();
  
  let updatedCount = 0;
  let createdCount = 0;
  
  for (const block of blocks.results as any[]) {
    // Check if entry exists (might be assigned to a driver)
    const existing = await env.DB.prepare(`
      SELECT id, driver_id FROM roster_entries 
      WHERE roster_id = ? AND duty_block_id = ? AND date = ? AND deleted_at IS NULL
    `).bind(roster_id, block.duty_block_id, date).first();
    
    if (existing) {
      // Only update unassigned entries
      if (!(existing as any).driver_id) {
        await env.DB.prepare(`
          UPDATE roster_entries SET include_in_dispatch = ?, updated_at = ? WHERE id = ?
        `).bind(includeValue, now, (existing as any).id).run();
        updatedCount++;
      }
      // Copy duty lines if they don't exist yet
      await copyDutyLinesToRosterEntry(env, (existing as any).id, block.duty_block_id);
    } else {
      // Create new entry
      const id = uuid();
      await env.DB.prepare(`
        INSERT INTO roster_entries (
          id, tenant_id, roster_id, shift_template_id, duty_block_id, date,
          name, start_time, end_time, driver_id, status, source, include_in_dispatch, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Unassigned Block', ?, ?, NULL, 'scheduled', 'manual', ?, ?, ?)
      `).bind(
        id, TENANT_ID, roster_id, block.shift_template_id, block.duty_block_id, date,
        block.start_time || 6, block.end_time || 18,
        includeValue, now, now
      ).run();
      createdCount++;
      // Copy duty lines from template to instance
      await copyDutyLinesToRosterEntry(env, id, block.duty_block_id);
    }
  }
  
  return json({ 
    success: true, 
    message: `Day ${date}: ${updatedCount} updated, ${createdCount} created`,
    updated: updatedCount,
    created: createdCount
  });
}

async function toggleDispatchAll(env: Env, input: ToggleDispatchAllInput): Promise<Response> {
  const { roster_id, include } = input;
  
  if (!roster_id) {
    return error('roster_id is required');
  }
  
  // Verify roster exists and get date range
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(roster_id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  const rosterData = roster as any;
  const startDate = new Date(rosterData.start_date);
  const endDate = new Date(rosterData.end_date);
  
  // Generate all dates in the roster period
  const dates: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  let totalUpdated = 0;
  let totalCreated = 0;
  
  // Toggle each day
  for (const date of dates) {
    const result = await toggleDispatchDay(env, { roster_id, date, include });
    const body = await result.json() as any;
    totalUpdated += body.updated || 0;
    totalCreated += body.created || 0;
  }
  
  return json({ 
    success: true, 
    message: `Entire roster (${dates.length} days): ${totalUpdated} updated, ${totalCreated} created`,
    days: dates.length,
    updated: totalUpdated,
    created: totalCreated
  });
}
