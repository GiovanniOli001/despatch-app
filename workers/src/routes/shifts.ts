/**
 * Shift Templates API Routes
 * /api/shifts/*
 */

import { Env, json, error, uuid, parseBody } from '../index';

interface ShiftTemplateInput {
  code: string;
  name: string;
  shift_type?: string;
  route_id?: string;
  default_start: number;
  default_end: number;
  default_vehicle_id?: string;
  notes?: string;
}

interface ShiftDutyInput {
  duty_type_id: string;
  sequence: number;
  start_offset: number;
  duration: number;
  description_template?: string;
  default_vehicle?: boolean;
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
  const dutyId = segments[2];

  // GET /api/shifts - List templates
  if (method === 'GET' && !id) {
    return listShiftTemplates(env, new URL(request.url).searchParams);
  }

  // GET /api/shifts/:id - Get template with duties
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
    const body = await parseBody<Partial<ShiftTemplateInput>>(request);
    if (!body) return error('Invalid request body');
    return updateShiftTemplate(env, id, body);
  }

  // DELETE /api/shifts/:id - Delete template
  if (method === 'DELETE' && id && !subResource) {
    return deleteShiftTemplate(env, id);
  }

  // POST /api/shifts/:id/duties - Add duty to template
  if (method === 'POST' && id && subResource === 'duties') {
    const body = await parseBody<ShiftDutyInput>(request);
    if (!body) return error('Invalid request body');
    return addShiftDuty(env, id, body);
  }

  // PUT /api/shifts/:id/duties/:dutyId - Update duty
  if (method === 'PUT' && id && subResource === 'duties' && dutyId) {
    const body = await parseBody<Partial<ShiftDutyInput>>(request);
    if (!body) return error('Invalid request body');
    return updateShiftDuty(env, id, dutyId, body);
  }

  // DELETE /api/shifts/:id/duties/:dutyId - Remove duty
  if (method === 'DELETE' && id && subResource === 'duties' && dutyId) {
    return deleteShiftDuty(env, id, dutyId);
  }

  // POST /api/shifts/:id/duplicate - Copy template
  if (method === 'POST' && id && subResource === 'duplicate') {
    return duplicateShiftTemplate(env, id);
  }

  return error('Method not allowed', 405);
}

