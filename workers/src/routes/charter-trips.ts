/**
 * Charter Trips API Routes
 * Handles charter trip management including stops and line items
 */

import { json, error, uuid, parseBody } from '../index';
import type { Env } from '../index';

interface CharterTrip {
  id?: string;
  charter_id: string;
  trip_number?: number;
  name?: string;
  trip_date: string;
  pickup_time: string;
  estimated_end_time?: string;
  estimated_duration_mins?: number;
  passenger_count: number;
  passenger_notes?: string;
  pickup_name: string;
  pickup_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_notes?: string;
  dropoff_name: string;
  dropoff_address?: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  dropoff_notes?: string;
  vehicle_capacity_required?: number;
  vehicle_features_required?: string;
  assigned_vehicle_id?: string;
  assigned_driver_id?: string;
  operational_status?: string;
  billing_status?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  special_instructions?: string;
}

interface TripStop {
  id?: string;
  trip_id: string;
  sequence: number;
  stop_name: string;
  stop_address?: string;
  stop_lat?: number;
  stop_lng?: number;
  estimated_arrival?: string;
  stop_duration_mins?: number;
  stop_type?: string;
  notes?: string;
  passengers_on?: number;
  passengers_off?: number;
}

interface LineItem {
  id?: string;
  trip_id: string;
  item_type: string;
  description: string;
  quantity?: number;
  unit_price: number;
  total_price?: number;
  is_taxable?: number;
  tax_amount?: number;
  display_order?: number;
  is_hidden?: number;
}

export async function handleCharterTrips(
  request: Request,
  env: Env,
  pathSegments: string[]
): Promise<Response> {
  const method = request.method;
  const url = new URL(request.url);

  // Route based on path segments
  if (pathSegments.length === 0) {
    // /api/charter-trips
    if (method === 'GET') {
      return listTrips(env, url);
    } else if (method === 'POST') {
      return createTrip(request, env);
    }
  } else if (pathSegments.length === 1) {
    // /api/charter-trips/:id
    const tripId = pathSegments[0];
    if (method === 'GET') {
      return getTrip(env, tripId);
    } else if (method === 'PUT') {
      return updateTrip(request, env, tripId);
    } else if (method === 'DELETE') {
      return deleteTrip(env, tripId);
    }
  } else if (pathSegments.length === 2) {
    // /api/charter-trips/:id/:action
    const tripId = pathSegments[0];
    const action = pathSegments[1];

    if (action === 'status' && method === 'POST') {
      return changeStatus(request, env, tripId);
    } else if (action === 'duplicate' && method === 'POST') {
      return duplicateTrip(env, tripId);
    } else if (action === 'stops') {
      if (method === 'GET') {
        return listStops(env, tripId);
      } else if (method === 'POST') {
        return createStop(request, env, tripId);
      }
    } else if (action === 'line-items') {
      if (method === 'GET') {
        return listLineItems(env, tripId);
      } else if (method === 'POST') {
        return createLineItem(request, env, tripId);
      }
    }
  } else if (pathSegments.length === 3) {
    // /api/charter-trips/:id/stops/:stopId or line-items/:itemId
    const tripId = pathSegments[0];
    const resource = pathSegments[1];
    const resourceId = pathSegments[2];

    if (resource === 'stops') {
      if (method === 'PUT') {
        return updateStop(request, env, tripId, resourceId);
      } else if (method === 'DELETE') {
        return deleteStop(env, tripId, resourceId);
      }
    } else if (resource === 'line-items') {
      if (method === 'PUT') {
        return updateLineItem(request, env, tripId, resourceId);
      } else if (method === 'DELETE') {
        return deleteLineItem(env, tripId, resourceId);
      }
    }
  }

  return error('Not found', 404);
}

// ============================================
// TRIP ENDPOINTS
// ============================================

