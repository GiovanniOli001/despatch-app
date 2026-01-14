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
 * Status Flow:
 * - draft: Visible in Ops Calendar, NOT in Dispatch
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
  shift_template_id: string;
  duty_block_id: string;
  date: string;
  driver_id: string | null;
  include_connected?: boolean;
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
      if (method === 'GET' && seg2 && !seg3) return getRoster(env, seg2);
      if (method === 'GET' && !seg2) return listRosters(env);
      if (method === 'POST' && !seg2) {
        const body = await parseBody<RosterInput>(request);
        if (!body) return error('Invalid request body');
        return createRoster(env, body);
      }
      if (method === 'PUT' && seg2 && !seg3) {
        const body = await parseBody<Partial<RosterInput>>(request);
        if (!body) return error('Invalid request body');
        return updateRoster(env, seg2, body);
      }
      if (method === 'DELETE' && seg2 && !seg3) return deleteRoster(env, seg2);
      
      // PUBLISH / UNPUBLISH
      if (method === 'POST' && seg2 && seg3 === 'publish') {
        return publishRoster(env, seg2);
      }
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
  const now = new Date().toISOString();
  
  await env.DB.prepare(`
    UPDATE rosters SET
      code = COALESCE(?, code),
      name = COALESCE(?, name),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(input.code || null, input.name || null, input.start_date || null,
    input.end_date || null, input.status || null, input.notes || null, now, id, TENANT_ID).run();
  
  return json({ data: { id, ...input } });
}

async function deleteRoster(env: Env, id: string): Promise<Response> {
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE rosters SET deleted_at = ? WHERE id = ?`).bind(now, id).run();
  await env.DB.prepare(`UPDATE roster_entries SET deleted_at = ? WHERE roster_id = ?`).bind(now, id).run();
  return json({ data: { deleted: true } });
}

// ============================================
// PUBLISH / UNPUBLISH
// ============================================

