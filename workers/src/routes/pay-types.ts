/**
 * Pay Types API Routes
 * /api/pay-types/*
 * 
 * Phase 1 of Pay Management System
 * Date: January 16, 2026
 */

import { Env, json, error, uuid, parseBody } from '../index';

const TENANT_ID = 'default';

interface PayTypeInput {
  code: string;
  name: string;
  hourly_rate: number;
  display_order?: number;
  is_active?: number;
}

// ============================================
// ROUTER
// ============================================

export async function handlePayTypes(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const id = segments[0];

  // GET /api/pay-types - List all
  if (method === 'GET' && !id) {
    return listPayTypes(env);
  }

  // GET /api/pay-types/:id - Get one
  if (method === 'GET' && id) {
    return getPayType(env, id);
  }

  // POST /api/pay-types - Create
  if (method === 'POST' && !id) {
    const body = await parseBody<PayTypeInput>(request);
    if (!body) return error('Invalid request body');
    return createPayType(env, body);
  }

  // PUT /api/pay-types/:id - Update
  if (method === 'PUT' && id) {
    const body = await parseBody<Partial<PayTypeInput>>(request);
    if (!body) return error('Invalid request body');
    return updatePayType(env, id, body);
  }

  // DELETE /api/pay-types/:id - Soft delete
  if (method === 'DELETE' && id) {
    return deletePayType(env, id);
  }

  return error('Method not allowed', 405);
}

// ============================================
// HANDLERS
// ============================================

async function listPayTypes(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT id, code, name, hourly_rate, display_order, is_active, created_at, updated_at
    FROM pay_types
    WHERE tenant_id = ? AND deleted_at IS NULL
    ORDER BY display_order ASC, name ASC
  `).bind(TENANT_ID).all();

  return json({ success: true, data: result.results });
}

async function getPayType(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT id, code, name, hourly_rate, display_order, is_active, created_at, updated_at
    FROM pay_types
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!result) {
    return error('Pay type not found', 404);
  }

  return json({ success: true, data: result });
}

async function createPayType(env: Env, input: PayTypeInput): Promise<Response> {
  const { code, name, hourly_rate, display_order = 0 } = input;

  if (!code || !name || hourly_rate === undefined) {
    return error('Code, name, and hourly_rate are required');
  }

  // Check for duplicate code
  const existing = await env.DB.prepare(`
    SELECT id FROM pay_types WHERE tenant_id = ? AND code = ? AND deleted_at IS NULL
  `).bind(TENANT_ID, code.toUpperCase()).first();

  if (existing) {
    return error('Pay type code already exists', 409);
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO pay_types (id, tenant_id, code, name, hourly_rate, display_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, TENANT_ID, code.toUpperCase(), name, hourly_rate, display_order, now, now).run();

  return json({ success: true, data: { id } }, 201);
}

async function updatePayType(env: Env, id: string, input: Partial<PayTypeInput>): Promise<Response> {
  // Check exists
  const existing = await env.DB.prepare(`
    SELECT id, code FROM pay_types WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) {
    return error('Pay type not found', 404);
  }

  // Check duplicate code if changing
  if (input.code && input.code.toUpperCase() !== (existing as any).code) {
    const duplicate = await env.DB.prepare(`
      SELECT id FROM pay_types WHERE tenant_id = ? AND code = ? AND id != ? AND deleted_at IS NULL
    `).bind(TENANT_ID, input.code.toUpperCase(), id).first();

    if (duplicate) {
      return error('Pay type code already exists', 409);
    }
  }

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if (input.code !== undefined) { updates.push('code = ?'); bindings.push(input.code.toUpperCase()); }
  if (input.name !== undefined) { updates.push('name = ?'); bindings.push(input.name); }
  if (input.hourly_rate !== undefined) { updates.push('hourly_rate = ?'); bindings.push(input.hourly_rate); }
  if (input.display_order !== undefined) { updates.push('display_order = ?'); bindings.push(input.display_order); }
  if (input.is_active !== undefined) { updates.push('is_active = ?'); bindings.push(input.is_active); }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE pay_types SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return json({ success: true });
}

async function deletePayType(env: Env, id: string): Promise<Response> {
  // Check exists
  const existing = await env.DB.prepare(`
    SELECT id FROM pay_types WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) {
    return error('Pay type not found', 404);
  }

  // TODO: Check if pay type is in use by employees or pay records before allowing delete

  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE pay_types SET deleted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?
  `).bind(now, now, id, TENANT_ID).run();

  return json({ success: true });
}