async function listTrips(env: Env, url: URL): Promise<Response> {
  const charterId = url.searchParams.get('charter_id');
  const date = url.searchParams.get('date');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const operationalStatus = url.searchParams.get('operational_status');
  const forDispatch = url.searchParams.get('for_dispatch') === 'true';

  let query = `
    SELECT
      ct.*,
      c.charter_number,
      cc.company_name as customer_name,
      (SELECT COUNT(*) FROM charter_journeys cj WHERE cj.trip_id = ct.id AND cj.deleted_at IS NULL) as journey_count
    FROM charter_trips ct
    INNER JOIN charters c ON ct.charter_id = c.id
    INNER JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE ct.deleted_at IS NULL
      AND ct.tenant_id = 'default'
  `;

  const params: any[] = [];

  if (charterId) {
    query += ` AND ct.charter_id = ?`;
    params.push(charterId);
  }

  if (date) {
    query += ` AND ct.trip_date = ?`;
    params.push(date);
  }

  if (dateFrom) {
    query += ` AND ct.trip_date >= ?`;
    params.push(dateFrom);
  }

  if (dateTo) {
    query += ` AND ct.trip_date <= ?`;
    params.push(dateTo);
  }

  if (operationalStatus) {
    query += ` AND ct.operational_status = ?`;
    params.push(operationalStatus);
  }

  // For dispatch integration: only return booked trips
  if (forDispatch) {
    query += ` AND ct.operational_status = 'booked'`;
  }

  query += ` ORDER BY ct.trip_date, ct.pickup_time, ct.trip_number`;

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ success: true, data: result.results || [] });
}

async function getTrip(env: Env, tripId: string): Promise<Response> {
  // Get trip with charter info and journey count
  const tripResult = await env.DB.prepare(`
    SELECT
      ct.*,
      c.charter_number,
      c.name as charter_name,
      cc.company_name as customer_name,
      (SELECT COUNT(*) FROM charter_journeys cj WHERE cj.trip_id = ct.id AND cj.deleted_at IS NULL) as journey_count
    FROM charter_trips ct
    INNER JOIN charters c ON ct.charter_id = c.id
    INNER JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE ct.id = ?
      AND ct.deleted_at IS NULL
      AND ct.tenant_id = 'default'
  `).bind(tripId).first();

  if (!tripResult) {
    return error('Trip not found', 404);
  }

  // Get journeys
  const journeysResult = await env.DB.prepare(`
    SELECT *
    FROM charter_journeys
    WHERE trip_id = ?
      AND deleted_at IS NULL
      AND tenant_id = 'default'
    ORDER BY sequence
  `).bind(tripId).all();

  // Get line items
  const lineItemsResult = await env.DB.prepare(`
    SELECT *
    FROM charter_trip_line_items
    WHERE trip_id = ?
      AND tenant_id = 'default'
    ORDER BY display_order, created_at
  `).bind(tripId).all();

  const trip = {
    ...tripResult,
    journeys: journeysResult.results || [],
    line_items: lineItemsResult.results || []
  };

  return json({ success: true, data: trip });
}

