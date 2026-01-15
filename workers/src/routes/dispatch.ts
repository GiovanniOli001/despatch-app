/**
 * Dispatch API Routes
 * /api/dispatch/*
 * 
 * Real-time operations view pulling from:
 * - Published rosters → shifts
 * - Employees → drivers  
 * - Vehicles → fleet
 * - Duty lines → individual duties
 * 
 * IMPORTANT: Only shows entries from PUBLISHED rosters
 */

import { Env, json, error, uuid, parseBody } from '../index';

const TENANT_ID = 'default';

// ============================================
// INTERFACES
// ============================================

interface DispatchDuty {
  id: string;
  type: string;
  start: number;
  end: number;
  description: string;
  vehicle: string | null;
  vehicleId: string | null;
  locationId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  payType: string;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
}

interface DispatchShift {
  id: string;
  entryId: string;
  name: string;
  type: string;
  start: number;
  end: number;
  rosterId: string;
  rosterCode: string;
  blockId: string;
  blockName: string;
  duties: DispatchDuty[];
  pickupLocation: any | null;
  dropoffLocation: any | null;
}

interface DispatchDriver {
  id: string;
  name: string;
  fullName: string;
  phone: string | null;
  licence: string | null;
  depot: any;
  status: string;
  shifts: DispatchShift[];
}

interface DispatchVehicle {
  id: string;
  rego: string;
  capacity: number;
  depot: any;
  status: string;
  shifts: any[];
}

// ============================================
// ROUTER
// ============================================

