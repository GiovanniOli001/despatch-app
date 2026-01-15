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
  locationName: string | null;  // Free text or selected location
  locationLat: number | null;   // For smart assignment
  locationLng: number | null;   // For smart assignment
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

    // POST /api/dispatch/update-duty-line - Update a duty line
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

    // POST /api/dispatch/create-duty-line - Create a new duty line for an existing roster entry
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

    // POST /api/dispatch/create-adhoc-shift - Create an adhoc roster entry with duty
    if (method === 'POST' && seg1 === 'create-adhoc-shift') {
      const body = await parseBody<{
        date: string;
        employee_id: string;
        duty: {
          start_time: number;
          end_time: number;
          duty_type?: string;
          description?: string;
          vehicle_number?: string | null;
          pay_type?: string;
          location_name?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
        };
      }>(request);
      if (!body) return error('Invalid request body');
      return createAdhocShift(env, body);
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

  // Also get adhoc entries (no template)
  const adhocEntriesResult = await env.DB.prepare(`
    SELECT 
      re.id as entry_id,
      NULL as roster_id,
      NULL as shift_template_id,
      NULL as duty_block_id,
      re.date,
      re.driver_id,
      re.start_time,
      re.end_time,
      re.status as entry_status,
      1 as include_in_dispatch,
      NULL as roster_code,
      re.name as roster_name,
      re.name as shift_code,
      re.name as shift_name,
      re.shift_type,
      re.name as block_name,
      1 as block_sequence
    FROM roster_entries re
    WHERE re.date = ?
      AND re.shift_template_id IS NULL
      AND re.deleted_at IS NULL
      AND re.driver_id IS NOT NULL
    ORDER BY re.start_time
  `).bind(date).all();

  // Merge rostered and adhoc entries
  const allEntries = [
    ...(entriesResult.results as any[]),
    ...(adhocEntriesResult.results as any[])
  ];

  // ========================================
  // 4. GET DUTY LINES FOR ALL ENTRIES
  // ========================================
  // Get all roster entry IDs
  const entryIds = allEntries.map(e => e.entry_id);
  
  // Build duty lines map (keyed by roster_entry_id)
  const dutyLinesByEntry = new Map<string, any[]>();
  
  // Try to get from roster_duty_lines first (may not exist for old entries)
  if (entryIds.length > 0) {
    try {
      const placeholders = entryIds.map(() => '?').join(',');
      const linesResult = await env.DB.prepare(`
        SELECT 
          rdl.id,
          rdl.roster_entry_id,
          rdl.sequence,
          rdl.start_time,
          rdl.end_time,
          rdl.duty_type,
          rdl.vehicle_id,
          rdl.pay_type,
          rdl.description,
          rdl.location_name,
          rdl.location_lat,
          rdl.location_lng,
          dt.code as duty_type_code,
          dt.name as duty_type_name,
          dt.color as duty_type_color,
          COALESCE(rdl.vehicle_number, v.fleet_number) as vehicle_number
        FROM roster_duty_lines rdl
        LEFT JOIN duty_types dt ON rdl.duty_type = dt.code OR rdl.duty_type = dt.id
        LEFT JOIN vehicles v ON rdl.vehicle_id = v.id
        WHERE rdl.roster_entry_id IN (${placeholders}) AND rdl.deleted_at IS NULL
        ORDER BY rdl.roster_entry_id, rdl.sequence
      `).bind(...entryIds).all();

      for (const line of linesResult.results as any[]) {
        if (!dutyLinesByEntry.has(line.roster_entry_id)) {
          dutyLinesByEntry.set(line.roster_entry_id, []);
        }
        dutyLinesByEntry.get(line.roster_entry_id)!.push(line);
      }
    } catch (err) {
      // Table might not exist yet - that's OK, will fall back to template
      console.log('roster_duty_lines query failed, falling back to template:', err);
    }
  }
  
  // Fallback: If no roster_duty_lines exist (entries created before migration),
  // fall back to reading from shift_template_duty_lines
  const blockIds = [...new Set(allEntries.map(e => e.duty_block_id).filter(id => id != null))];
  const dutyLinesByBlock = new Map<string, any[]>();
  
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

  for (const entry of allEntries) {
    // Prefer roster_duty_lines (instance-specific), fall back to template lines
    const dutyLines = dutyLinesByEntry.get(entry.entry_id) || dutyLinesByBlock.get(entry.duty_block_id) || [];
    
    // Convert duty lines to frontend format
    const duties: DispatchDuty[] = dutyLines.map((line: any) => ({
      id: line.id,
      type: mapDutyType(line.duty_type || line.duty_type_code),
      start: line.start_time,
      end: line.end_time,
      description: line.description || `${line.duty_type_name || line.duty_type || 'Duty'}`,
      vehicle: line.vehicle_number || null,
      vehicleId: line.vehicle_id || null,
      locationId: null,  // Legacy field
      fromLocationId: null,
      toLocationId: null,
      payType: line.pay_type || 'STD',
      locationName: line.location_name || null,
      locationLat: line.location_lat || null,
      locationLng: line.location_lng || null
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
        payType: 'STD',
        locationName: null,
        locationLat: null,
        locationLng: null
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

    // Build vehicle shifts from usage - include driver name for display
    const vehicleShifts = usage.map(u => {
      // Find driver name
      let driverName = null;
      if (u.driverId) {
        const driverObj = drivers.find(d => d.id === u.driverId);
        driverName = driverObj?.name || null;
      }
      
      // Find the original shift to get its name
      let shiftName = 'Shift';
      const driverShifts = shiftsByDriver.get(u.driverId || '');
      if (driverShifts) {
        const originalShift = driverShifts.find(s => s.entryId === u.shiftId);
        if (originalShift) {
          shiftName = originalShift.name;
        }
      }
      
      return {
        id: `vshift-${veh.id}-${u.shiftId}`,
        entryId: u.shiftId,
        name: shiftName,
        start: u.start,
        end: u.end,
        driverId: u.driverId,
        type: 'assigned',
        duties: [{
          id: `vduty-${veh.id}-${u.shiftId}`,
          type: 'driving',
          start: u.start,
          end: u.end,
          driver: driverName,
          driverId: u.driverId,
          vehicle: veh.fleet_number
        }]
      };
    });

    // Add maintenance block if in maintenance
    if (veh.daily_status === 'maintenance') {
      vehicleShifts.push({
        id: `vshift-maint-${veh.id}`,
        entryId: '',
        name: 'Maintenance',
        start: 5,
        end: 23,
        driverId: null,
        type: 'maintenance',
        duties: []
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
    total_shifts: allEntries.length
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
        publishedRosters: [...new Set(allEntries.map(e => e.roster_code).filter(c => c != null))]
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

async function updateDutyLine(
  env: Env,
  input: {
    duty_line_id: string;
    start_time?: number;
    end_time?: number;
    duty_type?: string;
    description?: string;
    vehicle_id?: string | null;
    vehicle_number?: string | null;  // Accept fleet number too
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

  // Check if duty line exists in roster_duty_lines (instance-specific edits)
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

  // Handle location fields
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

  // Handle vehicle - accept either vehicle_id (UUID) or vehicle_number (fleet number)
  if (vehicle_id !== undefined || vehicle_number !== undefined) {
    let resolvedVehicleId: string | null = null;
    let resolvedVehicleNumber: string | null = null;
    
    if (vehicle_number) {
      // Look up vehicle by fleet number
      const vehicle = await env.DB.prepare(`
        SELECT id, fleet_number FROM vehicles WHERE fleet_number = ? AND deleted_at IS NULL
      `).bind(vehicle_number).first() as { id: string; fleet_number: string } | null;
      
      if (vehicle) {
        resolvedVehicleId = vehicle.id;
        resolvedVehicleNumber = vehicle.fleet_number;
      }
    } else if (vehicle_id) {
      // Look up vehicle by ID
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

  // Update roster_duty_lines (instance-specific, NOT the template)
  await env.DB.prepare(`
    UPDATE roster_duty_lines SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  return json({ success: true, message: 'Duty line updated' });
}

// Create a new duty line for an existing roster entry
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
  const { roster_entry_id, start_time, end_time, duty_type, description, vehicle_id, vehicle_number, pay_type, location_name, location_lat, location_lng } = input;
  
  if (!roster_entry_id) {
    return error('roster_entry_id is required');
  }
  
  if (start_time === undefined || end_time === undefined) {
    return error('start_time and end_time are required');
  }

  // Check if roster entry exists
  const entry = await env.DB.prepare(`
    SELECT id FROM roster_entries WHERE id = ? AND deleted_at IS NULL
  `).bind(roster_entry_id).first();

  if (!entry) {
    return error('Roster entry not found', 404);
  }

  // Get the next sequence number
  const maxSeq = await env.DB.prepare(`
    SELECT MAX(sequence) as max_seq FROM roster_duty_lines WHERE roster_entry_id = ? AND deleted_at IS NULL
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

  const now = new Date().toISOString();
  const newId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO roster_duty_lines (
      id, tenant_id, roster_entry_id, sequence,
      start_time, end_time, duty_type, description, 
      vehicle_id, vehicle_number, pay_type,
      location_name, location_lat, location_lng,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId, TENANT_ID, roster_entry_id, sequence,
    start_time, end_time, duty_type || 'driving', description || null,
    resolvedVehicleId, resolvedVehicleNumber, pay_type || 'STD',
    location_name || null, location_lat || null, location_lng || null,
    now, now
  ).run();

  return json({ 
    success: true, 
    message: 'Duty line created',
    duty_line_id: newId 
  });
}

// ============================================
// CREATE ADHOC SHIFT (roster entry + duty)
// ============================================

async function createAdhocShift(
  env: Env,
  body: {
    date: string;
    employee_id: string;
    duty: {
      start_time: number;
      end_time: number;
      duty_type?: string;
      description?: string;
      vehicle_number?: string | null;
      pay_type?: string;
      location_name?: string | null;
      location_lat?: number | null;
      location_lng?: number | null;
    };
  }
): Promise<Response> {
  const { date, employee_id, duty } = body;

  if (!date || !employee_id || !duty) {
    return error('Missing required fields: date, employee_id, duty');
  }

  // Use description as name, or generate adhoc name
  const shiftName = duty.description || `ADHOC-${Date.now().toString(36).toUpperCase()}`;
  
  // Resolve vehicle if provided
  let resolvedVehicleId: string | null = null;
  let resolvedVehicleNumber: string | null = duty.vehicle_number || null;
  
  if (duty.vehicle_number) {
    const vehicle = await env.DB.prepare(`
      SELECT id, fleet_number FROM vehicles 
      WHERE fleet_number = ? AND tenant_id = ? AND deleted_at IS NULL
    `).bind(duty.vehicle_number, TENANT_ID).first() as { id: string; fleet_number: string } | null;
    
    if (vehicle) {
      resolvedVehicleId = vehicle.id;
      resolvedVehicleNumber = vehicle.fleet_number;
    }
  }

  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  const dutyLineId = crypto.randomUUID();

  // Create roster entry (no template = adhoc)
  await env.DB.prepare(`
    INSERT INTO roster_entries (
      id, tenant_id, shift_template_id, date, name, shift_type,
      start_time, end_time, driver_id, status, source,
      created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, 'adhoc', ?, ?, ?, 'scheduled', 'manual', ?, ?)
  `).bind(
    entryId, TENANT_ID, date, shiftName,
    duty.start_time, duty.end_time, employee_id,
    now, now
  ).run();

  // Create duty line
  await env.DB.prepare(`
    INSERT INTO roster_duty_lines (
      id, tenant_id, roster_entry_id, sequence,
      start_time, end_time, duty_type, description,
      vehicle_id, vehicle_number, pay_type,
      location_name, location_lat, location_lng,
      created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    dutyLineId, TENANT_ID, entryId,
    duty.start_time, duty.end_time, 
    duty.duty_type || 'driving', duty.description || 'Adhoc duty',
    resolvedVehicleId, resolvedVehicleNumber, duty.pay_type || 'STD',
    duty.location_name || null, duty.location_lat || null, duty.location_lng || null,
    now, now
  ).run();

  return json({
    success: true,
    message: 'Adhoc shift created',
    entry_id: entryId,
    duty_line_id: dutyLineId,
    adhoc_code: shiftName
  });
}