async function createTrip(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<CharterTrip>(request);
  if (!body) {
    return error('Invalid request body');
  }

  // Validate required fields (pickup_name, dropoff_name now optional - handled by journeys)
  if (!body.charter_id || !body.trip_date) {
    return error('Missing required fields: charter_id, trip_date');
  }

  // Get next trip number for this charter
  const maxTripNumber = await env.DB.prepare(`
    SELECT COALESCE(MAX(trip_number), 0) as max_num
    FROM charter_trips
    WHERE charter_id = ?
      AND tenant_id = 'default'
  `).bind(body.charter_id).first();

  const tripNumber = (maxTripNumber?.max_num as number || 0) + 1;

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charter_trips (
      id, tenant_id, charter_id, trip_number, name,
      trip_date, pickup_time, estimated_end_time, estimated_duration_mins,
      passenger_count, passenger_notes,
      pickup_name, pickup_address, pickup_lat, pickup_lng, pickup_notes,
      dropoff_name, dropoff_address, dropoff_lat, dropoff_lng, dropoff_notes,
      vehicle_capacity_required, vehicle_features_required,
      assigned_vehicle_id, assigned_driver_id,
      operational_status, billing_status,
      special_instructions,
      created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'not_invoiced', ?, ?, ?)
  `).bind(
    id,
    body.charter_id,
    tripNumber,
    body.name || null,
    body.trip_date,
    body.pickup_time || null,
    body.estimated_end_time || null,
    body.estimated_duration_mins || null,
    body.passenger_count || 1,
    body.passenger_notes || null,
    body.pickup_name || null,
    body.pickup_address || null,
    body.pickup_lat || null,
    body.pickup_lng || null,
    body.pickup_notes || null,
    body.dropoff_name || null,
    body.dropoff_address || null,
    body.dropoff_lat || null,
    body.dropoff_lng || null,
    body.dropoff_notes || null,
    body.vehicle_capacity_required || null,
    body.vehicle_features_required || null,
    body.assigned_vehicle_id || null,
    body.assigned_driver_id || null,
    body.special_instructions || null,
    now,
    now
  ).run();

  // Fetch created trip
  const trip = await env.DB.prepare(`
    SELECT ct.*, c.charter_number, cc.company_name as customer_name
    FROM charter_trips ct
    INNER JOIN charters c ON ct.charter_id = c.id
    INNER JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE ct.id = ?
  `).bind(id).first();

  return json({ success: true, data: trip }, 201);
}

async function updateTrip(request: Request, env: Env, tripId: string): Promise<Response> {
  const body = await parseBody<Partial<CharterTrip>>(request);
  if (!body) {
    return error('Invalid request body');
  }

  // Verify trip exists
  const existing = await env.DB.prepare(`
    SELECT id FROM charter_trips WHERE id = ? AND deleted_at IS NULL AND tenant_id = 'default'
  `).bind(tripId).first();

  if (!existing) {
    return error('Trip not found', 404);
  }

  const updates: string[] = [];
  const params: any[] = [];

  // Allow updating all editable fields
  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  if (body.trip_date !== undefined) {
    updates.push('trip_date = ?');
    params.push(body.trip_date);
  }
  if (body.pickup_time !== undefined) {
    updates.push('pickup_time = ?');
    params.push(body.pickup_time);
  }
  if (body.estimated_end_time !== undefined) {
    updates.push('estimated_end_time = ?');
    params.push(body.estimated_end_time);
  }
  if (body.estimated_duration_mins !== undefined) {
    updates.push('estimated_duration_mins = ?');
    params.push(body.estimated_duration_mins);
  }
  if (body.passenger_count !== undefined) {
    updates.push('passenger_count = ?');
    params.push(body.passenger_count);
  }
  if (body.passenger_notes !== undefined) {
    updates.push('passenger_notes = ?');
    params.push(body.passenger_notes);
  }
  if (body.pickup_name !== undefined) {
    updates.push('pickup_name = ?');
    params.push(body.pickup_name);
  }
  if (body.pickup_address !== undefined) {
    updates.push('pickup_address = ?');
    params.push(body.pickup_address);
  }
  if (body.pickup_lat !== undefined) {
    updates.push('pickup_lat = ?');
    params.push(body.pickup_lat);
  }
  if (body.pickup_lng !== undefined) {
    updates.push('pickup_lng = ?');
    params.push(body.pickup_lng);
  }
  if (body.pickup_notes !== undefined) {
    updates.push('pickup_notes = ?');
    params.push(body.pickup_notes);
  }
  if (body.dropoff_name !== undefined) {
    updates.push('dropoff_name = ?');
    params.push(body.dropoff_name);
  }
  if (body.dropoff_address !== undefined) {
    updates.push('dropoff_address = ?');
    params.push(body.dropoff_address);
  }
  if (body.dropoff_lat !== undefined) {
    updates.push('dropoff_lat = ?');
    params.push(body.dropoff_lat);
  }
  if (body.dropoff_lng !== undefined) {
    updates.push('dropoff_lng = ?');
    params.push(body.dropoff_lng);
  }
  if (body.dropoff_notes !== undefined) {
    updates.push('dropoff_notes = ?');
    params.push(body.dropoff_notes);
  }
  if (body.vehicle_capacity_required !== undefined) {
    updates.push('vehicle_capacity_required = ?');
    params.push(body.vehicle_capacity_required);
  }
  if (body.vehicle_features_required !== undefined) {
    updates.push('vehicle_features_required = ?');
    params.push(body.vehicle_features_required);
  }
  if (body.assigned_vehicle_id !== undefined) {
    updates.push('assigned_vehicle_id = ?');
    params.push(body.assigned_vehicle_id);
  }
  if (body.assigned_driver_id !== undefined) {
    updates.push('assigned_driver_id = ?');
    params.push(body.assigned_driver_id);
  }
  if (body.special_instructions !== undefined) {
    updates.push('special_instructions = ?');
    params.push(body.special_instructions);
  }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(tripId);

  await env.DB.prepare(`
    UPDATE charter_trips
    SET ${updates.join(', ')}
    WHERE id = ?
  `).bind(...params).run();

  // Fetch updated trip
  const trip = await env.DB.prepare(`
    SELECT ct.*, c.charter_number, cc.company_name as customer_name
    FROM charter_trips ct
    INNER JOIN charters c ON ct.charter_id = c.id
    INNER JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE ct.id = ?
  `).bind(tripId).first();

  return json({ success: true, data: trip });
}

async function deleteTrip(env: Env, tripId: string): Promise<Response> {
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    UPDATE charter_trips
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL AND tenant_id = 'default'
  `).bind(now, now, tripId).run();

  if (result.meta.changes === 0) {
    return error('Trip not found', 404);
  }

  return json({ success: true });
}