export async function handleDispatch(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const seg1 = segments[0];
  const seg2 = segments[1];

  try {
    // GET /api/dispatch/:date - Full day data
    if (method === 'GET' && seg1 && !seg2) {
      return getDispatchDay(env, seg1);
    }

    // POST /api/dispatch/assign - Assign driver/vehicle to entry
    if (method === 'POST' && seg1 === 'assign') {
      const body = await parseBody<{ roster_entry_id: string; driver_id?: string; vehicle_id?: string }>(request);
      if (!body) return error('Invalid request body');
      return assignToEntry(env, body);
    }

    // POST /api/dispatch/transfer - Transfer between drivers
    if (method === 'POST' && seg1 === 'transfer') {
      const body = await parseBody<{ roster_entry_id: string; to_driver_id?: string; to_vehicle_id?: string }>(request);
      if (!body) return error('Invalid request body');
      return transferEntry(env, body);
    }

    // POST /api/dispatch/unassign - Remove assignment
    if (method === 'POST' && seg1 === 'unassign') {
      const body = await parseBody<{ roster_entry_id: string; unassign: 'driver' | 'vehicle' | 'both' }>(request);
      if (!body) return error('Invalid request body');
      return unassignEntry(env, body);
    }

    // POST /api/dispatch/update-duty-line - Update existing duty line
    if (method === 'POST' && seg1 === 'update-duty-line') {
      const body = await parseBody<{
        duty_line_id: string;
        start_time?: number;
        end_time?: number;
        duty_type?: string;
        description?: string;
        vehicle_id?: string | null;
        vehicle_number?: string | null;
        pay_type?: string;
        location_name?: string | null;
        location_lat?: number | null;
        location_lng?: number | null;
      }>(request);
      if (!body) return error('Invalid request body');
      return updateDutyLine(env, body);
    }

    // POST /api/dispatch/create-duty-line - Create NEW duty line
    if (method === 'POST' && seg1 === 'create-duty-line') {
      const body = await parseBody<{
        roster_entry_id: string;
        start_time: number;
        end_time: number;
        duty_type?: string;
        description?: string;
        vehicle_id?: string | null;
        vehicle_number?: string | null;
        pay_type?: string;
        location_name?: string | null;
        location_lat?: number | null;
        location_lng?: number | null;
      }>(request);
      if (!body) return error('Invalid request body');
      return createDutyLine(env, body);
    }

    // POST /api/dispatch/delete-duty-line - Delete a duty line
    if (method === 'POST' && seg1 === 'delete-duty-line') {
      const body = await parseBody<{ duty_line_id: string }>(request);
      if (!body) return error('Invalid request body');
      return deleteDutyLine(env, body.duty_line_id);
    }

    return error('Not found', 404);
  } catch (err) {
    console.error('Dispatch API error:', err);
    return error(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// ============================================
// MAIN DISPATCH DAY VIEW
// ============================================

async function getDispatchDay(env: Env, date: string): Promise<Response> {
  const depot = await env.DB.prepare(`
    SELECT id, name, code, lat, lng FROM depots 
    WHERE tenant_id = ? AND is_primary = 1 AND deleted_at IS NULL
    LIMIT 1
  `).bind(TENANT_ID).first() || { id: 'TODO', name: '[NO DEPOT CONFIGURED]', code: 'NONE', lat: 0, lng: 0 };

  // 1. GET ALL EMPLOYEES (DRIVERS)
  const employeesResult = await env.DB.prepare(`
    SELECT 
      e.id,
      e.employee_number,
      e.first_name,
      e.last_name,
      e.phone,
      e.licence_number,
      e.depot_id,
      e.status as emp_status,
      COALESCE(eds.status, 'available') as daily_status,
      eds.leave_type
    FROM employees e
    LEFT JOIN employee_daily_status eds ON e.id = eds.employee_id AND eds.date = ?
    WHERE e.tenant_id = ? AND e.deleted_at IS NULL AND e.role = 'driver'
    ORDER BY e.last_name, e.first_name
  `).bind(date, TENANT_ID).all();

  // 2. GET ALL VEHICLES
  const vehiclesResult = await env.DB.prepare(`
    SELECT 
      v.id,
      v.fleet_number,
      v.rego,
      v.capacity,
      v.depot_id,
      v.status as veh_status,
      COALESCE(vds.status, 'available') as daily_status,
      vds.reason
    FROM vehicles v
    LEFT JOIN vehicle_daily_status vds ON v.id = vds.vehicle_id AND vds.date = ?
    WHERE v.tenant_id = ? AND v.deleted_at IS NULL
    ORDER BY v.fleet_number
  `).bind(date, TENANT_ID).all();

  // 3. GET ROSTER ENTRIES FOR THIS DATE (from PUBLISHED rosters only, or include_in_dispatch = 1)
  const entriesResult = await env.DB.prepare(`
    SELECT 
      re.id as entry_id,
      re.roster_id,
      re.shift_template_id,
      re.duty_block_id,
      re.driver_id,
      re.vehicle_id,
      re.start_time,
      re.end_time,
      re.include_in_dispatch,
      r.code as roster_code,
      r.status as roster_status,
      st.code as shift_code,
      st.name as shift_name,
      st.shift_type,
      db.name as block_name,
      db.sequence as block_sequence
    FROM roster_entries re
    JOIN rosters r ON re.roster_id = r.id
    JOIN shift_templates st ON re.shift_template_id = st.id
    JOIN shift_template_duty_blocks db ON re.duty_block_id = db.id
    WHERE re.date = ? 
    AND re.tenant_id = ?
    AND re.deleted_at IS NULL
    AND r.deleted_at IS NULL
    AND (r.status = 'published' OR re.include_in_dispatch = 1)
    ORDER BY re.start_time, st.code, db.sequence
  `).bind(date, TENANT_ID).all();

  // 4. GET DUTY LINES - prefer roster_duty_lines, fall back to template
  const entryIds = (entriesResult.results as any[]).map(e => e.entry_id);
  const blockIds = [...new Set((entriesResult.results as any[]).map(e => e.duty_block_id))];

  const dutyLinesByEntry = new Map<string, any[]>();
  const dutyLinesByBlock = new Map<string, any[]>();

  // Get roster_duty_lines (instance-specific)
  if (entryIds.length > 0) {
    try {
      const placeholders = entryIds.map(() => '?').join(',');
      const rosterLinesResult = await env.DB.prepare(`
        SELECT 
          rdl.id,
          rdl.roster_entry_id,
          rdl.sequence,
          rdl.start_time,
          rdl.end_time,
          rdl.duty_type,
          rdl.vehicle_id,
          rdl.vehicle_number,
          rdl.pay_type,
          rdl.description,
          rdl.location_name,
          rdl.location_lat,
          rdl.location_lng,
          dt.code as duty_type_code,
          dt.name as duty_type_name,
          dt.color as duty_type_color
        FROM roster_duty_lines rdl
        LEFT JOIN duty_types dt ON rdl.duty_type = dt.code OR rdl.duty_type = dt.id
        WHERE rdl.roster_entry_id IN (${placeholders}) AND rdl.deleted_at IS NULL
        ORDER BY rdl.roster_entry_id, rdl.sequence
      `).bind(...entryIds).all();

      for (const line of rosterLinesResult.results as any[]) {
        if (!dutyLinesByEntry.has(line.roster_entry_id)) {
          dutyLinesByEntry.set(line.roster_entry_id, []);
        }
        dutyLinesByEntry.get(line.roster_entry_id)!.push(line);
      }
    } catch (err) {
      console.log('Failed to load roster duty lines:', err);
    }
  }

  // Get template duty lines (fallback)
  if (blockIds.length > 0) {
    try {
      const placeholders = blockIds.map(() => '?').join(',');
      const linesResult = await env.DB.prepare(`
        SELECT 
          dl.id,
          dl.duty_block_id,
          dl.sequence,
          dl.start_time,
          dl.end_time,
          dl.duty_type,
          dl.vehicle_id,
          dl.pay_type,
          dl.description,
          dl.location_name,
          dl.location_lat,
          dl.location_lng,
          dt.code as duty_type_code,
          dt.name as duty_type_name,
          dt.color as duty_type_color,
          v.fleet_number as vehicle_number
        FROM shift_template_duty_lines dl
        LEFT JOIN duty_types dt ON dl.duty_type = dt.code OR dl.duty_type = dt.id
        LEFT JOIN vehicles v ON dl.vehicle_id = v.id
        WHERE dl.duty_block_id IN (${placeholders})
        ORDER BY dl.duty_block_id, dl.sequence
      `).bind(...blockIds).all();

      for (const line of linesResult.results as any[]) {
        if (!dutyLinesByBlock.has(line.duty_block_id)) {
          dutyLinesByBlock.set(line.duty_block_id, []);
        }
        dutyLinesByBlock.get(line.duty_block_id)!.push(line);
      }
    } catch (err) {
      console.log('Failed to load template duty lines:', err);
    }
  }

  // 5. MAP DUTY TYPE CODES
  const dutyTypeMap: Record<string, string> = {
    'DRIVE': 'driving', 'driving': 'driving',
    'OOV': 'oov', 'oov': 'oov', 'out_of_vehicle': 'oov',
    'BREAK': 'break', 'break': 'break', 'meal_break': 'break',
    'WAIT': 'waiting', 'waiting': 'waiting',
    'DEAD': 'dead', 'dead': 'dead', 'dead_running': 'dead',
    'CHARTER': 'charter', 'charter': 'charter',
    'default': 'driving'
  };

  function mapDutyType(code: string | null): string {
    if (!code) return 'driving';
    return dutyTypeMap[code] || dutyTypeMap[code.toLowerCase()] || 'driving';
  }

  // 6. BUILD SHIFTS
  const shiftsByDriver = new Map<string, DispatchShift[]>();
  const unassignedShifts: DispatchShift[] = [];
  const vehicleUsage = new Map<string, { shiftId: string; start: number; end: number; driverId: string | null }[]>();

  for (const entry of entriesResult.results as any[]) {
    const dutyLines = dutyLinesByEntry.get(entry.entry_id) || dutyLinesByBlock.get(entry.duty_block_id) || [];
    
    const duties: DispatchDuty[] = dutyLines.map((line: any) => ({
      id: line.id,
      type: mapDutyType(line.duty_type || line.duty_type_code),
      start: line.start_time,
      end: line.end_time,
      description: line.description || `${line.duty_type_name || line.duty_type || 'Duty'}`,
      vehicle: line.vehicle_number || null,
      vehicleId: line.vehicle_id || null,
      locationId: null,
      fromLocationId: null,
      toLocationId: null,
      payType: line.pay_type || 'STD',
      locationName: line.location_name || null,
      locationLat: line.location_lat || null,
      locationLng: line.location_lng || null
    }));

    if (duties.length === 0) {
      duties.push({
        id: `placeholder-${entry.entry_id}`,
        type: 'driving',
        start: entry.start_time,
        end: entry.end_time,
        description: '[No duty lines defined]',
        vehicle: null,
        vehicleId: null,
        locationId: null,
        fromLocationId: null,
        toLocationId: null,
        payType: 'STD',
        locationName: null,
        locationLat: null,
        locationLng: null
      });
    }

    for (const duty of duties) {
      if (duty.vehicleId) {
        if (!vehicleUsage.has(duty.vehicleId)) {
          vehicleUsage.set(duty.vehicleId, []);
        }
        vehicleUsage.get(duty.vehicleId)!.push({
          shiftId: entry.entry_id,
          start: duty.start,
          end: duty.end,
          driverId: entry.driver_id
        });
      }
    }

    const shift: DispatchShift = {
      id: `shift-${entry.entry_id}`,
      entryId: entry.entry_id,
      name: `${entry.shift_code} - ${entry.block_name}`,
      type: entry.shift_type === 'charter' ? 'charter' : 'shift',
      start: Math.min(...duties.map(d => d.start)),
      end: Math.max(...duties.map(d => d.end)),
      rosterId: entry.roster_id,
      rosterCode: entry.roster_code,
      blockId: entry.duty_block_id,
      blockName: entry.block_name,
      duties,
      pickupLocation: null,
      dropoffLocation: null
    };

    if (entry.driver_id) {
      if (!shiftsByDriver.has(entry.driver_id)) {
        shiftsByDriver.set(entry.driver_id, []);
      }
      shiftsByDriver.get(entry.driver_id)!.push(shift);
    } else {
      unassignedShifts.push(shift);
    }
  }

  // 7. BUILD DRIVERS RESPONSE
  const drivers: DispatchDriver[] = (employeesResult.results as any[]).map(emp => {
    const driverShifts = shiftsByDriver.get(emp.id) || [];
    let status = 'available';
    if (emp.daily_status === 'leave' || emp.daily_status === 'sick') {
      status = 'leave';
    } else if (driverShifts.length > 0) {
      status = 'working';
    }
    return {
      id: emp.id,
      name: `${emp.first_name} ${emp.last_name.charAt(0)}`,
      fullName: `${emp.first_name} ${emp.last_name}`,
      phone: emp.phone,
      licence: emp.licence_number,
      depot,
      status,
      shifts: driverShifts.sort((a, b) => a.start - b.start)
    };
  });

  // 8. BUILD VEHICLES RESPONSE
  const vehiclesList: DispatchVehicle[] = (vehiclesResult.results as any[]).map(veh => {
    const usage = vehicleUsage.get(veh.id) || [];
    let status = 'available';
    if (veh.daily_status === 'maintenance' || veh.daily_status === 'breakdown') {
      status = 'maintenance';
    } else if (usage.length > 0) {
      status = 'in_use';
    }
    return {
      id: veh.id,
      rego: veh.fleet_number,
      capacity: veh.capacity,
      depot,
      status,
      shifts: usage.map(u => ({
        id: u.shiftId,
        start: u.start,
        end: u.end,
        driverId: u.driverId
      }))
    };
  });

  // 9. UNASSIGNED JOBS
  const unassignedJobs = unassignedShifts.map(shift => ({
    id: shift.id,
    entryId: shift.entryId,
    name: shift.name,
    type: shift.type,
    start: shift.start,
    end: shift.end,
    depot,
    customer: null,
    pickupLocation: shift.pickupLocation,
    dropoffLocation: shift.dropoffLocation,
    duties: shift.duties,
    rosterId: shift.rosterId,
    rosterCode: shift.rosterCode
  }));

  // 10. STATS
  const stats = {
    drivers_available: drivers.filter(d => d.status === 'available').length,
    drivers_working: drivers.filter(d => d.status === 'working').length,
    drivers_leave: drivers.filter(d => d.status === 'leave').length,
    vehicles_available: vehiclesList.filter(v => v.status === 'available').length,
    vehicles_in_use: vehiclesList.filter(v => v.status === 'in_use').length,
    vehicles_maintenance: vehiclesList.filter(v => v.status === 'maintenance').length,
    unassigned_count: unassignedJobs.length,
    total_shifts: entriesResult.results.length
  };

  // 11. TODOS
  const todos: string[] = [];
  if ((depot as any).id === 'TODO') {
    todos.push('No depot configured');
  }
  const blocksWithoutLines = blockIds.filter(id => !dutyLinesByBlock.has(id) || dutyLinesByBlock.get(id)!.length === 0);
  if (blocksWithoutLines.length > 0) {
    todos.push(`${blocksWithoutLines.length} duty block(s) have no duty lines`);
  }

  return json({
    data: {
      date,
      stats,
      drivers,
      vehicles: vehiclesList,
      unassigned: unassignedJobs,
      _meta: {
        source: 'real_data',
        todos,
        publishedRosters: [...new Set((entriesResult.results as any[]).map(e => e.roster_code))]
      }
    }
  });
}

// ============================================
// ASSIGNMENT ACTIONS
// ============================================

async function assignToEntry(
  env: Env, 
  input: { roster_entry_id: string; driver_id?: string; vehicle_id?: string }
): Promise<Response> {
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
  bindings.push(roster_entry_id);

  const result = await env.DB.prepare(`
    UPDATE roster_entries SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  if (result.meta.changes === 0) {
    return error('Entry not found', 404);
  }

  return json({ success: true, message: 'Assignment updated' });
}

async function transferEntry(
  env: Env,
  input: { roster_entry_id: string; to_driver_id?: string; to_vehicle_id?: string }
): Promise<Response> {
  const { roster_entry_id, to_driver_id, to_vehicle_id } = input;
  
  const entry = await env.DB.prepare(`
    SELECT * FROM roster_entries WHERE id = ? AND deleted_at IS NULL
  `).bind(roster_entry_id).first();

  if (!entry) {
    return error('Entry not found', 404);
  }

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
  bindings.push(roster_entry_id);

  await env.DB.prepare(`
    UPDATE roster_entries SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  return json({ 
    success: true, 
    message: 'Transfer complete',
    from: {
      driver_id: (entry as any).driver_id,
      vehicle_id: (entry as any).vehicle_id
    },
    to: {
      driver_id: to_driver_id,
      vehicle_id: to_vehicle_id
    }
  });
}

async function unassignEntry(
  env: Env,
  input: { roster_entry_id: string; unassign: 'driver' | 'vehicle' | 'both' }
): Promise<Response> {
  const { roster_entry_id, unassign } = input;
  
  const updates: string[] = [];
  
  if (unassign === 'driver' || unassign === 'both') {
    updates.push('driver_id = NULL');
    updates.push('include_in_dispatch = 1');
  }
  
  if (unassign === 'vehicle' || unassign === 'both') {
    updates.push('vehicle_id = NULL');
  }

  updates.push('updated_at = ?');

  const result = await env.DB.prepare(`
    UPDATE roster_entries SET ${updates.join(', ')} WHERE id = ?
  `).bind(new Date().toISOString(), roster_entry_id).run();

  if (result.meta.changes === 0) {
    return error('Entry not found', 404);
  }

  return json({ success: true, message: `Unassigned ${unassign}` });
}

// ============================================
// DUTY LINE CRUD
// ============================================

async function updateDutyLine(
  env: Env,
  input: {
    duty_line_id: string;
    start_time?: number;
    end_time?: number;
    duty_type?: string;
    description?: string;
    vehicle_id?: string | null;
    vehicle_number?: string | null;
    pay_type?: string;
    location_name?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
  }
): Promise<Response> {
  const { duty_line_id, start_time, end_time, duty_type, description, vehicle_id, vehicle_number, pay_type, location_name, location_lat, location_lng } = input;
  
  if (!duty_line_id) {
    return error('duty_line_id is required');
  }

  const existing = await env.DB.prepare(`
    SELECT id FROM roster_duty_lines WHERE id = ? AND deleted_at IS NULL
  `).bind(duty_line_id).first();

  if (!existing) {
    return error('Duty line not found', 404);
  }

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  if (start_time !== undefined) {
    updates.push('start_time = ?');
    bindings.push(start_time);
  }
  if (end_time !== undefined) {
    updates.push('end_time = ?');
    bindings.push(end_time);
  }
  if (duty_type !== undefined) {
    updates.push('duty_type = ?');
    bindings.push(duty_type);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    bindings.push(description);
  }
  if (location_name !== undefined) {
    updates.push('location_name = ?');
    bindings.push(location_name);
  }
  if (location_lat !== undefined) {
    updates.push('location_lat = ?');
    bindings.push(location_lat);
  }
  if (location_lng !== undefined) {
    updates.push('location_lng = ?');
    bindings.push(location_lng);
  }

  if (vehicle_id !== undefined || vehicle_number !== undefined) {
    let resolvedVehicleId: string | null = null;
    let resolvedVehicleNumber: string | null = null;
    
    if (vehicle_number) {
      const vehicle = await env.DB.prepare(`
        SELECT id, fleet_number FROM vehicles WHERE fleet_number = ? AND deleted_at IS NULL
      `).bind(vehicle_number).first() as { id: string; fleet_number: string } | null;
      if (vehicle) {
        resolvedVehicleId = vehicle.id;
        resolvedVehicleNumber = vehicle.fleet_number;
      }
    } else if (vehicle_id) {
      const vehicle = await env.DB.prepare(`
        SELECT id, fleet_number FROM vehicles WHERE id = ? AND deleted_at IS NULL
      `).bind(vehicle_id).first() as { id: string; fleet_number: string } | null;
      if (vehicle) {
        resolvedVehicleId = vehicle.id;
        resolvedVehicleNumber = vehicle.fleet_number;
      }
    }
    
    updates.push('vehicle_id = ?');
    bindings.push(resolvedVehicleId);
    updates.push('vehicle_number = ?');
    bindings.push(resolvedVehicleNumber);
  }

  if (pay_type !== undefined) {
    updates.push('pay_type = ?');
    bindings.push(pay_type);
  }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(duty_line_id);

  await env.DB.prepare(`
    UPDATE roster_duty_lines SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  return json({ success: true, message: 'Duty line updated' });
}

async function createDutyLine(
  env: Env,
  input: {
    roster_entry_id: string;
    start_time: number;
    end_time: number;
    duty_type?: string;
    description?: string;
    vehicle_id?: string | null;
    vehicle_number?: string | null;
    pay_type?: string;
    location_name?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
  }
): Promise<Response> {
  const { 
    roster_entry_id, start_time, end_time, duty_type, description, 
    vehicle_id, vehicle_number, pay_type,
    location_name, location_lat, location_lng 
  } = input;
  
  if (!roster_entry_id) {
    return error('roster_entry_id is required');
  }
  
  if (start_time === undefined || end_time === undefined) {
    return error('start_time and end_time are required');
  }

  // Verify roster entry exists
  const entry = await env.DB.prepare(`
    SELECT id, tenant_id FROM roster_entries WHERE id = ? AND deleted_at IS NULL
  `).bind(roster_entry_id).first() as { id: string; tenant_id: string } | null;

  if (!entry) {
    return error('Roster entry not found', 404);
  }

  // Get next sequence number
  const maxSeq = await env.DB.prepare(`
    SELECT MAX(sequence) as max_seq FROM roster_duty_lines 
    WHERE roster_entry_id = ? AND deleted_at IS NULL
  `).bind(roster_entry_id).first() as { max_seq: number | null } | null;
  
  const sequence = (maxSeq?.max_seq || 0) + 1;

  // Resolve vehicle
  let resolvedVehicleId: string | null = null;
  let resolvedVehicleNumber: string | null = null;
  
  if (vehicle_number) {
    const vehicle = await env.DB.prepare(`
      SELECT id, fleet_number FROM vehicles WHERE fleet_number = ? AND deleted_at IS NULL
    `).bind(vehicle_number).first() as { id: string; fleet_number: string } | null;
    if (vehicle) {
      resolvedVehicleId = vehicle.id;
      resolvedVehicleNumber = vehicle.fleet_number;
    }
  } else if (vehicle_id) {
    const vehicle = await env.DB.prepare(`
      SELECT id, fleet_number FROM vehicles WHERE id = ? AND deleted_at IS NULL
    `).bind(vehicle_id).first() as { id: string; fleet_number: string } | null;
    if (vehicle) {
      resolvedVehicleId = vehicle.id;
      resolvedVehicleNumber = vehicle.fleet_number;
    }
  }

  const newId = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO roster_duty_lines (
      id, tenant_id, roster_entry_id, source_duty_line_id, sequence,
      start_time, end_time, duty_type, description,
      vehicle_id, vehicle_number, pay_type,
      location_name, location_lat, location_lng,
      created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId,
    entry.tenant_id,
    roster_entry_id,
    sequence,
    start_time,
    end_time,
    duty_type || 'oov',
    description || '',
    resolvedVehicleId,
    resolvedVehicleNumber,
    pay_type || 'STD',
    location_name || null,
    location_lat || null,
    location_lng || null,
    now,
    now
  ).run();

  return json({ 
    success: true, 
    message: 'Duty line created',
    duty_line_id: newId,
    data: {
      id: newId,
      roster_entry_id,
      sequence,
      start_time,
      end_time,
      duty_type: duty_type || 'oov',
      description: description || '',
      vehicle_id: resolvedVehicleId,
      vehicle_number: resolvedVehicleNumber,
      pay_type: pay_type || 'STD',
      location_name: location_name || null,
      location_lat: location_lat || null,
      location_lng: location_lng || null,
    }
  });
}

async function deleteDutyLine(env: Env, dutyLineId: string): Promise<Response> {
  const now = new Date().toISOString();
  
  const result = await env.DB.prepare(`
    UPDATE roster_duty_lines SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
  `).bind(now, now, dutyLineId).run();

  if (result.meta.changes === 0) {
    return error('Duty line not found', 404);
  }

  return json({ success: true, message: 'Duty line deleted' });
}
