/**
 * Charters API Routes
 * /api/charters/*
 */

import { Env, json, error, uuid, parseBody } from '../index';
import { TENANT_ID } from '../constants';

interface CharterInput {
  customer_id: string;
  booking_date: string;
  name?: string;
  description?: string;
  event_date?: string;
  contact_id?: string;
  notes?: string;
}

interface CharterUpdateInput {
  customer_id?: string;
  name?: string;
  description?: string;
  event_date?: string;
  contact_id?: string;
  notes?: string;
  quoted_total?: number;
  invoiced_total?: number;
  paid_total?: number;
}

interface StatusChangeInput {
  status: 'enquiry' | 'quoted' | 'confirmed' | 'completed' | 'invoiced' | 'paid' | 'cancelled';
  cancellation_reason?: string;
}

interface NoteInput {
  note_text: string;
  created_by?: string;
}

export async function handleCharters(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const id = segments[0];
  const subResource = segments[1];

  // GET /api/charters
  if (method === 'GET' && !id) {
    return listCharters(env, new URL(request.url).searchParams);
  }

  // GET /api/charters/next-number
  if (method === 'GET' && id === 'next-number') {
    return getNextCharterNumber(env);
  }

  // GET /api/charters/:id
  if (method === 'GET' && id && !subResource) {
    return getCharter(env, id);
  }

  // GET /api/charters/:id/notes
  if (method === 'GET' && id && subResource === 'notes') {
    return getCharterNotes(env, id);
  }

  // POST /api/charters
  if (method === 'POST' && !id) {
    const body = await parseBody<CharterInput>(request);
    if (!body) return error('Invalid request body');
    return createCharter(env, body);
  }

  // POST /api/charters/:id/notes
  if (method === 'POST' && id && subResource === 'notes') {
    const body = await parseBody<NoteInput>(request);
    if (!body) return error('Invalid request body');
    return addCharterNote(env, id, body);
  }

  // POST /api/charters/:id/status
  if (method === 'POST' && id && subResource === 'status') {
    const body = await parseBody<StatusChangeInput>(request);
    if (!body) return error('Invalid request body');
    return changeCharterStatus(env, id, body);
  }

  // PUT /api/charters/:id
  if (method === 'PUT' && id && !subResource) {
    const body = await parseBody<CharterUpdateInput>(request);
    if (!body) return error('Invalid request body');
    return updateCharter(env, id, body);
  }

  // DELETE /api/charters/:id
  if (method === 'DELETE' && id && !subResource) {
    return deleteCharter(env, id);
  }

  return error('Method not allowed', 405);
}