async function changeStatus(request: Request, env: Env, tripId: string): Promise<Response> {
  const body = await parseBody<{ status: string; cancellation_reason?: string }>(request);
  if (!body || !body.status) {
    return error('Missing status field');
  }

  const validStatuses = ['draft', 'booked', 'in_progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(body.status)) {
    return error('Invalid status. Must be one of: draft, booked, in_progress, completed, cancelled');
  }

  const now = new Date().toISOString();
  const updates: string[] = ['operational_status = ?', 'updated_at = ?'];
  const params: any[] = [body.status, now];

  // Handle cancellation
  if (body.status === 'cancelled') {
    if (!body.cancellation_reason) {
      return error('Cancellation reason is required when cancelling a trip');
    }
    updates.push('cancelled_at = ?');
    updates.push('cancellation_reason = ?');
    params.push(now);
    params.push(body.cancellation_reason);
  }

  params.push(tripId);

  const result = await env.DB.prepare(`
    UPDATE charter_trips
    SET ${updates.join(', ')}
    WHERE id = ? AND deleted_at IS NULL AND tenant_id = 'default'
  `).bind(...params).run();

  if (result.meta.changes === 0) {
    return error('Trip not found', 404);
  }

  // Fetch updated trip
  const trip = await env.DB.prepare(`
    SELECT ct.*, c.charter_number, cc.company_name as customer_name
    FROM charter_trips ct
    INNER JOIN charters c ON ct.charter_id = c.id
    INNER JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE ct.id = ?
  `).bind(tripId).first();

  return json({ success: true, data: trip });
}

async function duplicateTrip(env: Env, tripId: string): Promise<Response> {
  // Fetch original trip
  const original = await env.DB.prepare(`
    SELECT * FROM charter_trips
    WHERE id = ? AND deleted_at IS NULL AND tenant_id = 'default'
  `).bind(tripId).first();

  if (!original) {
    return error('Trip not found', 404);
  }

  // Get next trip number
  const maxTripNumber = await env.DB.prepare(`
    SELECT COALESCE(MAX(trip_number), 0) as max_num
    FROM charter_trips
    WHERE charter_id = ? AND tenant_id = 'default'
  `).bind(original.charter_id as string).first();

  const tripNumber = (maxTripNumber?.max_num as number || 0) + 1;

  const id = uuid();
  const now = new Date().toISOString();

  // Swap pickup and dropoff for return journey
  await env.DB.prepare(`
    INSERT INTO charter_trips (
      id, tenant_id, charter_id, trip_number, name,
      trip_date, pickup_time, estimated_end_time, estimated_duration_mins,
      passenger_count, passenger_notes,
      pickup_name, pickup_address, pickup_lat, pickup_lng, pickup_notes,
      dropoff_name, dropoff_address, dropoff_lat, dropoff_lng, dropoff_notes,
      vehicle_capacity_required, vehicle_features_required,
      assigned_vehicle_id, assigned_driver_id,
      operational_status, billing_status,
      special_instructions,
      created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'not_invoiced', ?, ?, ?)
  `).bind(
    id,
    original.charter_id,
    tripNumber,
    original.name ? `${original.name} (Return)` : null,
    original.trip_date,
    original.pickup_time,
    original.estimated_end_time || null,
    original.estimated_duration_mins || null,
    original.passenger_count,
    original.passenger_notes || null,
    // Swap pickup/dropoff
    original.dropoff_name,
    original.dropoff_address || null,
    original.dropoff_lat || null,
    original.dropoff_lng || null,
    original.dropoff_notes || null,
    original.pickup_name,
    original.pickup_address || null,
    original.pickup_lat || null,
    original.pickup_lng || null,
    original.pickup_notes || null,
    original.vehicle_capacity_required || null,
    original.vehicle_features_required || null,
    original.assigned_vehicle_id || null,
    original.assigned_driver_id || null,
    original.special_instructions || null,
    now,
    now
  ).run();

  // Fetch created trip
  const trip = await env.DB.prepare(`
    SELECT ct.*, c.charter_number, cc.company_name as customer_name
    FROM charter_trips ct
    INNER JOIN charters c ON ct.charter_id = c.id
    INNER JOIN charter_customers cc ON c.customer_id = cc.id
    WHERE ct.id = ?
  `).bind(id).first();

  return json({ success: true, data: trip }, 201);
}

