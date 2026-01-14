/**
 * Dispatch API Routes
 * /api/dispatch/*
 * 
 * Read/write interface for the dispatch board.
 * Essentially a day-view of the roster with additional
 * operational actions (assign, transfer, unassign).
 * 
 * IMPORTANT: Only shows entries from PUBLISHED rosters.
 */

import { Env, json, error, uuid, parseBody } from '../index';

interface AssignInput {
  roster_entry_id: string;
  driver_id?: string;
  vehicle_id?: string;
}

interface TransferInput {
  roster_entry_id: string;
  to_driver_id?: string;
  to_vehicle_id?: string;
}

interface DutyUpdateInput {
  duty_type_id?: string;
  start_time?: number;
  end_time?: number;
  description?: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  pay_type_id?: string;
}

interface AdHocDutyInput {
  roster_entry_id: string;
  duty_type_id: string;
  start_time: number;
  end_time: number;
  description?: string;
  vehicle_id?: string;
  pay_type_id?: string;
}

const TENANT_ID = 'default';

export async function handleDispatch(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const firstSegment = segments[0];
  const secondSegment = segments[1];

  // GET /api/dispatch/:date - Full day data for dispatch view
  if (method === 'GET' && firstSegment && !secondSegment) {
    return getDispatchDay(env, firstSegment);
  }

  // POST /api/dispatch/assign - Assign driver/vehicle to roster entry
  if (method === 'POST' && firstSegment === 'assign') {
    const body = await parseBody<AssignInput>(request);
    if (!body) return error('Invalid request body');
    return assignToEntry(env, body);
  }

  // POST /api/dispatch/transfer - Transfer shift between drivers/vehicles
  if (method === 'POST' && firstSegment === 'transfer') {
    const body = await parseBody<TransferInput>(request);
    if (!body) return error('Invalid request body');
    return transferEntry(env, body);
  }

  // POST /api/dispatch/unassign - Remove assignment (back to unassigned)
  if (method === 'POST' && firstSegment === 'unassign') {
    const body = await parseBody<{ roster_entry_id: string; unassign: 'driver' | 'vehicle' | 'both' }>(request);
    if (!body) return error('Invalid request body');
    return unassignEntry(env, body);
  }

  // PUT /api/dispatch/duty/:id - Update a duty
  if (method === 'PUT' && firstSegment === 'duty' && secondSegment) {
    const body = await parseBody<DutyUpdateInput>(request);
    if (!body) return error('Invalid request body');
    return updateDuty(env, secondSegment, body);
  }

  // POST /api/dispatch/duty - Add ad-hoc duty
  if (method === 'POST' && firstSegment === 'duty' && !secondSegment) {
    const body = await parseBody<AdHocDutyInput>(request);
    if (!body) return error('Invalid request body');
    return addAdHocDuty(env, body);
  }

  // DELETE /api/dispatch/duty/:id - Delete a duty
  if (method === 'DELETE' && firstSegment === 'duty' && secondSegment) {
    return deleteDuty(env, secondSegment);
  }

  return error('Method not allowed', 405);
}

// ============================================
// GET FULL DAY DATA
// ============================================

