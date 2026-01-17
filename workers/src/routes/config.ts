/**
 * Config API Routes
 * /api/config/*
 *
 * Configuration endpoints for:
 * - Duty types
 * - Locations
 * - Routes
 */

import { Env, json, error, uuid, parseBody } from '../index';
import { TENANT_ID } from '../constants';

export async function handleConfig(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const resource = segments[0];
  const id = segments[1];

  // ============================================
  // DUTY TYPES
  // ============================================
  
  if (resource === 'duty-types') {
    // GET /api/config/duty-types
    if (method === 'GET' && !id) {
      return getDutyTypes(env);
    }

    // POST /api/config/duty-types
    if (method === 'POST' && !id) {
      const body = await parseBody<{
        code: string;
        name: string;
        color?: string;
        requires_vehicle?: boolean;
        requires_driver?: boolean;
        is_paid?: boolean;
        sort_order?: number;
      }>(request);
      if (!body) return error('Invalid request body');
      return createDutyType(env, body);
    }

    // PUT /api/config/duty-types/:id
    if (method === 'PUT' && id) {
      const body = await parseBody<Partial<{
        code: string;
        name: string;
        color: string;
        requires_vehicle: boolean;
        requires_driver: boolean;
        is_paid: boolean;
        is_active: boolean;
        sort_order: number;
      }>>(request);
      if (!body) return error('Invalid request body');
      return updateDutyType(env, id, body);
    }
  }

  // ============================================
  // LOCATIONS
  // ============================================
  
  if (resource === 'locations') {
    // GET /api/config/locations
    if (method === 'GET' && !id) {
      return getLocations(env);
    }

    // POST /api/config/locations
    if (method === 'POST' && !id) {
      const body = await parseBody<{
        name: string;
        type?: string;
        address?: string;
        lat: number;
        lng: number;
      }>(request);
      if (!body) return error('Invalid request body');
      return createLocation(env, body);
    }

    // PUT /api/config/locations/:id
    if (method === 'PUT' && id) {
      const body = await parseBody<Partial<{
        name: string;
        type: string;
        address: string;
        lat: number;
        lng: number;
        is_active: boolean;
      }>>(request);
      if (!body) return error('Invalid request body');
      return updateLocation(env, id, body);
    }

    // DELETE /api/config/locations/:id
    if (method === 'DELETE' && id) {
      return deleteLocation(env, id);
    }
  }

  // ============================================
  // ROUTES
  // ============================================
  
  if (resource === 'routes') {
    // GET /api/config/routes
    if (method === 'GET' && !id) {
      return getRoutes(env);
    }

    // POST /api/config/routes
    if (method === 'POST' && !id) {
      const body = await parseBody<{
        code: string;
        name: string;
        description?: string;
      }>(request);
      if (!body) return error('Invalid request body');
      return createRoute(env, body);
    }

    // PUT /api/config/routes/:id
    if (method === 'PUT' && id) {
      const body = await parseBody<Partial<{
        code: string;
        name: string;
        description: string;
        is_active: boolean;
      }>>(request);
      if (!body) return error('Invalid request body');
      return updateRoute(env, id, body);
    }

    // DELETE /api/config/routes/:id
    if (method === 'DELETE' && id) {
      return deleteRoute(env, id);
    }
  }

  // ============================================
  // DEPOTS
  // ============================================
  
  if (resource === 'depots') {
    // GET /api/config/depots
    if (method === 'GET' && !id) {
      return getDepots(env);
    }
  }

  return error('Not found', 404);
}

// ============================================
// DUTY TYPE HANDLERS
// ============================================