// ============================================
// STOPS ENDPOINTS
// ============================================

async function listStops(env: Env, tripId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT *
    FROM charter_trip_stops
    WHERE trip_id = ? AND tenant_id = 'default'
    ORDER BY sequence
  `).bind(tripId).all();

  return json({ success: true, data: result.results || [] });
}

async function createStop(request: Request, env: Env, tripId: string): Promise<Response> {
  const body = await parseBody<TripStop>(request);
  if (!body) {
    return error('Invalid request body');
  }

  if (body.sequence === undefined || !body.stop_name) {
    return error('Missing required fields: sequence, stop_name');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charter_trip_stops (
      id, tenant_id, trip_id, sequence,
      stop_name, stop_address, stop_lat, stop_lng,
      estimated_arrival, stop_duration_mins,
      stop_type, notes,
      passengers_on, passengers_off,
      created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    tripId,
    body.sequence,
    body.stop_name,
    body.stop_address || null,
    body.stop_lat || null,
    body.stop_lng || null,
    body.estimated_arrival || null,
    body.stop_duration_mins || 0,
    body.stop_type || 'stop',
    body.notes || null,
    body.passengers_on || 0,
    body.passengers_off || 0,
    now,
    now
  ).run();

  const stop = await env.DB.prepare(`
    SELECT * FROM charter_trip_stops WHERE id = ?
  `).bind(id).first();

  return json({ success: true, data: stop }, 201);
}

async function updateStop(request: Request, env: Env, tripId: string, stopId: string): Promise<Response> {
  const body = await parseBody<Partial<TripStop>>(request);
  if (!body) {
    return error('Invalid request body');
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (body.sequence !== undefined) {
    updates.push('sequence = ?');
    params.push(body.sequence);
  }
  if (body.stop_name !== undefined) {
    updates.push('stop_name = ?');
    params.push(body.stop_name);
  }
  if (body.stop_address !== undefined) {
    updates.push('stop_address = ?');
    params.push(body.stop_address);
  }
  if (body.stop_lat !== undefined) {
    updates.push('stop_lat = ?');
    params.push(body.stop_lat);
  }
  if (body.stop_lng !== undefined) {
    updates.push('stop_lng = ?');
    params.push(body.stop_lng);
  }
  if (body.estimated_arrival !== undefined) {
    updates.push('estimated_arrival = ?');
    params.push(body.estimated_arrival);
  }
  if (body.stop_duration_mins !== undefined) {
    updates.push('stop_duration_mins = ?');
    params.push(body.stop_duration_mins);
  }
  if (body.stop_type !== undefined) {
    updates.push('stop_type = ?');
    params.push(body.stop_type);
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?');
    params.push(body.notes);
  }
  if (body.passengers_on !== undefined) {
    updates.push('passengers_on = ?');
    params.push(body.passengers_on);
  }
  if (body.passengers_off !== undefined) {
    updates.push('passengers_off = ?');
    params.push(body.passengers_off);
  }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(stopId);
  params.push(tripId);

  const result = await env.DB.prepare(`
    UPDATE charter_trip_stops
    SET ${updates.join(', ')}
    WHERE id = ? AND trip_id = ? AND tenant_id = 'default'
  `).bind(...params).run();

  if (result.meta.changes === 0) {
    return error('Stop not found', 404);
  }

  const stop = await env.DB.prepare(`
    SELECT * FROM charter_trip_stops WHERE id = ?
  `).bind(stopId).first();

  return json({ success: true, data: stop });
}

async function deleteStop(env: Env, tripId: string, stopId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    DELETE FROM charter_trip_stops
    WHERE id = ? AND trip_id = ? AND tenant_id = 'default'
  `).bind(stopId, tripId).run();

  if (result.meta.changes === 0) {
    return error('Stop not found', 404);
  }

  return json({ success: true });
}

