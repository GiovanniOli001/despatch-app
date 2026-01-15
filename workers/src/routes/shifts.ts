/**
 * Shift Templates API Routes
 * /api/shifts/*
 * 
 * Structure:
 * - Shift Template: Container for duties
 *   - Duty Block: Assignable unit (shows as one block in dispatch)
 *     - Duty Line: Time segment within a block
 */

import { Env, json, error, uuid, parseBody } from '../index';

interface DutyLineInput {
  sequence: number;
  start_time: number;      // Decimal hours (6.5 = 06:30)
  end_time: number;
  duty_type: string;       // 'driving', 'break', etc.
  description?: string;
  vehicle_id?: string;
  pay_type?: string;       // 'STD', 'OT', 'DT', 'PEN', 'UNP'
  location_name?: string;
  location_lat?: number;
  location_lng?: number;
}

interface DutyBlockInput {
  sequence: number;
  name: string;
  driver_id?: string;
  lines: DutyLineInput[];
}

interface ShiftTemplateInput {
  code: string;
  name: string;
  shift_type?: string;     // 'regular', 'charter', 'school'
  default_start?: number;
  default_end?: number;
  notes?: string;
  duty_blocks?: DutyBlockInput[];
}

const TENANT_ID = 'default';

export async function handleShifts(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const id = segments[0];
  const subResource = segments[1];

  // GET /api/shifts - List templates
  if (method === 'GET' && !id) {
    return listShiftTemplates(env, new URL(request.url).searchParams);
  }

  // GET /api/shifts/:id - Get template with duty blocks
  if (method === 'GET' && id && !subResource) {
    return getShiftTemplate(env, id);
  }

  // POST /api/shifts - Create template
  if (method === 'POST' && !id) {
    const body = await parseBody<ShiftTemplateInput>(request);
    if (!body) return error('Invalid request body');
    return createShiftTemplate(env, body);
  }

  // PUT /api/shifts/:id - Update template
  if (method === 'PUT' && id && !subResource) {
    const body = await parseBody<ShiftTemplateInput>(request);
    if (!body) return error('Invalid request body');
    return updateShiftTemplate(env, id, body);
  }

  // DELETE /api/shifts/:id - Delete template
  if (method === 'DELETE' && id && !subResource) {
    return deleteShiftTemplate(env, id);
  }

  // POST /api/shifts/:id/duplicate - Copy template
  if (method === 'POST' && id && subResource === 'duplicate') {
    return duplicateShiftTemplate(env, id);
  }

  // GET /api/shifts/:id/lock-status - Check if shift is locked by published rosters
  if (method === 'GET' && id && subResource === 'lock-status') {
    return getShiftLockStatus(env, id);
  }

  return error('Method not allowed', 405);
}

async function listShiftTemplates(env: Env, params: URLSearchParams): Promise<Response> {
  const active = params.get('active');
  const shiftType = params.get('type');
  const search = params.get('search');
  const limit = Math.min(parseInt(params.get('limit') || '100'), 500);
  const offset = parseInt(params.get('offset') || '0');

  let query = `SELECT st.*, 
    (SELECT COUNT(*) FROM shift_template_duty_blocks WHERE shift_template_id = st.id) as duty_count
    FROM shift_templates st 
    WHERE st.tenant_id = ? AND st.deleted_at IS NULL`;
  const bindings: (string | number)[] = [TENANT_ID];

  if (active !== null) {
    query += ` AND st.is_active = ?`;
    bindings.push(active === 'true' ? 1 : 0);
  }

  if (shiftType) {
    query += ` AND st.shift_type = ?`;
    bindings.push(shiftType);
  }

  if (search) {
    query += ` AND (st.code LIKE ? OR st.name LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern);
  }

  query += ` ORDER BY st.code LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...bindings).all();

  return json({
    data: result.results,
    meta: { total: result.results.length, limit, offset },
  });
}

