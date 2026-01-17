/**
 * Vehicles API Routes
 * /api/vehicles/*
 */

import { Env, json, error, uuid, parseBody } from '../index';
import { TENANT_ID } from '../constants';

interface VehicleInput {
  fleet_number: string;
  rego: string;
  capacity: number;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  depot_id?: string;
  notes?: string;
}

interface DailyStatusInput {
  status: string;
  reason?: string;
}

export async function handleVehicles(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const id = segments[0];
  const subResource = segments[1];

  // GET /api/vehicles
  if (method === 'GET' && !id) {
    return listVehicles(env, new URL(request.url).searchParams);
  }

  // GET /api/vehicles/:id
  if (method === 'GET' && id && !subResource) {
    return getVehicle(env, id);
  }

  // GET /api/vehicles/:id/status/:date
  if (method === 'GET' && id && subResource === 'status' && segments[2]) {
    return getVehicleStatus(env, id, segments[2]);
  }

  // POST /api/vehicles
  if (method === 'POST' && !id) {
    const body = await parseBody<VehicleInput>(request);
    if (!body) return error('Invalid request body');
    return createVehicle(env, body);
  }

  // PUT /api/vehicles/:id
  if (method === 'PUT' && id && !subResource) {
    const body = await parseBody<Partial<VehicleInput>>(request);
    if (!body) return error('Invalid request body');
    return updateVehicle(env, id, body);
  }

  // PUT /api/vehicles/:id/status/:date
  if (method === 'PUT' && id && subResource === 'status' && segments[2]) {
    const body = await parseBody<DailyStatusInput>(request);
    if (!body) return error('Invalid request body');
    return setVehicleStatus(env, id, segments[2], body);
  }

  // DELETE /api/vehicles/:id
  if (method === 'DELETE' && id && !subResource) {
    return deleteVehicle(env, id);
  }

  return error('Method not allowed', 405);
}

async function listVehicles(env: Env, params: URLSearchParams): Promise<Response> {
  const status = params.get('status');
  const minCapacity = params.get('min_capacity');
  const search = params.get('search');
  const limit = Math.min(parseInt(params.get('limit') || '100'), 500);
  const offset = parseInt(params.get('offset') || '0');

  let query = `SELECT * FROM vehicles WHERE tenant_id = ? AND deleted_at IS NULL`;
  const bindings: (string | number)[] = [TENANT_ID];

  if (status) {
    query += ` AND status = ?`;
    bindings.push(status);
  }

  if (minCapacity) {
    query += ` AND capacity >= ?`;
    bindings.push(parseInt(minCapacity));
  }

  if (search) {
    query += ` AND (fleet_number LIKE ? OR rego LIKE ? OR make LIKE ? OR model LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY fleet_number LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...bindings).all();

  // Count
  let countQuery = `SELECT COUNT(*) as total FROM vehicles WHERE tenant_id = ? AND deleted_at IS NULL`;
  const countBindings: (string | number)[] = [TENANT_ID];
  if (status) { countQuery += ` AND status = ?`; countBindings.push(status); }
  if (minCapacity) { countQuery += ` AND capacity >= ?`; countBindings.push(parseInt(minCapacity)); }
  
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first<{ total: number }>();

  return json({
    success: true,
    data: result.results,
    meta: { total: countResult?.total || 0, limit, offset },
  });
}

async function getVehicle(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM vehicles WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!result) return error('Vehicle not found', 404);
  return json({ success: true, data: result });
}

async function createVehicle(env: Env, input: VehicleInput): Promise<Response> {
  if (!input.fleet_number || !input.rego || !input.capacity) {
    return error('fleet_number, rego, and capacity are required');
  }

  // Check duplicates
  const existing = await env.DB.prepare(`
    SELECT id FROM vehicles 
    WHERE tenant_id = ? AND (fleet_number = ? OR rego = ?) AND deleted_at IS NULL
  `).bind(TENANT_ID, input.fleet_number, input.rego).first();

  if (existing) return error('Fleet number or rego already exists');

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO vehicles (
      id, tenant_id, fleet_number, rego, capacity, make, model, year, vin, depot_id, notes, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).bind(
    id, TENANT_ID, input.fleet_number, input.rego, input.capacity,
    input.make || null, input.model || null, input.year || null, input.vin || null,
    input.depot_id || null, input.notes || null, now, now
  ).run();

  return getVehicle(env, id);
}

async function updateVehicle(env: Env, id: string, input: Partial<VehicleInput>): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM vehicles WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) return error('Vehicle not found', 404);

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof VehicleInput)[] = [
    'fleet_number', 'rego', 'capacity', 'make', 'model', 'year', 'vin', 'depot_id', 'notes'
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
    UPDATE vehicles SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getVehicle(env, id);
}

async function deleteVehicle(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    UPDATE vehicles SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), new Date().toISOString(), id, TENANT_ID).run();

  if (result.meta.changes === 0) return error('Vehicle not found', 404);
  return json({ success: true });
}

async function getVehicleStatus(env: Env, vehicleId: string, date: string): Promise<Response> {
  const status = await env.DB.prepare(`
    SELECT * FROM vehicle_daily_status WHERE vehicle_id = ? AND date = ?
  `).bind(vehicleId, date).first();

  if (!status) {
    return json({ success: true, data: { vehicle_id: vehicleId, date, status: 'available' } });
  }
  return json({ success: true, data: status });
}

async function setVehicleStatus(
  env: Env,
  vehicleId: string,
  date: string,
  input: DailyStatusInput
): Promise<Response> {
  const vehicle = await env.DB.prepare(`
    SELECT id FROM vehicles WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(vehicleId, TENANT_ID).first();

  if (!vehicle) return error('Vehicle not found', 404);

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO vehicle_daily_status (id, vehicle_id, date, status, reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (vehicle_id, date) DO UPDATE SET
      status = excluded.status, reason = excluded.reason, updated_at = excluded.updated_at
  `).bind(id, vehicleId, date, input.status, input.reason || null, now, now).run();

  return getVehicleStatus(env, vehicleId, date);
}
