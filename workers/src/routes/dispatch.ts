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
  type: string;  // 'driving', 'oov', 'break', 'waiting', 'dead', 'charter'
  start: number;
  end: number;
  description: string;
  vehicle: string | null;
  vehicleId: string | null;
  locationId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  payType: string;
}

interface DispatchShift {
  id: string;
  entryId: string;
  name: string;
  type: string;  // 'shift', 'charter'
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
  status: string;  // 'working', 'available', 'leave'
  shifts: DispatchShift[];
}

interface DispatchVehicle {
  id: string;
  rego: string;
  capacity: number;
  depot: any;
  status: string;  // 'available', 'in_use', 'maintenance'
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
  // Get default depot (TODO: support multi-depot)
  const depot = await env.DB.prepare(`
    SELECT id, name, code, lat, lng FROM depots 
    WHERE tenant_id = ? AND is_primary = 1 AND deleted_at IS NULL
    LIMIT 1
  `).bind(TENANT_ID).first() || { id: 'TODO', name: '[NO DEPOT CONFIGURED]', code: 'NONE', lat: 0, lng: 0 };

  // ========================================
  // 1. GET ALL EMPLOYEES (DRIVERS)
  // ========================================
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

  // ========================================
  // 2. GET ALL VEHICLES
  // ========================================
  const vehiclesResult = await env.DB.prepare(`
    SELECT 
      v.id,
      v.fleet_number,
      v.rego,
      v.capacity,
      v.make,
      v.model,
      v.depot_id,
      v.status as veh_status,
      COALESCE(vds.status, 'available') as daily_status,
      vds.reason as daily_reason
    FROM vehicles v
    LEFT JOIN vehicle_daily_status vds ON v.id = vds.vehicle_id AND vds.date = ?
    WHERE v.tenant_id = ? AND v.deleted_at IS NULL
    ORDER BY v.fleet_number
  `).bind(date, TENANT_ID).all();

  // ========================================
  // 3. GET ROSTER ENTRIES FROM PUBLISHED ROSTERS
  // This includes:
  // - Assigned entries (driver_id IS NOT NULL)
  // - Unassigned entries marked for dispatch (driver_id IS NULL AND include_in_dispatch = 1)
  // ========================================
  const entriesResult = await env.DB.prepare(`
    SELECT 
      re.id as entry_id,
      re.roster_id,
      re.shift_template_id,
      re.duty_block_id,
      re.date,
      re.driver_id,
      re.start_time,
      re.end_time,
      re.status as entry_status,
      re.include_in_dispatch,
      r.code as roster_code,
      r.name as roster_name,
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
      AND re.deleted_at IS NULL
      AND r.status = 'published'
      AND r.deleted_at IS NULL
      AND (re.driver_id IS NOT NULL OR re.include_in_dispatch = 1)
    ORDER BY re.start_time, st.code
  `).bind(date).all();

  // ========================================
  // 4. GET DUTY LINES FOR ALL BLOCKS
  // ========================================
  // Get all duty block IDs from entries
  const blockIds = [...new Set((entriesResult.results as any[]).map(e => e.duty_block_id))];
  
  // Build duty lines map
  const dutyLinesByBlock = new Map<string, any[]>();
  
  if (blockIds.length > 0) {
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
  }

  // ========================================
  // 5. MAP DUTY TYPE CODES TO FRONTEND TYPES
  // ========================================
  const dutyTypeMap: Record<string, string> = {
    'DRIVE': 'driving',
    'driving': 'driving',
    'OOV': 'oov',
    'oov': 'oov',
    'out_of_vehicle': 'oov',
    'BREAK': 'break',
    'break': 'break',
    'meal_break': 'break',
    'WAIT': 'waiting',
    'waiting': 'waiting',
    'DEAD': 'dead',
    'dead': 'dead',
    'dead_running': 'dead',
    'CHARTER': 'charter',
    'charter': 'charter',
    // Fallback
    'default': 'driving'
  };

  function mapDutyType(code: string | null): string {
    if (!code) return 'driving';
    return dutyTypeMap[code] || dutyTypeMap[code.toLowerCase()] || 'driving';
  }

  // ========================================
  // 6. BUILD SHIFTS FROM ENTRIES + DUTY LINES
  // ========================================
  const shiftsByDriver = new Map<string, DispatchShift[]>();
  const unassignedShifts: DispatchShift[] = [];
  const vehicleUsage = new Map<string, { shiftId: string; start: number; end: number; driverId: string | null }[]>();