async function listShiftTemplates(env: Env, params: URLSearchParams): Promise<Response> {
  const active = params.get('active');
  const shiftType = params.get('type');
  const search = params.get('search');
  const limit = Math.min(parseInt(params.get('limit') || '100'), 500);
  const offset = parseInt(params.get('offset') || '0');

  let query = `SELECT * FROM shift_templates WHERE tenant_id = ? AND deleted_at IS NULL`;
  const bindings: (string | number)[] = [TENANT_ID];

  if (active !== null) {
    query += ` AND is_active = ?`;
    bindings.push(active === 'true' ? 1 : 0);
  }

  if (shiftType) {
    query += ` AND shift_type = ?`;
    bindings.push(shiftType);
  }

  if (search) {
    query += ` AND (code LIKE ? OR name LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern);
  }

  query += ` ORDER BY code LIMIT ? OFFSET ?`;
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

  // Get duties
  const duties = await env.DB.prepare(`
    SELECT 
      std.*,
      dt.code as duty_type_code,
      dt.name as duty_type_name,
      dt.color as duty_type_color
    FROM shift_template_duties std
    JOIN duty_types dt ON std.duty_type_id = dt.id
    WHERE std.shift_template_id = ?
    ORDER BY std.sequence
  `).bind(id).all();

  return json({
    data: {
      ...template,
      duties: duties.results,
    },
  });
}

async function createShiftTemplate(env: Env, input: ShiftTemplateInput): Promise<Response> {
  if (!input.code || !input.name || input.default_start === undefined || input.default_end === undefined) {
    return error('code, name, default_start, and default_end are required');
  }

  // Check duplicate code
  const existing = await env.DB.prepare(`
    SELECT id FROM shift_templates WHERE tenant_id = ? AND code = ? AND deleted_at IS NULL
  `).bind(TENANT_ID, input.code).first();

  if (existing) return error('Shift template code already exists');

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO shift_templates (
      id, tenant_id, code, name, shift_type, route_id, 
      default_start, default_end, default_vehicle_id, notes, 
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(
    id, TENANT_ID, input.code, input.name,
    input.shift_type || 'regular',
    input.route_id || null,
    input.default_start, input.default_end,
    input.default_vehicle_id || null,
    input.notes || null,
    now, now
  ).run();

  return getShiftTemplate(env, id);
}

async function updateShiftTemplate(env: Env, id: string, input: Partial<ShiftTemplateInput>): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) return error('Shift template not found', 404);

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof ShiftTemplateInput)[] = [
    'code', 'name', 'shift_type', 'route_id', 'default_start', 'default_end', 'default_vehicle_id', 'notes'
  ];

  for (const field of fields) {
    if (field in input) {
      updates.push(`${field} = ?`);
      bindings.push(input[field] ?? null);
    }
  }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE shift_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getShiftTemplate(env, id);
}

async function deleteShiftTemplate(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    UPDATE shift_templates SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), new Date().toISOString(), id, TENANT_ID).run();

  if (result.meta.changes === 0) return error('Shift template not found', 404);
  return json({ success: true });
}

async function addShiftDuty(env: Env, templateId: string, input: ShiftDutyInput): Promise<Response> {
  // Verify template exists
  const template = await env.DB.prepare(`
    SELECT id FROM shift_templates WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(templateId, TENANT_ID).first();

  if (!template) return error('Shift template not found', 404);

  if (!input.duty_type_id || input.sequence === undefined || input.start_offset === undefined || !input.duration) {
    return error('duty_type_id, sequence, start_offset, and duration are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO shift_template_duties (
      id, shift_template_id, duty_type_id, sequence, start_offset, duration, 
      description_template, default_vehicle, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, templateId, input.duty_type_id, input.sequence, input.start_offset, input.duration,
    input.description_template || null, input.default_vehicle ? 1 : 0, now, now
  ).run();

  return getShiftTemplate(env, templateId);
}

async function updateShiftDuty(env: Env, templateId: string, dutyId: string, input: Partial<ShiftDutyInput>): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM shift_template_duties WHERE id = ? AND shift_template_id = ?
  `).bind(dutyId, templateId).first();

  if (!existing) return error('Duty not found', 404);

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if ('duty_type_id' in input) { updates.push('duty_type_id = ?'); bindings.push(input.duty_type_id!); }
  if ('sequence' in input) { updates.push('sequence = ?'); bindings.push(input.sequence!); }
  if ('start_offset' in input) { updates.push('start_offset = ?'); bindings.push(input.start_offset!); }
  if ('duration' in input) { updates.push('duration = ?'); bindings.push(input.duration!); }
  if ('description_template' in input) { updates.push('description_template = ?'); bindings.push(input.description_template || null); }
  if ('default_vehicle' in input) { updates.push('default_vehicle = ?'); bindings.push(input.default_vehicle ? 1 : 0); }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), dutyId);

  await env.DB.prepare(`
    UPDATE shift_template_duties SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  return getShiftTemplate(env, templateId);
}

async function deleteShiftDuty(env: Env, templateId: string, dutyId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    DELETE FROM shift_template_duties WHERE id = ? AND shift_template_id = ?
  `).bind(dutyId, templateId).run();

  if (result.meta.changes === 0) return error('Duty not found', 404);
  return getShiftTemplate(env, templateId);
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
      id, tenant_id, code, name, shift_type, route_id,
      default_start, default_end, default_vehicle_id, notes,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId, TENANT_ID, newCode, `${source.name} (Copy)`,
    source.shift_type, source.route_id,
    source.default_start, source.default_end,
    source.default_vehicle_id, source.notes,
    1, now, now
  ).run();

  // Copy duties
  const duties = await env.DB.prepare(`
    SELECT * FROM shift_template_duties WHERE shift_template_id = ?
  `).bind(sourceId).all();

  for (const duty of duties.results as Record<string, unknown>[]) {
    await env.DB.prepare(`
      INSERT INTO shift_template_duties (
        id, shift_template_id, duty_type_id, sequence, start_offset, duration,
        description_template, default_vehicle, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uuid(), newId, duty.duty_type_id, duty.sequence, duty.start_offset, duty.duration,
      duty.description_template, duty.default_vehicle, now, now
    ).run();
  }

  return getShiftTemplate(env, newId);
}