// ============================================
// LINE ITEMS ENDPOINTS
// ============================================

async function listLineItems(env: Env, tripId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT *
    FROM charter_trip_line_items
    WHERE trip_id = ? AND tenant_id = 'default'
    ORDER BY display_order, created_at
  `).bind(tripId).all();

  return json({ success: true, data: result.results || [] });
}

async function createLineItem(request: Request, env: Env, tripId: string): Promise<Response> {
  const body = await parseBody<LineItem>(request);
  if (!body) {
    return error('Invalid request body');
  }

  if (!body.item_type || !body.description || body.unit_price === undefined) {
    return error('Missing required fields: item_type, description, unit_price');
  }

  const quantity = body.quantity || 1;
  const totalPrice = quantity * body.unit_price;
  const isTaxable = body.is_taxable !== undefined ? body.is_taxable : 1;
  const taxAmount = isTaxable ? totalPrice * 0.1 : 0;

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charter_trip_line_items (
      id, tenant_id, trip_id,
      item_type, description,
      quantity, unit_price, total_price,
      is_taxable, tax_amount,
      display_order, is_hidden,
      created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    tripId,
    body.item_type,
    body.description,
    quantity,
    body.unit_price,
    totalPrice,
    isTaxable,
    taxAmount,
    body.display_order || 0,
    body.is_hidden || 0,
    now,
    now
  ).run();

  const lineItem = await env.DB.prepare(`
    SELECT * FROM charter_trip_line_items WHERE id = ?
  `).bind(id).first();

  return json({ success: true, data: lineItem }, 201);
}

async function updateLineItem(request: Request, env: Env, tripId: string, itemId: string): Promise<Response> {
  const body = await parseBody<Partial<LineItem>>(request);
  if (!body) {
    return error('Invalid request body');
  }

  // Fetch current line item to recalculate totals
  const current = await env.DB.prepare(`
    SELECT * FROM charter_trip_line_items
    WHERE id = ? AND trip_id = ? AND tenant_id = 'default'
  `).bind(itemId, tripId).first();

  if (!current) {
    return error('Line item not found', 404);
  }

  const updates: string[] = [];
  const params: any[] = [];

  let quantity = current.quantity as number;
  let unitPrice = current.unit_price as number;
  let isTaxable = current.is_taxable as number;

  if (body.item_type !== undefined) {
    updates.push('item_type = ?');
    params.push(body.item_type);
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    params.push(body.description);
  }
  if (body.quantity !== undefined) {
    quantity = body.quantity;
    updates.push('quantity = ?');
    params.push(body.quantity);
  }
  if (body.unit_price !== undefined) {
    unitPrice = body.unit_price;
    updates.push('unit_price = ?');
    params.push(body.unit_price);
  }
  if (body.is_taxable !== undefined) {
    isTaxable = body.is_taxable;
    updates.push('is_taxable = ?');
    params.push(body.is_taxable);
  }
  if (body.display_order !== undefined) {
    updates.push('display_order = ?');
    params.push(body.display_order);
  }
  if (body.is_hidden !== undefined) {
    updates.push('is_hidden = ?');
    params.push(body.is_hidden);
  }

  // Recalculate totals
  const totalPrice = quantity * unitPrice;
  const taxAmount = isTaxable ? totalPrice * 0.1 : 0;

  updates.push('total_price = ?');
  params.push(totalPrice);
  updates.push('tax_amount = ?');
  params.push(taxAmount);
  updates.push('updated_at = ?');
  params.push(new Date().toISOString());

  params.push(itemId);
  params.push(tripId);

  await env.DB.prepare(`
    UPDATE charter_trip_line_items
    SET ${updates.join(', ')}
    WHERE id = ? AND trip_id = ? AND tenant_id = 'default'
  `).bind(...params).run();

  const lineItem = await env.DB.prepare(`
    SELECT * FROM charter_trip_line_items WHERE id = ?
  `).bind(itemId).first();

  return json({ success: true, data: lineItem });
}

async function deleteLineItem(env: Env, tripId: string, itemId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    DELETE FROM charter_trip_line_items
    WHERE id = ? AND trip_id = ? AND tenant_id = 'default'
  `).bind(itemId, tripId).run();

  if (result.meta.changes === 0) {
    return error('Line item not found', 404);
  }

  return json({ success: true });
}