async function listCharters(env: Env, params: URLSearchParams): Promise<Response> {
  const search = params.get('search');
  const status = params.get('status');
  const customerId = params.get('customer_id');
  const dateFrom = params.get('date_from');
  const dateTo = params.get('date_to');
  const limit = Math.min(parseInt(params.get('limit') || '100'), 500);
  const offset = parseInt(params.get('offset') || '0');

  let query = `
    SELECT
      c.*,
      cc.company_name as customer_name,
      (SELECT COUNT(*) FROM charter_trips WHERE charter_id = c.id AND deleted_at IS NULL) as trip_count
    FROM charters c
    LEFT JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE c.tenant_id = ? AND c.deleted_at IS NULL
  `;
  const bindings: (string | number)[] = [TENANT_ID];

  if (status) {
    query += ` AND c.status = ?`;
    bindings.push(status);
  }

  if (customerId) {
    query += ` AND c.customer_id = ?`;
    bindings.push(customerId);
  }

  if (dateFrom) {
    query += ` AND c.event_date >= ?`;
    bindings.push(dateFrom);
  }

  if (dateTo) {
    query += ` AND c.event_date <= ?`;
    bindings.push(dateTo);
  }

  if (search) {
    query += ` AND (c.charter_number LIKE ? OR c.name LIKE ? OR c.description LIKE ? OR cc.company_name LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY c.event_date DESC, c.created_at DESC LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...bindings).all();

  // Count query
  let countQuery = `
    SELECT COUNT(*) as total
    FROM charters c
    LEFT JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE c.tenant_id = ? AND c.deleted_at IS NULL
  `;
  const countBindings: (string | number)[] = [TENANT_ID];

  if (status) { countQuery += ` AND c.status = ?`; countBindings.push(status); }
  if (customerId) { countQuery += ` AND c.customer_id = ?`; countBindings.push(customerId); }
  if (dateFrom) { countQuery += ` AND c.event_date >= ?`; countBindings.push(dateFrom); }
  if (dateTo) { countQuery += ` AND c.event_date <= ?`; countBindings.push(dateTo); }
  if (search) {
    countQuery += ` AND (c.charter_number LIKE ? OR c.name LIKE ? OR c.description LIKE ? OR cc.company_name LIKE ?)`;
    const searchPattern = `%${search}%`;
    countBindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first<{ total: number }>();

  return json({
    success: true,
    data: result.results,
    meta: { total: countResult?.total || 0, limit, offset },
  });
}

async function getCharter(env: Env, id: string): Promise<Response> {
  // Get charter with customer info
  const charter = await env.DB.prepare(`
    SELECT
      c.*,
      cc.company_name as customer_name,
      cc.trading_name as customer_trading_name,
      cc.primary_email as customer_email,
      cc.primary_phone as customer_phone
    FROM charters c
    LEFT JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE c.id = ? AND c.tenant_id = ? AND c.deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!charter) return error('Charter not found', 404);

  // Get trips
  const trips = await env.DB.prepare(`
    SELECT * FROM charter_trips
    WHERE charter_id = ? AND tenant_id = ? AND deleted_at IS NULL
    ORDER BY trip_date, pickup_time
  `).bind(id, TENANT_ID).all();

  return json({
    success: true,
    data: {
      ...charter,
      trips: trips.results
    }
  });
}