async function getDispatchDay(env: Env, date: string): Promise<Response> {
  // Get all employees with their daily status
  const employees = await env.DB.prepare(`
    SELECT 
      e.*,
      COALESCE(eds.status, 'available') as daily_status,
      eds.leave_type
    FROM employees e
    LEFT JOIN employee_daily_status eds ON e.id = eds.employee_id AND eds.date = ?
    WHERE e.tenant_id = ? AND e.deleted_at IS NULL AND e.status = 'active'
    ORDER BY e.last_name, e.first_name
  `).bind(date, TENANT_ID).all();

  // Get all vehicles with their daily status
  const vehicles = await env.DB.prepare(`
    SELECT 
      v.*,
      COALESCE(vds.status, 'available') as daily_status,
      vds.reason as status_reason
    FROM vehicles v
    LEFT JOIN vehicle_daily_status vds ON v.id = vds.vehicle_id AND vds.date = ?
    WHERE v.tenant_id = ? AND v.deleted_at IS NULL AND v.status = 'active'
    ORDER BY v.fleet_number
  `).bind(date, TENANT_ID).all();

  // Get roster entries for the date - ONLY FROM PUBLISHED ROSTERS
  const rosterEntries = await env.DB.prepare(`
    SELECT 
      r.*,
      e.employee_number as driver_number,
      e.first_name as driver_first_name,
      e.last_name as driver_last_name,
      v.fleet_number as vehicle_number,
      v.rego as vehicle_rego,
      v.capacity as vehicle_capacity,
      rt.code as route_code,
      c.name as customer_name,
      ros.code as roster_code,
      ros.name as roster_name
    FROM roster_entries r
    JOIN rosters ros ON r.roster_id = ros.id
    LEFT JOIN employees e ON r.driver_id = e.id
    LEFT JOIN vehicles v ON r.vehicle_id = v.id
    LEFT JOIN routes rt ON r.route_id = rt.id
    LEFT JOIN customers c ON r.customer_id = c.id
    WHERE r.tenant_id = ? 
      AND r.date = ? 
      AND r.deleted_at IS NULL
      AND ros.status = 'published'
      AND ros.deleted_at IS NULL
    ORDER BY r.start_time
  `).bind(TENANT_ID, date).all();

  // Get all duties for the roster entries
  const entryIds = rosterEntries.results.map((e: Record<string, unknown>) => e.id);
  let dutiesByEntry = new Map<string, unknown[]>();

  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    const duties = await env.DB.prepare(`
      SELECT 
        rd.*,
        dt.code as duty_type_code,
        dt.name as duty_type_name,
        dt.color as duty_type_color,
        dt.requires_vehicle,
        pt.code as pay_type_code,
        v.fleet_number as vehicle_number
      FROM roster_duties rd
      JOIN duty_types dt ON rd.duty_type_id = dt.id
      LEFT JOIN pay_types pt ON rd.pay_type_id = pt.id
      LEFT JOIN vehicles v ON rd.vehicle_id = v.id
      WHERE rd.roster_entry_id IN (${placeholders})
      ORDER BY rd.roster_entry_id, rd.sequence
    `).bind(...entryIds).all();

    for (const duty of duties.results) {
      const entryId = (duty as Record<string, unknown>).roster_entry_id as string;
      if (!dutiesByEntry.has(entryId)) {
        dutiesByEntry.set(entryId, []);
      }
      dutiesByEntry.get(entryId)!.push(duty);
    }
  }

  // Build the response structure matching what dispatch UI expects
  // Group entries by assignment status
  const assignedEntries: unknown[] = [];
  const unassignedEntries: unknown[] = [];

  for (const entry of rosterEntries.results as Record<string, unknown>[]) {
    const enriched = {
      ...entry,
      duties: dutiesByEntry.get(entry.id as string) || [],
    };

    if (entry.driver_id) {
      assignedEntries.push(enriched);
    } else {
      unassignedEntries.push(enriched);
    }
  }

  // Build driver schedules (entries grouped by driver)
  const driverSchedules = new Map<string, unknown[]>();
  for (const entry of assignedEntries as Record<string, unknown>[]) {
    const driverId = entry.driver_id as string;
    if (!driverSchedules.has(driverId)) {
      driverSchedules.set(driverId, []);
    }
    driverSchedules.get(driverId)!.push(entry);
  }

  // Build vehicle schedules
  const vehicleSchedules = new Map<string, unknown[]>();
  for (const entry of rosterEntries.results as Record<string, unknown>[]) {
    if (entry.vehicle_id) {
      const vehicleId = entry.vehicle_id as string;
      if (!vehicleSchedules.has(vehicleId)) {
        vehicleSchedules.set(vehicleId, []);
      }
      vehicleSchedules.get(vehicleId)!.push({
        ...entry,
        duties: dutiesByEntry.get(entry.id as string) || [],
      });
    }
  }

  // Enrich employees with their shifts
  const driversWithShifts = employees.results.map((emp: Record<string, unknown>) => ({
    ...emp,
    shifts: driverSchedules.get(emp.id as string) || [],
  }));

  // Enrich vehicles with their shifts
  const vehiclesWithShifts = vehicles.results.map((veh: Record<string, unknown>) => ({
    ...veh,
    shifts: vehicleSchedules.get(veh.id as string) || [],
  }));

  // Calculate stats
  const stats = {
    drivers_available: employees.results.filter((e: Record<string, unknown>) => 
      e.daily_status === 'available' && !driverSchedules.has(e.id as string)
    ).length,
    drivers_working: driverSchedules.size,
    drivers_leave: employees.results.filter((e: Record<string, unknown>) => 
      e.daily_status === 'leave' || e.daily_status === 'sick'
    ).length,
    vehicles_available: vehicles.results.filter((v: Record<string, unknown>) => 
      v.daily_status === 'available' && !vehicleSchedules.has(v.id as string)
    ).length,
    vehicles_in_use: vehicleSchedules.size,
    vehicles_maintenance: vehicles.results.filter((v: Record<string, unknown>) => 
      v.daily_status === 'maintenance'
    ).length,
    unassigned_count: unassignedEntries.length,
    total_shifts: rosterEntries.results.length,
  };

  return json({
    data: {
      date,
      stats,
      drivers: driversWithShifts,
      vehicles: vehiclesWithShifts,
      unassigned: unassignedEntries,
    },
  });
}

