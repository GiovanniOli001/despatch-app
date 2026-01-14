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
  id?: string;            // Include ID for updates
  sequence: number;
  start_time: number;     // Decimal hours (6.5 = 06:30)
  end_time: number;
  duty_type: string;      // 'driving', 'break', etc.
  description?: string;
  vehicle_id?: string;
  pay_type?: string;      // 'STD', 'OT', 'DT', 'PEN', 'UNP'
}

interface DutyBlockInput {
  id?: string;            // Include ID for updates
  sequence: number;
  name: string;
  driver_id?: string;
  lines: DutyLineInput[];
}

interface ShiftTemplateInput {
  code: string;
  name: string;
  shift_type?: string;    // 'regular', 'charter', 'school'
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

  // DELETE /api/shifts/:id - Soft delete template
  if (method === 'DELETE' && id && !subResource) {
    return deleteShiftTemplate(env, id);
  }

  // POST /api/shifts/:id/duplicate - Duplicate template
  if (method === 'POST' && id && subResource === 'duplicate') {
    return duplicateShiftTemplate(env, id);
  }

  return error('Not found', 404);
}

// ============================================
// LIST / GET
// ============================================

async function listShiftTemplates(env: Env, params: URLSearchParams): Promise<Response> {
  const search = params.get('search') || '';
  const type = params.get('type') || '';

  let query = `
    SELECT 
      st.*,
      (SELECT COUNT(*) FROM shift_template_duty_blocks WHERE shift_template_id = st.id) as block_count
    FROM shift_templates st
    WHERE st.tenant_id = ? AND st.deleted_at IS NULL
  `;
  const bindings: any[] = [TENANT_ID];

  if (search) {
    query += ` AND (st.code LIKE ? OR st.name LIKE ?)`;
    bindings.push(`%${search}%`, `%${search}%`);
  }

  if (type) {
    query += ` AND st.shift_type = ?`;
    bindings.push(type);
  }

  query += ` ORDER BY st.code`;

  const result = await env.DB.prepare(query).bind(...bindings).all();
  return json({ data: result.results });
}

async function getShiftTemplate(env: Env, id: string): Promise<Response> {
  const template = await env.DB.prepare(`
    SELECT * FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!template) return error('Shift template not found', 404);

  // Get duty blocks with lines
  const blocks = await env.DB.prepare(`
    SELECT * FROM shift_template_duty_blocks 
    WHERE shift_template_id = ? 
    ORDER BY sequence
  `).bind(id).all();

  const blockIds = (blocks.results as any[]).map(b => b.id);
  let linesMap: Record<string, any[]> = {};

  if (blockIds.length > 0) {
    const placeholders = blockIds.map(() => '?').join(',');
    const lines = await env.DB.prepare(`
      SELECT * FROM shift_template_duty_lines 
      WHERE duty_block_id IN (${placeholders})
      ORDER BY duty_block_id, sequence
    `).bind(...blockIds).all();

    for (const line of lines.results as any[]) {
      if (!linesMap[line.duty_block_id]) {
        linesMap[line.duty_block_id] = [];
      }
      linesMap[line.duty_block_id].push(line);
    }
  }

  const duty_blocks = (blocks.results as any[]).map(block => ({
    ...block,
    lines: linesMap[block.id] || []
  }));

  return json({
    data: {
      ...template,
      duty_blocks
    }
  });
}

// ============================================
// CREATE
// ============================================

async function createShiftTemplate(env: Env, input: ShiftTemplateInput): Promise<Response> {
  if (!input.code || !input.name) {
    return error('code and name are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  // Calculate default times from duty blocks if not provided
  let defaultStart = input.default_start;
  let defaultEnd = input.default_end;

  if (input.duty_blocks && input.duty_blocks.length > 0) {
    const allLines = input.duty_blocks.flatMap(b => b.lines || []);
    if (allLines.length > 0) {
      const minStart = Math.min(...allLines.map(l => l.start_time));
      const maxEnd = Math.max(...allLines.map(l => l.end_time));
      if (defaultStart === undefined) defaultStart = minStart;
      if (defaultEnd === undefined) defaultEnd = maxEnd;
    }
  }

  await env.DB.prepare(`
    INSERT INTO shift_templates (
      id, tenant_id, code, name, shift_type,
      default_start, default_end, notes,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(
    id, TENANT_ID, input.code, input.name,
    input.shift_type || 'regular',
    defaultStart ?? 6, defaultEnd ?? 18,
    input.notes || null,
    now, now
  ).run();

  // Create duty blocks
  if (input.duty_blocks && input.duty_blocks.length > 0) {
    await saveDutyBlocks(env, id, input.duty_blocks);
  }

  return getShiftTemplate(env, id);
}

// ============================================
// UPDATE - Smart update that preserves IDs
// ============================================

async function updateShiftTemplate(env: Env, id: string, input: ShiftTemplateInput): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) return error('Shift template not found', 404);

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

  // Update duty blocks if provided - smart update to preserve IDs
  if (input.duty_blocks !== undefined) {
    await updateDutyBlocks(env, id, input.duty_blocks);
  }

  return getShiftTemplate(env, id);
}