async function createCharter(env: Env, input: CharterInput): Promise<Response> {
  if (!input.customer_id || !input.booking_date) {
    return error('customer_id and booking_date are required');
  }

  // Verify customer exists
  const customer = await env.DB.prepare(`
    SELECT id FROM charter_customers
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(input.customer_id, TENANT_ID).first();

  if (!customer) return error('Customer not found', 404);

  // Verify contact exists if provided
  if (input.contact_id) {
    const contact = await env.DB.prepare(`
      SELECT id FROM charter_customer_contacts
      WHERE id = ? AND customer_id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).bind(input.contact_id, input.customer_id, TENANT_ID).first();

    if (!contact) return error('Contact not found', 404);
  }

  // Generate charter number
  const charterNumber = await generateCharterNumber(env);
  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charters (
      id, tenant_id, customer_id, charter_number, booking_date,
      name, description, event_date, contact_id, notes,
      status, quoted_total, invoiced_total, paid_total,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'enquiry', 0, 0, 0, ?, ?)
  `).bind(
    id, TENANT_ID, input.customer_id, charterNumber, input.booking_date,
    input.name || null, input.description || null, input.event_date || null,
    input.contact_id || null, input.notes || null, now, now
  ).run();

  return getCharter(env, id);
}

async function updateCharter(env: Env, id: string, input: CharterUpdateInput): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM charters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) return error('Charter not found', 404);

  // Verify customer exists if being updated
  if (input.customer_id) {
    const customer = await env.DB.prepare(`
      SELECT id FROM charter_customers
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).bind(input.customer_id, TENANT_ID).first();

    if (!customer) return error('Customer not found', 404);
  }

  // Verify contact exists if being updated
  if (input.contact_id) {
    const contact = await env.DB.prepare(`
      SELECT id FROM charter_customer_contacts
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).bind(input.contact_id, TENANT_ID).first();

    if (!contact) return error('Contact not found', 404);
  }

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof CharterUpdateInput)[] = [
    'customer_id', 'name', 'description', 'event_date', 'contact_id',
    'notes', 'quoted_total', 'invoiced_total', 'paid_total'
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
    UPDATE charters SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getCharter(env, id);
}

async function deleteCharter(env: Env, id: string): Promise<Response> {
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    UPDATE charters SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(now, now, id, TENANT_ID).run();

  if (result.meta.changes === 0) return error('Charter not found', 404);
  return json({ success: true });
}

async function changeCharterStatus(
  env: Env,
  id: string,
  input: StatusChangeInput
): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT status FROM charters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first<{ status: string }>();

  if (!existing) return error('Charter not found', 404);

  const validStatuses = ['enquiry', 'quoted', 'confirmed', 'completed', 'invoiced', 'paid', 'cancelled'];
  if (!validStatuses.includes(input.status)) {
    return error('Invalid status value');
  }

  const now = new Date().toISOString();
  const updates: string[] = ['status = ?', 'updated_at = ?'];
  const bindings: (string | null)[] = [input.status, now];

  // Handle cancellation
  if (input.status === 'cancelled') {
    if (!input.cancellation_reason) {
      return error('cancellation_reason is required when status is cancelled');
    }
    updates.push('cancelled_at = ?', 'cancellation_reason = ?');
    bindings.push(now, input.cancellation_reason);
  }

  bindings.push(id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE charters SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getCharter(env, id);
}

async function getCharterNotes(env: Env, charterId: string): Promise<Response> {
  // Verify charter exists
  const charter = await env.DB.prepare(`
    SELECT id FROM charters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(charterId, TENANT_ID).first();

  if (!charter) return error('Charter not found', 404);

  const notes = await env.DB.prepare(`
    SELECT * FROM charter_notes
    WHERE charter_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).bind(charterId, TENANT_ID).all();

  return json({ success: true, data: notes.results });
}

async function addCharterNote(env: Env, charterId: string, input: NoteInput): Promise<Response> {
  if (!input.note_text || input.note_text.trim().length === 0) {
    return error('note_text is required and cannot be empty');
  }

  // Verify charter exists
  const charter = await env.DB.prepare(`
    SELECT id FROM charters WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(charterId, TENANT_ID).first();

  if (!charter) return error('Charter not found', 404);

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charter_notes (
      id, tenant_id, charter_id, note_text, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id, TENANT_ID, charterId, input.note_text.trim(),
    input.created_by || null, now
  ).run();

  const note = await env.DB.prepare(`
    SELECT * FROM charter_notes WHERE id = ?
  `).bind(id).first();

  return json({ success: true, data: note });
}

async function getNextCharterNumber(env: Env): Promise<Response> {
  const nextNumber = await generateCharterNumber(env);
  return json({ success: true, data: { charter_number: nextNumber } });
}

/**
 * Generate next charter number in format: CHT-YYYY-NNNN
 * e.g., CHT-2026-0001
 */
async function generateCharterNumber(env: Env): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CHT-${year}-`;

  // Get the highest charter number for the current year
  const result = await env.DB.prepare(`
    SELECT charter_number FROM charters
    WHERE tenant_id = ? AND charter_number LIKE ?
    ORDER BY charter_number DESC LIMIT 1
  `).bind(TENANT_ID, `${prefix}%`).first<{ charter_number: string }>();

  let nextNumber = 1;

  if (result?.charter_number) {
    // Extract the numeric part and increment
    const parts = result.charter_number.split('-');
    if (parts.length === 3) {
      const currentNumber = parseInt(parts[2], 10);
      if (!isNaN(currentNumber)) {
        nextNumber = currentNumber + 1;
      }
    }
  }

  // Format with leading zeros (0001, 0002, etc.)
  const paddedNumber = nextNumber.toString().padStart(4, '0');
  return `${prefix}${paddedNumber}`;
}
