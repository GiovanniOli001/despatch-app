/**
 * Employee Custom Fields API Routes
 * /api/employee-fields/*
 */

import { Env, json, error, uuid, parseBody } from '../index';
import { TENANT_ID } from '../constants';

interface FieldDefinitionInput {
  field_name: string;
  field_key: string;
  field_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  field_options?: string[];  // For select type
  field_width?: 'half' | 'full';  // Layout width
  display_row?: number;  // Row number for layout
  is_required?: boolean;
  display_order?: number;
  tab_name?: string;
}

interface FieldValueInput {
  employee_id: string;
  field_definition_id: string;
  value: string | null;
}

interface BulkFieldValuesInput {
  employee_id: string;
  values: { field_definition_id: string; value: string | null }[];
}

export async function handleEmployeeFields(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const seg1 = segments[0];  // 'definitions' or 'values'
  const seg2 = segments[1];  // id or 'bulk'
  const seg3 = segments[2];  // for nested routes

  try {
    // ============================================
    // FIELD DEFINITIONS
    // ============================================

    // GET /api/employee-fields/definitions - List all field definitions
    if (method === 'GET' && seg1 === 'definitions' && !seg2) {
      return listFieldDefinitions(env);
    }

    // GET /api/employee-fields/definitions/:id - Get single definition
    if (method === 'GET' && seg1 === 'definitions' && seg2) {
      return getFieldDefinition(env, seg2);
    }

    // POST /api/employee-fields/definitions - Create definition
    if (method === 'POST' && seg1 === 'definitions' && !seg2) {
      const body = await parseBody<FieldDefinitionInput>(request);
      if (!body) return error('Invalid request body');
      return createFieldDefinition(env, body);
    }

    // PUT /api/employee-fields/definitions/:id - Update definition
    if (method === 'PUT' && seg1 === 'definitions' && seg2) {
      const body = await parseBody<Partial<FieldDefinitionInput>>(request);
      if (!body) return error('Invalid request body');
      return updateFieldDefinition(env, seg2, body);
    }

    // DELETE /api/employee-fields/definitions/:id - Soft delete definition
    if (method === 'DELETE' && seg1 === 'definitions' && seg2) {
      return deleteFieldDefinition(env, seg2);
    }

    // POST /api/employee-fields/definitions/reorder - Reorder definitions
    if (method === 'POST' && seg1 === 'definitions' && seg2 === 'reorder') {
      const body = await parseBody<{ order: string[] }>(request);
      if (!body) return error('Invalid request body');
      return reorderFieldDefinitions(env, body.order);
    }

    // POST /api/employee-fields/definitions/update-layouts - Update multiple field layouts
    if (method === 'POST' && seg1 === 'definitions' && seg2 === 'update-layouts') {
      const body = await parseBody<{ layouts: { id: string; display_row: number; field_width: string; display_order: number }[] }>(request);
      if (!body) return error('Invalid request body');
      return updateFieldLayouts(env, body.layouts);
    }

    // ============================================
    // FIELD VALUES
    // ============================================

    // GET /api/employee-fields/values/:employeeId - Get all values for an employee
    if (method === 'GET' && seg1 === 'values' && seg2) {
      return getEmployeeFieldValues(env, seg2);
    }

    // POST /api/employee-fields/values/bulk - Save multiple values for an employee
    if (method === 'POST' && seg1 === 'values' && seg2 === 'bulk') {
      const body = await parseBody<BulkFieldValuesInput>(request);
      if (!body) return error('Invalid request body');
      return saveEmployeeFieldValues(env, body);
    }

    // PUT /api/employee-fields/values/:id - Update single value
    if (method === 'PUT' && seg1 === 'values' && seg2) {
      const body = await parseBody<{ value: string | null }>(request);
      if (!body) return error('Invalid request body');
      return updateFieldValue(env, seg2, body.value);
    }

    return error('Method not allowed', 405);
  } catch (err) {
    console.error('handleEmployeeFields error:', err);
    return error(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// ============================================
// FIELD DEFINITIONS CRUD
// ============================================

async function listFieldDefinitions(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM employee_custom_field_definitions
    WHERE tenant_id = ? AND deleted_at IS NULL
    ORDER BY display_row ASC, display_order ASC, created_at ASC
  `).bind(TENANT_ID).all();

  // Parse field_options JSON
  const definitions = result.results.map((def: any) => ({
    ...def,
    field_options: def.field_options ? JSON.parse(def.field_options) : null,
    is_required: def.is_required === 1,
    display_row: def.display_row ?? 0
  }));

  return json({ success: true, data: definitions });
}

async function getFieldDefinition(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM employee_custom_field_definitions
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!result) {
    return error('Field definition not found', 404);
  }

  const def = result as any;
  return json({
    success: true,
    data: {
      ...def,
      field_options: def.field_options ? JSON.parse(def.field_options) : null,
      is_required: def.is_required === 1
    }
  });
}

async function createFieldDefinition(env: Env, input: FieldDefinitionInput): Promise<Response> {
  if (!input.field_name || !input.field_key || !input.field_type) {
    return error('field_name, field_key, and field_type are required');
  }

  // Validate field_type
  const validTypes = ['text', 'number', 'date', 'select', 'boolean'];
  if (!validTypes.includes(input.field_type)) {
    return error(`field_type must be one of: ${validTypes.join(', ')}`);
  }

  // Validate select has options
  if (input.field_type === 'select' && (!input.field_options || input.field_options.length === 0)) {
    return error('field_options are required for select type');
  }

  // Sanitize field_key
  const sanitizedKey = input.field_key.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  // Check for duplicate key
  const existing = await env.DB.prepare(`
    SELECT id FROM employee_custom_field_definitions
    WHERE tenant_id = ? AND field_key = ? AND deleted_at IS NULL
  `).bind(TENANT_ID, sanitizedKey).first();

  if (existing) {
    return error(`Field key "${sanitizedKey}" already exists`);
  }

  // Get next display order
  const maxOrder = await env.DB.prepare(`
    SELECT MAX(display_order) as max_order FROM employee_custom_field_definitions
    WHERE tenant_id = ? AND deleted_at IS NULL
  `).bind(TENANT_ID).first() as { max_order: number | null } | null;

  const displayOrder = input.display_order ?? ((maxOrder?.max_order || 0) + 1);

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO employee_custom_field_definitions (
      id, tenant_id, field_name, field_key, field_type, field_options,
      field_width, display_row, is_required, display_order, tab_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    TENANT_ID,
    input.field_name,
    sanitizedKey,
    input.field_type,
    input.field_options ? JSON.stringify(input.field_options) : null,
    input.field_width || 'full',
    input.display_row ?? 0,
    input.is_required ? 1 : 0,
    displayOrder,
    input.tab_name || 'Custom',
    now,
    now
  ).run();

  return getFieldDefinition(env, id);
}

async function updateFieldDefinition(env: Env, id: string, input: Partial<FieldDefinitionInput>): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM employee_custom_field_definitions
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) {
    return error('Field definition not found', 404);
  }

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if (input.field_name !== undefined) {
    updates.push('field_name = ?');
    bindings.push(input.field_name);
  }

  if (input.field_type !== undefined) {
    const validTypes = ['text', 'number', 'date', 'select', 'boolean'];
    if (!validTypes.includes(input.field_type)) {
      return error(`field_type must be one of: ${validTypes.join(', ')}`);
    }
    updates.push('field_type = ?');
    bindings.push(input.field_type);
  }

  if (input.field_options !== undefined) {
    updates.push('field_options = ?');
    bindings.push(input.field_options ? JSON.stringify(input.field_options) : null);
  }

  if (input.is_required !== undefined) {
    updates.push('is_required = ?');
    bindings.push(input.is_required ? 1 : 0);
  }

  if (input.display_order !== undefined) {
    updates.push('display_order = ?');
    bindings.push(input.display_order);
  }

  if (input.tab_name !== undefined) {
    updates.push('tab_name = ?');
    bindings.push(input.tab_name);
  }

  if (input.field_width !== undefined) {
    updates.push('field_width = ?');
    bindings.push(input.field_width);
  }

  if (input.display_row !== undefined) {
    updates.push('display_row = ?');
    bindings.push(input.display_row);
  }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(id);

  await env.DB.prepare(`
    UPDATE employee_custom_field_definitions SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  return getFieldDefinition(env, id);
}

async function deleteFieldDefinition(env: Env, id: string): Promise<Response> {
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    UPDATE employee_custom_field_definitions
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(now, now, id, TENANT_ID).run();

  if (result.meta.changes === 0) {
    return error('Field definition not found', 404);
  }

  // Also soft-delete all values for this field
  await env.DB.prepare(`
    DELETE FROM employee_custom_field_values WHERE field_definition_id = ?
  `).bind(id).run();

  return json({ success: true, message: 'Field definition deleted' });
}

async function reorderFieldDefinitions(env: Env, order: string[]): Promise<Response> {
  const now = new Date().toISOString();

  for (let i = 0; i < order.length; i++) {
    await env.DB.prepare(`
      UPDATE employee_custom_field_definitions
      SET display_order = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(i, now, order[i], TENANT_ID).run();
  }

  return json({ success: true, message: 'Field order updated' });
}

async function updateFieldLayouts(env: Env, layouts: { id: string; display_row: number; field_width: string; display_order: number }[]): Promise<Response> {
  const now = new Date().toISOString();

  for (const layout of layouts) {
    await env.DB.prepare(`
      UPDATE employee_custom_field_definitions
      SET display_row = ?, field_width = ?, display_order = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).bind(layout.display_row, layout.field_width, layout.display_order, now, layout.id, TENANT_ID).run();
  }

  return json({ success: true, message: 'Field layouts updated' });
}

// ============================================
// FIELD VALUES CRUD
// ============================================

async function getEmployeeFieldValues(env: Env, employeeId: string): Promise<Response> {
  // Get all field definitions
  const definitions = await env.DB.prepare(`
    SELECT * FROM employee_custom_field_definitions
    WHERE tenant_id = ? AND deleted_at IS NULL
    ORDER BY display_order ASC
  `).bind(TENANT_ID).all();

  // Get existing values for this employee
  const values = await env.DB.prepare(`
    SELECT * FROM employee_custom_field_values
    WHERE tenant_id = ? AND employee_id = ?
  `).bind(TENANT_ID, employeeId).all();

  // Create a map of definition_id -> value
  const valueMap = new Map<string, string | null>();
  for (const v of values.results as any[]) {
    valueMap.set(v.field_definition_id, v.value);
  }

  // Return definitions with their values
  const result = (definitions.results as any[]).map(def => ({
    ...def,
    field_options: def.field_options ? JSON.parse(def.field_options) : null,
    is_required: def.is_required === 1,
    value: valueMap.get(def.id) ?? null
  }));

  return json({ success: true, data: result });
}

async function saveEmployeeFieldValues(env: Env, input: BulkFieldValuesInput): Promise<Response> {
  if (!input.employee_id || !input.values) {
    return error('employee_id and values are required');
  }

  // Verify employee exists
  const employee = await env.DB.prepare(`
    SELECT id FROM employees WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(input.employee_id, TENANT_ID).first();

  if (!employee) {
    return error('Employee not found', 404);
  }

  const now = new Date().toISOString();

  for (const fieldValue of input.values) {
    // Verify field definition exists
    const def = await env.DB.prepare(`
      SELECT id FROM employee_custom_field_definitions
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).bind(fieldValue.field_definition_id, TENANT_ID).first();

    if (!def) continue; // Skip invalid definitions

    // Check if value already exists
    const existing = await env.DB.prepare(`
      SELECT id FROM employee_custom_field_values
      WHERE employee_id = ? AND field_definition_id = ?
    `).bind(input.employee_id, fieldValue.field_definition_id).first();

    if (existing) {
      // Update existing value
      await env.DB.prepare(`
        UPDATE employee_custom_field_values
        SET value = ?, updated_at = ?
        WHERE id = ?
      `).bind(fieldValue.value, now, (existing as any).id).run();
    } else {
      // Insert new value
      const id = uuid();
      await env.DB.prepare(`
        INSERT INTO employee_custom_field_values (
          id, tenant_id, employee_id, field_definition_id, value, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, TENANT_ID, input.employee_id, fieldValue.field_definition_id, fieldValue.value, now, now).run();
    }
  }

  return json({ success: true, message: 'Field values saved' });
}

async function updateFieldValue(env: Env, valueId: string, value: string | null): Promise<Response> {
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    UPDATE employee_custom_field_values
    SET value = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(value, now, valueId, TENANT_ID).run();

  if (result.meta.changes === 0) {
    return error('Field value not found', 404);
  }

  return json({ success: true, message: 'Field value updated' });
}