async function updateDutyBlocks(env: Env, templateId: string, blocks: DutyBlockInput[]): Promise<void> {
  const now = new Date().toISOString();
  
  // Get existing blocks
  const existingBlocks = await env.DB.prepare(`
    SELECT id FROM shift_template_duty_blocks WHERE shift_template_id = ?
  `).bind(templateId).all();
  
  const existingBlockIds = new Set((existingBlocks.results as any[]).map(b => b.id));
  const newBlockIds = new Set(blocks.filter(b => b.id).map(b => b.id));
  
  // Find blocks to delete (exist in DB but not in input)
  const blocksToDelete = [...existingBlockIds].filter(id => !newBlockIds.has(id));
  
  // Check if any blocks to delete are referenced by roster_entries
  if (blocksToDelete.length > 0) {
    const placeholders = blocksToDelete.map(() => '?').join(',');
    const referenced = await env.DB.prepare(`
      SELECT DISTINCT duty_block_id FROM roster_entries 
      WHERE duty_block_id IN (${placeholders}) AND deleted_at IS NULL
    `).bind(...blocksToDelete).all();
    
    const referencedIds = new Set((referenced.results as any[]).map(r => r.duty_block_id));
    
    // Only delete blocks that are NOT referenced
    const safeToDelete = blocksToDelete.filter(id => !referencedIds.has(id));
    
    if (safeToDelete.length > 0) {
      const deletePlaceholders = safeToDelete.map(() => '?').join(',');
      // Delete lines first
      await env.DB.prepare(`
        DELETE FROM shift_template_duty_lines WHERE duty_block_id IN (${deletePlaceholders})
      `).bind(...safeToDelete).run();
      // Delete blocks
      await env.DB.prepare(`
        DELETE FROM shift_template_duty_blocks WHERE id IN (${deletePlaceholders})
      `).bind(...safeToDelete).run();
    }
  }
  
  // Upsert blocks
  for (const block of blocks) {
    const blockId = block.id || uuid();
    const isExisting = block.id && existingBlockIds.has(block.id);
    
    if (isExisting) {
      // Update existing block
      await env.DB.prepare(`
        UPDATE shift_template_duty_blocks SET
          sequence = ?, name = ?, driver_id = ?, updated_at = ?
        WHERE id = ?
      `).bind(block.sequence, block.name, block.driver_id || null, now, blockId).run();
    } else {
      // Insert new block
      await env.DB.prepare(`
        INSERT INTO shift_template_duty_blocks (
          id, shift_template_id, sequence, name, driver_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(blockId, templateId, block.sequence, block.name, block.driver_id || null, now, now).run();
    }
    
    // Update lines for this block
    await updateDutyLines(env, blockId, block.lines || []);
  }
}

async function updateDutyLines(env: Env, blockId: string, lines: DutyLineInput[]): Promise<void> {
  const now = new Date().toISOString();
  
  // Get existing lines
  const existingLines = await env.DB.prepare(`
    SELECT id FROM shift_template_duty_lines WHERE duty_block_id = ?
  `).bind(blockId).all();
  
  const existingLineIds = new Set((existingLines.results as any[]).map(l => l.id));
  const newLineIds = new Set(lines.filter(l => l.id).map(l => l.id));
  
  // Delete lines that are no longer needed
  const linesToDelete = [...existingLineIds].filter(id => !newLineIds.has(id));
  if (linesToDelete.length > 0) {
    const placeholders = linesToDelete.map(() => '?').join(',');
    await env.DB.prepare(`
      DELETE FROM shift_template_duty_lines WHERE id IN (${placeholders})
    `).bind(...linesToDelete).run();
  }
  
  // Upsert lines
  for (const line of lines) {
    const lineId = line.id || uuid();
    const isExisting = line.id && existingLineIds.has(line.id);
    
    if (isExisting) {
      // Update existing line
      await env.DB.prepare(`
        UPDATE shift_template_duty_lines SET
          sequence = ?, start_time = ?, end_time = ?,
          duty_type = ?, description = ?, vehicle_id = ?, pay_type = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        line.sequence, line.start_time, line.end_time,
        line.duty_type || 'driving', line.description || null,
        line.vehicle_id || null, line.pay_type || 'STD',
        now, lineId
      ).run();
    } else {
      // Insert new line
      await env.DB.prepare(`
        INSERT INTO shift_template_duty_lines (
          id, duty_block_id, sequence, start_time, end_time,
          duty_type, description, vehicle_id, pay_type,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        lineId, blockId, line.sequence,
        line.start_time, line.end_time,
        line.duty_type || 'driving',
        line.description || null,
        line.vehicle_id || null,
        line.pay_type || 'STD',
        now, now
      ).run();
    }
  }
}

// ============================================
// SAVE (for new blocks - used by create)
// ============================================

async function saveDutyBlocks(env: Env, templateId: string, blocks: DutyBlockInput[]): Promise<void> {
  const now = new Date().toISOString();

  for (const block of blocks) {
    const blockId = uuid();

    // Insert duty block with driver_id
    await env.DB.prepare(`
      INSERT INTO shift_template_duty_blocks (
        id, shift_template_id, sequence, name, driver_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      blockId, templateId, block.sequence, block.name, block.driver_id || null, now, now
    ).run();

    // Insert duty lines
    if (block.lines && block.lines.length > 0) {
      for (const line of block.lines) {
        await env.DB.prepare(`
          INSERT INTO shift_template_duty_lines (
            id, duty_block_id, sequence, start_time, end_time,
            duty_type, description, vehicle_id, pay_type,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          uuid(), blockId, line.sequence,
          line.start_time, line.end_time,
          line.duty_type || 'driving',
          line.description || null,
          line.vehicle_id || null,
          line.pay_type || 'STD',
          now, now
        ).run();
      }
    }
  }
}

// ============================================
// DELETE / DUPLICATE
// ============================================

async function deleteShiftTemplate(env: Env, id: string): Promise<Response> {
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
  `).bind(sourceId, TENANT_ID).first();

  if (!source) return error('Source template not found', 404);

  const sourceData = source as any;

  // Get source duty blocks with lines
  const blocks = await env.DB.prepare(`
    SELECT * FROM shift_template_duty_blocks WHERE shift_template_id = ? ORDER BY sequence
  `).bind(sourceId).all();

  const blockIds = (blocks.results as any[]).map(b => b.id);
  let linesMap: Record<string, any[]> = {};

  if (blockIds.length > 0) {
    const placeholders = blockIds.map(() => '?').join(',');
    const lines = await env.DB.prepare(`
      SELECT * FROM shift_template_duty_lines WHERE duty_block_id IN (${placeholders}) ORDER BY sequence
    `).bind(...blockIds).all();

    for (const line of lines.results as any[]) {
      if (!linesMap[line.duty_block_id]) {
        linesMap[line.duty_block_id] = [];
      }
      linesMap[line.duty_block_id].push(line);
    }
  }

  // Create new template with COPY suffix
  const newCode = `${sourceData.code}-COPY`;
  const newName = `${sourceData.name} (Copy)`;

  const dutyBlocks: DutyBlockInput[] = (blocks.results as any[]).map(block => ({
    sequence: block.sequence,
    name: block.name,
    driver_id: block.driver_id,
    lines: (linesMap[block.id] || []).map((line: any) => ({
      sequence: line.sequence,
      start_time: line.start_time,
      end_time: line.end_time,
      duty_type: line.duty_type,
      description: line.description,
      vehicle_id: line.vehicle_id,
      pay_type: line.pay_type
    }))
  }));

  return createShiftTemplate(env, {
    code: newCode,
    name: newName,
    shift_type: sourceData.shift_type,
    default_start: sourceData.default_start,
    default_end: sourceData.default_end,
    notes: sourceData.notes,
    duty_blocks: dutyBlocks
  });
}