async function getShiftTemplate(env: Env, id: string): Promise<Response> {
  const template = await env.DB.prepare(`
    SELECT * FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!template) return error('Shift template not found', 404);

  // Get duty blocks with their lines
  const blocks = await env.DB.prepare(`
    SELECT * FROM shift_template_duty_blocks 
    WHERE shift_template_id = ?
    ORDER BY sequence
  `).bind(id).all();

  const dutyBlocks = [];
  for (const block of blocks.results as Record<string, unknown>[]) {
    const lines = await env.DB.prepare(`
      SELECT * FROM shift_template_duty_lines 
      WHERE duty_block_id = ?
      ORDER BY sequence
    `).bind(block.id).all();

    dutyBlocks.push({
      ...block,
      lines: lines.results,
    });
  }

  return json({
    data: {
      ...template,
      duty_blocks: dutyBlocks,
    },
  });
}

async function createShiftTemplate(env: Env, input: ShiftTemplateInput): Promise<Response> {
  if (!input.code || !input.name) {
    return error('code and name are required');
  }

  // Check duplicate code
  const existing = await env.DB.prepare(`
    SELECT id FROM shift_templates WHERE tenant_id = ? AND code = ? AND deleted_at IS NULL
  `).bind(TENANT_ID, input.code).first();

  if (existing) return error('Shift template code already exists');

  const templateId = uuid();
  const now = new Date().toISOString();

  // Create the shift template
  await env.DB.prepare(`
    INSERT INTO shift_templates (
      id, tenant_id, code, name, shift_type,
      default_start, default_end, notes, 
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(
    templateId, TENANT_ID, input.code, input.name,
    input.shift_type || 'regular',
    input.default_start ?? 6.0,
    input.default_end ?? 14.0,
    input.notes || null,
    now, now
  ).run();

  // Create duty blocks and lines if provided
  if (input.duty_blocks && input.duty_blocks.length > 0) {
    await saveDutyBlocks(env, templateId, input.duty_blocks);
  }

  return getShiftTemplate(env, templateId);
}

async function updateShiftTemplate(env: Env, id: string, input: ShiftTemplateInput): Promise<Response> {
  try {
    const existing = await env.DB.prepare(`
      SELECT id FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).bind(id, TENANT_ID).first();

    if (!existing) return error('Shift template not found', 404);

    // Check if shift is locked by published rosters
    const publishedRoster = await env.DB.prepare(`
      SELECT r.code FROM rosters r
      JOIN roster_entries re ON re.roster_id = r.id
      WHERE re.shift_template_id = ?
      AND r.status = 'published'
      AND r.deleted_at IS NULL
      AND re.deleted_at IS NULL
      LIMIT 1
    `).bind(id).first();
    
    if (publishedRoster) {
      return error(`Cannot edit shift - it is used in published roster "${(publishedRoster as any).code}". Unpublish the roster first.`, 403);
    }

    const now = new Date().toISOString();

    // Update template fields
    await env.DB.prepare(`
      UPDATE shift_templates SET
        code = COALESCE(?, code),
        name = COALESCE(?, name),
        shift_type = COALESCE(?, shift_type),
        default_start = COALESCE(?, default_start),
        default_end = COALESCE(?, default_end),
        notes = ?,
        updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(
      input.code || null,
      input.name || null,
      input.shift_type || null,
      input.default_start ?? null,
      input.default_end ?? null,
      input.notes || null,
      now,
      id, TENANT_ID
    ).run();

    // Replace duty blocks if provided
    if (input.duty_blocks !== undefined) {
      // Step 1: Delete ALL existing lines first
      const existingBlocks = await env.DB.prepare(`
        SELECT id FROM shift_template_duty_blocks WHERE shift_template_id = ?
      `).bind(id).all();
      
      for (const block of existingBlocks.results as Record<string, unknown>[]) {
        await env.DB.prepare(`
          DELETE FROM shift_template_duty_lines WHERE duty_block_id = ?
        `).bind(block.id).run();
      }
      
      // Step 2: Delete ALL existing blocks
      await env.DB.prepare(`
        DELETE FROM shift_template_duty_blocks WHERE shift_template_id = ?
      `).bind(id).run();
      
      // Step 3: Insert new blocks and lines
      for (const block of input.duty_blocks) {
        const blockId = uuid();
        
        // Insert block (no driver_id foreign key - we'll skip it for now)
        await env.DB.prepare(`
          INSERT INTO shift_template_duty_blocks (
            id, shift_template_id, sequence, name, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).bind(blockId, id, block.sequence, block.name, now, now).run();

        // Insert lines
        if (block.lines && block.lines.length > 0) {
          for (const line of block.lines) {
            await env.DB.prepare(`
              INSERT INTO shift_template_duty_lines (
                id, duty_block_id, sequence, start_time, end_time,
                duty_type, description, pay_type,
                location_name, location_lat, location_lng,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              uuid(), blockId, line.sequence,
              line.start_time, line.end_time,
              line.duty_type || 'driving',
              line.description || null,
              line.pay_type || 'STD',
              line.location_name ?? null,
              line.location_lat ?? null,
              line.location_lng ?? null,
              now, now
            ).run();
          }
        }
      }
    }

    return getShiftTemplate(env, id);
  } catch (err) {
    console.error('updateShiftTemplate error:', err);
    return error(`Failed to update shift: ${err instanceof Error ? err.message : 'Unknown error'}`, 500);
  }
}

async function saveDutyBlocks(env: Env, templateId: string, blocks: DutyBlockInput[]): Promise<void> {
  const now = new Date().toISOString();

  for (const block of blocks) {
    const blockId = uuid();
    
    // Only use driver_id if it's a valid non-empty string
    const driverId = block.driver_id && block.driver_id.trim() !== '' ? block.driver_id : null;

    // Insert duty block with driver_id
    await env.DB.prepare(`
      INSERT INTO shift_template_duty_blocks (
        id, shift_template_id, sequence, name, driver_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      blockId, templateId, block.sequence, block.name, driverId, now, now
    ).run();

    // Insert duty lines
    if (block.lines && block.lines.length > 0) {
      for (const line of block.lines) {
        // Only use vehicle_id if it's a valid non-empty string
        const vehicleId = line.vehicle_id && line.vehicle_id.trim() !== '' ? line.vehicle_id : null;
        
        await env.DB.prepare(`
          INSERT INTO shift_template_duty_lines (
            id, duty_block_id, sequence, start_time, end_time,
            duty_type, description, vehicle_id, pay_type,
            location_name, location_lat, location_lng,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          uuid(), blockId, line.sequence,
          line.start_time, line.end_time,
          line.duty_type || 'driving',
          line.description || null,
          vehicleId,
          line.pay_type || 'STD',
          line.location_name ?? null,
          line.location_lat ?? null,
          line.location_lng ?? null,
          now, now
        ).run();
      }
    }
  }
}

async function deleteShiftTemplate(env: Env, id: string): Promise<Response> {
  // Check if shift is locked by published rosters
  const publishedRoster = await env.DB.prepare(`
    SELECT r.code FROM rosters r
    JOIN roster_entries re ON re.roster_id = r.id
    WHERE re.shift_template_id = ?
    AND r.status = 'published'
    AND r.deleted_at IS NULL
    AND re.deleted_at IS NULL
    LIMIT 1
  `).bind(id).first();
  
  if (publishedRoster) {
    return error(`Cannot delete shift - it is used in published roster "${(publishedRoster as any).code}". Unpublish the roster first.`, 403);
  }

  const result = await env.DB.prepare(`
    UPDATE shift_templates SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), new Date().toISOString(), id, TENANT_ID).run();

  if (result.meta.changes === 0) return error('Shift template not found', 404);
  return json({ success: true });
}

async function duplicateShiftTemplate(env: Env, sourceId: string): Promise<Response> {
  // Get source template
  const source = await env.DB.prepare(`
    SELECT * FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(sourceId, TENANT_ID).first<Record<string, unknown>>();

  if (!source) return error('Shift template not found', 404);

  // Generate new code
  const newCode = `${source.code}-COPY`;
  const newId = uuid();
  const now = new Date().toISOString();

  // Copy template
  await env.DB.prepare(`
    INSERT INTO shift_templates (
      id, tenant_id, code, name, shift_type,
      default_start, default_end, notes,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(
    newId, TENANT_ID, newCode, `${source.name} (Copy)`,
    source.shift_type,
    source.default_start, source.default_end,
    source.notes,
    now, now
  ).run();

  // Copy duty blocks
  const blocks = await env.DB.prepare(`
    SELECT * FROM shift_template_duty_blocks WHERE shift_template_id = ?
  `).bind(sourceId).all();

  for (const block of blocks.results as Record<string, unknown>[]) {
    const newBlockId = uuid();

    await env.DB.prepare(`
      INSERT INTO shift_template_duty_blocks (
        id, shift_template_id, sequence, name, driver_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(newBlockId, newId, block.sequence, block.name, block.driver_id || null, now, now).run();

    // Copy lines for this block
    const lines = await env.DB.prepare(`
      SELECT * FROM shift_template_duty_lines WHERE duty_block_id = ?
    `).bind(block.id).all();

    for (const line of lines.results as Record<string, unknown>[]) {
      await env.DB.prepare(`
        INSERT INTO shift_template_duty_lines (
          id, duty_block_id, sequence, start_time, end_time,
          duty_type, description, vehicle_id, pay_type,
          location_name, location_lat, location_lng,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        uuid(), newBlockId, line.sequence,
        line.start_time, line.end_time,
        line.duty_type, line.description, line.vehicle_id, line.pay_type,
        line.location_name || null, line.location_lat || null, line.location_lng || null,
        now, now
      ).run();
    }
  }

  return getShiftTemplate(env, newId);
}

async function getShiftLockStatus(env: Env, id: string): Promise<Response> {
  // Check if this shift template is used in any published rosters
  const publishedRosters = await env.DB.prepare(`
    SELECT DISTINCT r.id, r.code, r.name, r.start_date, r.end_date
    FROM rosters r
    JOIN roster_entries re ON re.roster_id = r.id
    WHERE re.shift_template_id = ?
    AND r.status = 'published'
    AND r.deleted_at IS NULL
    AND re.deleted_at IS NULL
  `).bind(id).all();
  
  const isLocked = publishedRosters.results.length > 0;
  
  return json({
    locked: isLocked,
    reason: isLocked ? 'This shift is used in published roster(s) and cannot be edited.' : null,
    published_rosters: publishedRosters.results
  });
}