async function getDutyTypes(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM duty_types WHERE tenant_id = ? ORDER BY sort_order, name
  `).bind(TENANT_ID).all();

  return json({ success: true, data: result.results });
}

async function createDutyType(env: Env, input: {
  code: string;
  name: string;
  color?: string;
  requires_vehicle?: boolean;
  requires_driver?: boolean;
  is_paid?: boolean;
  sort_order?: number;
}): Promise<Response> {
  if (!input.code || !input.name) {
    return error('code and name are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO duty_types (
      id, tenant_id, code, name, color, requires_vehicle, requires_driver, 
      is_paid, is_active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).bind(
    id, TENANT_ID, input.code, input.name,
    input.color || '#6b7280',
    input.requires_vehicle ? 1 : 0,
    input.requires_driver !== false ? 1 : 0,
    input.is_paid !== false ? 1 : 0,
    input.sort_order || 99,
    now, now
  ).run();

  return getDutyTypes(env);
}

async function updateDutyType(env: Env, id: string, input: Record<string, unknown>): Promise<Response> {
  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if ('code' in input) { updates.push('code = ?'); bindings.push(input.code as string); }
  if ('name' in input) { updates.push('name = ?'); bindings.push(input.name as string); }
  if ('color' in input) { updates.push('color = ?'); bindings.push(input.color as string); }
  if ('requires_vehicle' in input) { updates.push('requires_vehicle = ?'); bindings.push(input.requires_vehicle ? 1 : 0); }
  if ('requires_driver' in input) { updates.push('requires_driver = ?'); bindings.push(input.requires_driver ? 1 : 0); }
  if ('is_paid' in input) { updates.push('is_paid = ?'); bindings.push(input.is_paid ? 1 : 0); }
  if ('is_active' in input) { updates.push('is_active = ?'); bindings.push(input.is_active ? 1 : 0); }
  if ('sort_order' in input) { updates.push('sort_order = ?'); bindings.push(input.sort_order as number); }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE duty_types SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getDutyTypes(env);
}

// ============================================
// LOCATION HANDLERS
// ============================================

async function getLocations(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM locations WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1 ORDER BY name
  `).bind(TENANT_ID).all();

  return json({ success: true, data: result.results });
}

async function createLocation(env: Env, input: {
  name: string;
  type?: string;
  address?: string;
  lat: number;
  lng: number;
}): Promise<Response> {
  if (!input.name || input.lat === undefined || input.lng === undefined) {
    return error('name, lat, and lng are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO locations (id, tenant_id, name, type, address, lat, lng, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, TENANT_ID, input.name, input.type || null, input.address || null, input.lat, input.lng, now, now).run();

  return getLocations(env);
}

async function updateLocation(env: Env, id: string, input: Record<string, unknown>): Promise<Response> {
  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if ('name' in input) { updates.push('name = ?'); bindings.push(input.name as string); }
  if ('type' in input) { updates.push('type = ?'); bindings.push(input.type as string || null); }
  if ('address' in input) { updates.push('address = ?'); bindings.push(input.address as string || null); }
  if ('lat' in input) { updates.push('lat = ?'); bindings.push(input.lat as number); }
  if ('lng' in input) { updates.push('lng = ?'); bindings.push(input.lng as number); }
  if ('is_active' in input) { updates.push('is_active = ?'); bindings.push(input.is_active ? 1 : 0); }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE locations SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getLocations(env);
}

async function deleteLocation(env: Env, id: string): Promise<Response> {
  await env.DB.prepare(`
    UPDATE locations SET deleted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?
  `).bind(new Date().toISOString(), new Date().toISOString(), id, TENANT_ID).run();

  return json({ success: true });
}

// ============================================
// ROUTE HANDLERS
// ============================================

async function getRoutes(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM routes WHERE tenant_id = ? AND deleted_at IS NULL AND is_active = 1 ORDER BY code
  `).bind(TENANT_ID).all();

  return json({ success: true, data: result.results });
}

async function createRoute(env: Env, input: {
  code: string;
  name: string;
  description?: string;
}): Promise<Response> {
  if (!input.code || !input.name) {
    return error('code and name are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO routes (id, tenant_id, code, name, description, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, TENANT_ID, input.code, input.name, input.description || null, now, now).run();

  return getRoutes(env);
}

async function updateRoute(env: Env, id: string, input: Record<string, unknown>): Promise<Response> {
  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if ('code' in input) { updates.push('code = ?'); bindings.push(input.code as string); }
  if ('name' in input) { updates.push('name = ?'); bindings.push(input.name as string); }
  if ('description' in input) { updates.push('description = ?'); bindings.push(input.description as string || null); }
  if ('is_active' in input) { updates.push('is_active = ?'); bindings.push(input.is_active ? 1 : 0); }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), id, TENANT_ID);

  await env.DB.prepare(`
    UPDATE routes SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getRoutes(env);
}

async function deleteRoute(env: Env, id: string): Promise<Response> {
  await env.DB.prepare(`
    UPDATE routes SET deleted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?
  `).bind(new Date().toISOString(), new Date().toISOString(), id, TENANT_ID).run();

  return json({ success: true });
}

// ============================================
// DEPOT HANDLERS
// ============================================

async function getDepots(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM depots WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_primary DESC, name
  `).bind(TENANT_ID).all();

  return json({ success: true, data: result.results });
}
