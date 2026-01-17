/**
 * Charter Journeys API Routes
 * Handles journey management within charter trips
 * Journey = individual pickup → dropoff segment within a trip
 */

import { json, error, uuid, parseBody } from '../index';
import type { Env } from '../index';

interface CharterJourney {
  id?: string;
  trip_id: string;
  sequence?: number;
  pickup_name?: string;
  pickup_address?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  pickup_time?: string;
  dropoff_name?: string;
  dropoff_address?: string;
  dropoff_lat?: number;
  dropoff_lng?: number;
  notes?: string;
}

interface ReorderItem {
  id: string;
  sequence: number;
}

export async function handleCharterJourneys(
  request: Request,
  env: Env,
  pathSegments: string[]
): Promise<Response> {
  const method = request.method;
  const url = new URL(request.url);

  // Route based on path segments
  if (pathSegments.length === 0) {
    // /api/charter-journeys
    if (method === 'GET') {
      return listJourneys(env, url);
    } else if (method === 'POST') {
      return createJourney(request, env);
    }
  } else if (pathSegments.length === 1) {
    const segment = pathSegments[0];

    if (segment === 'reorder' && method === 'POST') {
      // /api/charter-journeys/reorder
      return reorderJourneys(request, env);
    } else {
      // /api/charter-journeys/:id
      const journeyId = segment;
      if (method === 'GET') {
        return getJourney(env, journeyId);
      } else if (method === 'PUT') {
        return updateJourney(request, env, journeyId);
      } else if (method === 'DELETE') {
        return deleteJourney(env, journeyId);
      }
    }
  }

  return error('Not found', 404);
}

// ============================================
// JOURNEY ENDPOINTS
// ============================================

async function listJourneys(env: Env, url: URL): Promise<Response> {
  const tripId = url.searchParams.get('trip_id');

  if (!tripId) {
    return error('trip_id query parameter is required');
  }

  const result = await env.DB.prepare(`
    SELECT *
    FROM charter_journeys
    WHERE trip_id = ?
      AND deleted_at IS NULL
      AND tenant_id = 'default'
    ORDER BY sequence, created_at
  `).bind(tripId).all();

  return json({ success: true, data: result.results || [] });
}

async function getJourney(env: Env, journeyId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT *
    FROM charter_journeys
    WHERE id = ?
      AND deleted_at IS NULL
      AND tenant_id = 'default'
  `).bind(journeyId).first();

  if (!result) {
    return error('Journey not found', 404);
  }

  return json({ success: true, data: result });
}

async function createJourney(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<CharterJourney>(request);
  if (!body) {
    return error('Invalid request body');
  }

  // Validate required field
  if (!body.trip_id) {
    return error('Missing required field: trip_id');
  }

  // Verify trip exists
  const trip = await env.DB.prepare(`
    SELECT id FROM charter_trips
    WHERE id = ? AND deleted_at IS NULL AND tenant_id = 'default'
  `).bind(body.trip_id).first();

  if (!trip) {
    return error('Trip not found', 404);
  }

  // Get next sequence number if not provided
  let sequence = body.sequence || 1;
  if (!body.sequence) {
    const maxSeq = await env.DB.prepare(`
      SELECT COALESCE(MAX(sequence), 0) as max_seq
      FROM charter_journeys
      WHERE trip_id = ? AND tenant_id = 'default'
    `).bind(body.trip_id).first();
    sequence = (maxSeq?.max_seq as number || 0) + 1;
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO charter_journeys (
      id, tenant_id, trip_id, sequence,
      pickup_name, pickup_address, pickup_lat, pickup_lng, pickup_time,
      dropoff_name, dropoff_address, dropoff_lat, dropoff_lng,
      notes,
      created_at, updated_at
    ) VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.trip_id,
    sequence,
    body.pickup_name || null,
    body.pickup_address || null,
    body.pickup_lat || null,
    body.pickup_lng || null,
    body.pickup_time || null,
    body.dropoff_name || null,
    body.dropoff_address || null,
    body.dropoff_lat || null,
    body.dropoff_lng || null,
    body.notes || null,
    now,
    now
  ).run();

  // Fetch created journey
  const journey = await env.DB.prepare(`
    SELECT * FROM charter_journeys WHERE id = ?
  `).bind(id).first();

  return json({ success: true, data: journey }, 201);
}

async function updateJourney(request: Request, env: Env, journeyId: string): Promise<Response> {
  const body = await parseBody<Partial<CharterJourney>>(request);
  if (!body) {
    return error('Invalid request body');
  }

  // Verify journey exists
  const existing = await env.DB.prepare(`
    SELECT id FROM charter_journeys
    WHERE id = ? AND deleted_at IS NULL AND tenant_id = 'default'
  `).bind(journeyId).first();

  if (!existing) {
    return error('Journey not found', 404);
  }

  const updates: string[] = [];
  const params: any[] = [];

  // Allow updating all editable fields
  if (body.sequence !== undefined) {
    updates.push('sequence = ?');
    params.push(body.sequence);
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
  if (body.pickup_time !== undefined) {
    updates.push('pickup_time = ?');
    params.push(body.pickup_time);
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
  if (body.notes !== undefined) {
    updates.push('notes = ?');
    params.push(body.notes);
  }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(journeyId);

  await env.DB.prepare(`
    UPDATE charter_journeys
    SET ${updates.join(', ')}
    WHERE id = ?
  `).bind(...params).run();

  // Fetch updated journey
  const journey = await env.DB.prepare(`
    SELECT * FROM charter_journeys WHERE id = ?
  `).bind(journeyId).first();

  return json({ success: true, data: journey });
}

async function deleteJourney(env: Env, journeyId: string): Promise<Response> {
  const now = new Date().toISOString();

  const result = await env.DB.prepare(`
    UPDATE charter_journeys
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL AND tenant_id = 'default'
  `).bind(now, now, journeyId).run();

  if (result.meta.changes === 0) {
    return error('Journey not found', 404);
  }

  return json({ success: true });
}

async function reorderJourneys(request: Request, env: Env): Promise<Response> {
  const body = await parseBody<{ journeys: ReorderItem[] }>(request);
  if (!body || !body.journeys || !Array.isArray(body.journeys)) {
    return error('Invalid request body. Expected: { journeys: [{ id, sequence }] }');
  }

  const now = new Date().toISOString();

  // Update each journey's sequence
  for (const item of body.journeys) {
    if (!item.id || item.sequence === undefined) {
      return error('Each journey must have id and sequence');
    }

    await env.DB.prepare(`
      UPDATE charter_journeys
      SET sequence = ?, updated_at = ?
      WHERE id = ? AND tenant_id = 'default'
    `).bind(item.sequence, now, item.id).run();
  }

  return json({ success: true, message: 'Journeys reordered successfully' });
}