  for (const entry of entriesResult.results as any[]) {
    const dutyLines = dutyLinesByBlock.get(entry.duty_block_id) || [];
    
    // Convert duty lines to frontend format
    const duties: DispatchDuty[] = dutyLines.map((line: any) => ({
      id: line.id,
      type: mapDutyType(line.duty_type || line.duty_type_code),
      start: line.start_time,
      end: line.end_time,
      description: line.description || `${line.duty_type_name || line.duty_type || 'Duty'}`,
      vehicle: line.vehicle_number || null,
      vehicleId: line.vehicle_id || null,
      locationId: null,  // TODO: Add location support
      fromLocationId: null,
      toLocationId: null,
      payType: line.pay_type || 'STD'
    }));

    // If no duty lines, create a placeholder
    if (duties.length === 0) {
      duties.push({
        id: `placeholder-${entry.entry_id}`,
        type: 'driving',
        start: entry.start_time,
        end: entry.end_time,
        description: '[TODO: No duty lines defined for this block]',
        vehicle: null,
        vehicleId: null,
        locationId: null,
        fromLocationId: null,
        toLocationId: null,
        payType: 'STD'
      });
    }

    // Track vehicle usage
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
      start: entry.start_time,
      end: entry.end_time,
      rosterId: entry.roster_id,
      rosterCode: entry.roster_code,
      blockId: entry.duty_block_id,
      blockName: entry.block_name,
      duties,
      pickupLocation: null,  // TODO: Add from locations table
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

  // ========================================
  // 7. BUILD DRIVER OBJECTS
  // ========================================
  const drivers: DispatchDriver[] = (employeesResult.results as any[]).map(emp => {
    const shifts = shiftsByDriver.get(emp.id) || [];
    
    // Determine driver status
    let status: string;
    if (emp.daily_status === 'leave' || emp.daily_status === 'sick') {
      status = 'leave';
    } else if (shifts.length > 0) {
      status = 'working';
    } else {
      status = 'available';
    }

    return {
      id: emp.id,
      name: `${emp.last_name}, ${emp.first_name.charAt(0)}`,
      fullName: `${emp.first_name} ${emp.last_name}`,
      phone: emp.phone,
      licence: emp.licence_number,
      depot: depot,
      status,
      shifts
    };
  });

  // Sort drivers: leave first, then working, then available
  const statusOrder: Record<string, number> = { leave: 0, working: 1, available: 2 };
  drivers.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  // ========================================
  // 8. BUILD VEHICLE OBJECTS
  // ========================================
  const vehicles: DispatchVehicle[] = (vehiclesResult.results as any[]).map(veh => {
    const usage = vehicleUsage.get(veh.id) || [];
    
    // Determine vehicle status
    let status: string;
    if (veh.daily_status === 'maintenance') {
      status = 'maintenance';
    } else if (usage.length > 0) {
      status = 'in_use';
    } else {
      status = 'available';
    }

    // Build vehicle shifts from usage
    const vehicleShifts = usage.map(u => ({
      id: `vshift-${veh.id}-${u.shiftId}`,
      entryId: u.shiftId,
      start: u.start,
      end: u.end,
      driverId: u.driverId,
      type: 'assigned'
    }));

    // Add maintenance block if in maintenance
    if (veh.daily_status === 'maintenance') {
      vehicleShifts.push({
        id: `vshift-maint-${veh.id}`,
        entryId: '',
        start: 5,
        end: 23,
        driverId: null,
        type: 'maintenance'
      });
    }

    return {
      id: veh.fleet_number,  // Frontend uses fleet_number as ID
      rego: veh.rego,
      capacity: veh.capacity,
      depot: depot,
      status,
      shifts: vehicleShifts
    };
  });

  // Sort vehicles: maintenance first, then in_use, then available
  const vehStatusOrder: Record<string, number> = { maintenance: 0, in_use: 1, available: 2 };
  vehicles.sort((a, b) => vehStatusOrder[a.status] - vehStatusOrder[b.status]);

  // ========================================
  // 9. BUILD UNASSIGNED JOBS
  // ========================================
  const unassignedJobs = unassignedShifts.map(shift => ({
    id: shift.id,
    entryId: shift.entryId,
    name: shift.name,
    type: shift.type,
    start: shift.start,
    end: shift.end,
    depot: depot,
    customer: null,  // TODO: Pull from customers table for charters
    pickupLocation: shift.pickupLocation,
    dropoffLocation: shift.dropoffLocation,
    duties: shift.duties,
    rosterId: shift.rosterId,
    rosterCode: shift.rosterCode
  }));

  // ========================================
  // 10. CALCULATE STATS
  // ========================================
  const stats = {
    drivers_available: drivers.filter(d => d.status === 'available').length,
    drivers_working: drivers.filter(d => d.status === 'working').length,
    drivers_leave: drivers.filter(d => d.status === 'leave').length,
    vehicles_available: vehicles.filter(v => v.status === 'available').length,
    vehicles_in_use: vehicles.filter(v => v.status === 'in_use').length,
    vehicles_maintenance: vehicles.filter(v => v.status === 'maintenance').length,
    unassigned_count: unassignedJobs.length,
    total_shifts: entriesResult.results.length
  };

  // ========================================
  // 11. BUILD TODO/PLACEHOLDER LIST
  // ========================================
  const todos: string[] = [];
  
  if ((depot as any).id === 'TODO') {
    todos.push('No depot configured - add a depot in the database');
  }
  
  // Check for missing duty lines
  const blocksWithoutLines = blockIds.filter(id => !dutyLinesByBlock.has(id) || dutyLinesByBlock.get(id)!.length === 0);
  if (blocksWithoutLines.length > 0) {
    todos.push(`${blocksWithoutLines.length} duty block(s) have no duty lines defined`);
  }

  // Check for missing locations
  todos.push('Locations not yet implemented - pickup/dropoff will show as null');

  return json({
    data: {
      date,
      stats,
      drivers,
      vehicles,
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
    // TODO: Vehicle assignment at entry level - consider duty line level
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
  
  // Get current entry
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
    // When unassigning driver from dispatch, auto-include in dispatch
    // so it appears in unassigned section
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