async function publishRoster(env: Env, id: string): Promise<Response> {
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  const r = roster as any;
  
  if (r.status === 'published') {
    return error('Roster is already published');
  }
  
  // Check for overlapping published rosters with same drivers on same dates
  const overlapping = await env.DB.prepare(`
    SELECT id, code, name FROM rosters 
    WHERE tenant_id = ? 
      AND deleted_at IS NULL 
      AND status = 'published'
      AND id != ?
      AND start_date <= ?
      AND end_date >= ?
  `).bind(TENANT_ID, id, r.end_date, r.start_date).all();
  
  if (overlapping.results.length > 0) {
    // Check for actual duty conflicts (same driver, same date, overlapping times)
    for (const otherRoster of overlapping.results as any[]) {
      const conflict = await env.DB.prepare(`
        SELECT 
          re1.date,
          e.first_name || ' ' || e.last_name as driver_name,
          re1.start_time as time1_start,
          re1.end_time as time1_end,
          re2.start_time as time2_start,
          re2.end_time as time2_end
        FROM roster_entries re1
        JOIN roster_entries re2 ON re1.driver_id = re2.driver_id AND re1.date = re2.date
        JOIN employees e ON re1.driver_id = e.id
        WHERE re1.roster_id = ? 
          AND re2.roster_id = ?
          AND re1.deleted_at IS NULL
          AND re2.deleted_at IS NULL
          AND re1.driver_id IS NOT NULL
          AND (
            (re1.start_time < re2.end_time AND re1.end_time > re2.start_time)
          )
        LIMIT 1
      `).bind(id, otherRoster.id).first();
      
      if (conflict) {
        const c = conflict as any;
        return json({
          error: 'Cannot publish: driver conflict detected',
          conflict: {
            date: c.date,
            driverName: c.driver_name,
            conflictingRoster: otherRoster.code
          }
        }, 409);
      }
    }
  }
  
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE rosters SET status = 'published', updated_at = ? WHERE id = ?
  `).bind(now, id).run();
  
  return json({ 
    data: { 
      id, 
      status: 'published',
      message: 'Roster published successfully'
    } 
  });
}

async function unpublishRoster(env: Env, id: string): Promise<Response> {
  const roster = await env.DB.prepare(`
    SELECT * FROM rosters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();
  
  if (!roster) return error('Roster not found', 404);
  
  if ((roster as any).status !== 'published') {
    return error('Roster is not published');
  }
  
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE rosters SET status = 'draft', updated_at = ? WHERE id = ?
  `).bind(now, id).run();
  
  return json({ 
    data: { 
      id, 
      status: 'draft',
      message: 'Roster unpublished'
    } 
  });
}

// ============================================
// DAY VIEW - Core of new design
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
  
    // Get existing assignments for this date
    const assignments = await env.DB.prepare(`
      SELECT 
        re.id as entry_id,
        re.duty_block_id,
        re.driver_id,
        e.first_name || ' ' || e.last_name as driver_name,
        e.employee_number as driver_number
      FROM roster_entries re
      LEFT JOIN employees e ON re.driver_id = e.id
      WHERE re.roster_id = ? AND re.date = ? AND re.deleted_at IS NULL
    `).bind(rosterId, date).all();
  
    // Map assignments by block ID
    const assignmentMap: Record<string, any> = {};
    for (const a of assignments.results as any[]) {
      if (a.duty_block_id) {
        assignmentMap[a.duty_block_id] = a;
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
  
    for (const d of drivers.results as any[]) {
      byDriver[(d as any).id] = [];
    }
  
    for (const block of blocks.results as any[]) {
      const assignment = assignmentMap[block.id];
    
      const blockData = {
        id: block.id,
        shift_template_id: block.shift_template_id,
        shift_code: block.shift_code,
        shift_name: block.shift_name,
        shift_type: block.shift_type,
        block_name: block.block_name,
        start_time: block.start_time || 6,
        end_time: block.end_time || 18,
        default_driver_id: block.default_driver_id,
        default_driver_name: block.default_driver_name,
        blocks_in_shift: block.blocks_in_shift,
        // Assignment info
        entry_id: assignment?.entry_id || null,
        assigned_driver_id: assignment?.driver_id || null,
        assigned_driver_name: assignment?.driver_name || null,
      };
    
      if (assignment?.driver_id && byDriver[assignment.driver_id]) {
        byDriver[assignment.driver_id].push(blockData);
      } else {
        unassigned.push(blockData);
      }
    }
  
    return json({
      data: {
        roster_id: rosterId,
        roster_status: (roster as any).status,
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
  const { shift_template_id, duty_block_id, date, driver_id, include_connected } = input;
  
  if (!shift_template_id || !duty_block_id || !date) {
    return error('shift_template_id, duty_block_id, and date are required');
  }
  
  // Find roster for this date
  const roster = await env.DB.prepare(`
    SELECT id FROM rosters 
    WHERE tenant_id = ? AND deleted_at IS NULL AND start_date <= ? AND end_date >= ?
    LIMIT 1
  `).bind(TENANT_ID, date, date).first();
  
  if (!roster) return error('No roster found for this date', 404);
  const rosterId = (roster as any).id;
  
  // Get blocks to assign
  let blocksToAssign: any[] = [];
  
  if (include_connected) {
    const result = await env.DB.prepare(`
      SELECT id,
        (SELECT MIN(start_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as start_time,
        (SELECT MAX(end_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as end_time
      FROM shift_template_duty_blocks db
      WHERE shift_template_id = ?
      ORDER BY sequence
    `).bind(shift_template_id).all();
    blocksToAssign = result.results as any[];
  } else {
    const block = await env.DB.prepare(`
      SELECT id,
        (SELECT MIN(start_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as start_time,
        (SELECT MAX(end_time) FROM shift_template_duty_lines WHERE duty_block_id = db.id) as end_time
      FROM shift_template_duty_blocks db
      WHERE id = ?
    `).bind(duty_block_id).first();
    if (block) blocksToAssign = [block];
  }
  
  if (blocksToAssign.length === 0) return error('Block not found', 404);
  
  // Check overlaps if assigning to driver
  if (driver_id) {
    for (const block of blocksToAssign) {
      const startTime = block.start_time || 6;
      const endTime = block.end_time || 18;
      
      const overlap = await env.DB.prepare(`
        SELECT re.id, db.name as block_name, st.code as shift_code
        FROM roster_entries re
        JOIN shift_template_duty_blocks db ON re.duty_block_id = db.id
        JOIN shift_templates st ON re.shift_template_id = st.id
        WHERE re.date = ? AND re.driver_id = ? AND re.deleted_at IS NULL
        AND re.duty_block_id != ?
        AND (
          (re.start_time < ? AND re.end_time > ?) OR
          (re.start_time >= ? AND re.start_time < ?) OR
          (re.end_time > ? AND re.end_time <= ?)
        )
      `).bind(date, driver_id, block.id, endTime, startTime, startTime, endTime, startTime, endTime).first();
      
      if (overlap) {
        const o = overlap as any;
        return error(`Overlaps with ${o.shift_code} - ${o.block_name}`);
      }
    }
  }
  
  const now = new Date().toISOString();
  const createdIds: string[] = [];
  
  for (const block of blocksToAssign) {
    // Check existing
    const existing = await env.DB.prepare(`
      SELECT id FROM roster_entries WHERE duty_block_id = ? AND date = ? AND deleted_at IS NULL
    `).bind(block.id, date).first();
    
    if (existing) {
      await env.DB.prepare(`
        UPDATE roster_entries SET driver_id = ?, updated_at = ? WHERE id = ?
      `).bind(driver_id, now, (existing as any).id).run();
      createdIds.push((existing as any).id);
    } else {
      const id = uuid();
      await env.DB.prepare(`
        INSERT INTO roster_entries (
          id, tenant_id, roster_id, shift_template_id, duty_block_id, date,
          name, start_time, end_time, driver_id, status, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Assigned Block', ?, ?, ?, 'scheduled', 'manual', ?, ?)
      `).bind(id, TENANT_ID, rosterId, shift_template_id, block.id, date,
        block.start_time || 6, block.end_time || 18, driver_id, now, now).run();
      createdIds.push(id);
    }
  }
  
  return json({ data: { assigned: createdIds.length, entry_ids: createdIds } });
}

async function unassignBlock(env: Env, entryId: string): Promise<Response> {
  const now = new Date().toISOString();
  
  // Delete the entry (block goes back to unassigned)
  await env.DB.prepare(`
    UPDATE roster_entries SET deleted_at = ? WHERE id = ?
  `).bind(now, entryId).run();
  
  return json({ data: { unassigned: true } });
}