// ============================================
// ASSIGNMENT ACTIONS
// ============================================

async function assignToEntry(env: Env, input: AssignInput): Promise<Response> {
  const { roster_entry_id, driver_id, vehicle_id } = input;

  const updates: string[] = [];
  const bindings: (string | null)[] = [];

  if (driver_id !== undefined) {
    updates.push('driver_id = ?');
    bindings.push(driver_id || null);
  }

  if (vehicle_id !== undefined) {
    updates.push('vehicle_id = ?');
    bindings.push(vehicle_id || null);
  }

  if (updates.length === 0) {
    return error('No assignment provided');
  }

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(roster_entry_id, TENANT_ID);

  const result = await env.DB.prepare(`
    UPDATE roster_entries SET ${updates.join(', ')}
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(...bindings).run();

  if (result.meta.changes === 0) {
    return error('Roster entry not found', 404);
  }

  // Return updated entry
  const entry = await env.DB.prepare(`
    SELECT * FROM v_roster_full WHERE id = ?
  `).bind(roster_entry_id).first();

  return json({ data: entry });
}

async function transferEntry(env: Env, input: TransferInput): Promise<Response> {
  const { roster_entry_id, to_driver_id, to_vehicle_id } = input;

  const updates: string[] = [];
  const bindings: (string | null)[] = [];

  if (to_driver_id !== undefined) {
    updates.push('driver_id = ?');
    bindings.push(to_driver_id || null);
  }

  if (to_vehicle_id !== undefined) {
    updates.push('vehicle_id = ?');
    bindings.push(to_vehicle_id || null);
  }

  if (updates.length === 0) {
    return error('No transfer target provided');
  }

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(roster_entry_id, TENANT_ID);

  const result = await env.DB.prepare(`
    UPDATE roster_entries SET ${updates.join(', ')}
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(...bindings).run();

  if (result.meta.changes === 0) {
    return error('Roster entry not found', 404);
  }

  const entry = await env.DB.prepare(`
    SELECT * FROM v_roster_full WHERE id = ?
  `).bind(roster_entry_id).first();

  return json({ data: entry });
}

async function unassignEntry(
  env: Env,
  input: { roster_entry_id: string; unassign: 'driver' | 'vehicle' | 'both' }
): Promise<Response> {
  const { roster_entry_id, unassign } = input;

  let updateClause = '';
  if (unassign === 'driver') {
    updateClause = 'driver_id = NULL';
  } else if (unassign === 'vehicle') {
    updateClause = 'vehicle_id = NULL';
  } else {
    updateClause = 'driver_id = NULL, vehicle_id = NULL';
  }

  const result = await env.DB.prepare(`
    UPDATE roster_entries SET ${updateClause}, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), roster_entry_id, TENANT_ID).run();

  if (result.meta.changes === 0) {
    return error('Roster entry not found', 404);
  }

  const entry = await env.DB.prepare(`
    SELECT * FROM v_roster_full WHERE id = ?
  `).bind(roster_entry_id).first();

  return json({ data: entry });
}

// ============================================
// DUTY MANAGEMENT
// ============================================

async function updateDuty(env: Env, dutyId: string, input: DutyUpdateInput): Promise<Response> {
  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if ('duty_type_id' in input) { updates.push('duty_type_id = ?'); bindings.push(input.duty_type_id!); }
  if ('start_time' in input) { updates.push('start_time = ?'); bindings.push(input.start_time!); }
  if ('end_time' in input) { updates.push('end_time = ?'); bindings.push(input.end_time!); }
  if ('description' in input) { updates.push('description = ?'); bindings.push(input.description || null); }
  if ('vehicle_id' in input) { updates.push('vehicle_id = ?'); bindings.push(input.vehicle_id || null); }
  if ('driver_id' in input) { updates.push('driver_id = ?'); bindings.push(input.driver_id || null); }
  if ('pay_type_id' in input) { updates.push('pay_type_id = ?'); bindings.push(input.pay_type_id!); }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), dutyId);

  const result = await env.DB.prepare(`
    UPDATE roster_duties SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  if (result.meta.changes === 0) {
    return error('Duty not found', 404);
  }

  // Return the updated duty
  const duty = await env.DB.prepare(`
    SELECT 
      rd.*,
      dt.code as duty_type_code,
      dt.name as duty_type_name,
      dt.color as duty_type_color,
      pt.code as pay_type_code
    FROM roster_duties rd
    JOIN duty_types dt ON rd.duty_type_id = dt.id
    LEFT JOIN pay_types pt ON rd.pay_type_id = pt.id
    WHERE rd.id = ?
  `).bind(dutyId).first();

  return json({ data: duty });
}

async function addAdHocDuty(env: Env, input: AdHocDutyInput): Promise<Response> {
  // Verify roster entry exists
  const entry = await env.DB.prepare(`
    SELECT id FROM roster_entries WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(input.roster_entry_id, TENANT_ID).first();

  if (!entry) {
    return error('Roster entry not found', 404);
  }

  // Get next sequence number
  const maxSeq = await env.DB.prepare(`
    SELECT MAX(sequence) as max_seq FROM roster_duties WHERE roster_entry_id = ?
  `).bind(input.roster_entry_id).first<{ max_seq: number | null }>();

  const sequence = (maxSeq?.max_seq || 0) + 1;
  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO roster_duties (
      id, roster_entry_id, duty_type_id, sequence, start_time, end_time,
      description, vehicle_id, pay_type_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
  `).bind(
    id, input.roster_entry_id, input.duty_type_id, sequence,
    input.start_time, input.end_time, input.description || null,
    input.vehicle_id || null, input.pay_type_id || 'pt-std', now, now
  ).run();

  // Return the new duty
  const duty = await env.DB.prepare(`
    SELECT 
      rd.*,
      dt.code as duty_type_code,
      dt.name as duty_type_name,
      dt.color as duty_type_color,
      pt.code as pay_type_code
    FROM roster_duties rd
    JOIN duty_types dt ON rd.duty_type_id = dt.id
    LEFT JOIN pay_types pt ON rd.pay_type_id = pt.id
    WHERE rd.id = ?
  `).bind(id).first();

  return json({ data: duty });
}

async function deleteDuty(env: Env, dutyId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    DELETE FROM roster_duties WHERE id = ?
  `).bind(dutyId).run();

  if (result.meta.changes === 0) {
    return error('Duty not found', 404);
  }

  return json({ success: true });
}
