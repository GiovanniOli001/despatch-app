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
import { TENANT_ID } from '../constants';
import { getCommitStatus, commitDay, getPayRecordsForDate } from './dispatch-commit';

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
  isTemplate?: boolean;
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
    // ========================================
    // COMMIT ENDPOINTS
    // ========================================
    
    // GET /api/dispatch/commit-status/:date - Get commit status
    if (method === 'GET' && seg1 === 'commit-status' && seg2) {
      return getCommitStatus(env, seg2);
    }
    
    // GET /api/dispatch/pay-records/:date - Get pay records for date
    if (method === 'GET' && seg1 === 'pay-records' && seg2) {
      return getPayRecordsForDate(env, seg2);
    }
    
    // POST /api/dispatch/commit - Commit a day
    if (method === 'POST' && seg1 === 'commit') {
      const body = await parseBody<{ date: string; scope: 'all' | 'individual'; employee_id?: string; notes?: string }>(request);
      if (!body) return error('Invalid request body');
      return commitDay(env, body);
    }
    
    // DELETE /api/dispatch/commit/:id - Uncommit (DISABLED - P2.1)
    // Commits are now permanent. Pay corrections should be made in HRM.
    if (method === 'DELETE' && seg1 === 'commit' && seg2) {
      return error('Uncommit has been disabled. Please make corrections in employee pay records.', 403);
    }

    // ========================================
    // EXISTING ENDPOINTS
    // ========================================

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

    // POST /api/dispatch/create-duty-line - Create a new duty line
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

    // POST /api/dispatch/create-adhoc-shift - Create an adhoc roster entry
    if (method === 'POST' && seg1 === 'create-adhoc-shift') {
      const body = await parseBody<{
        date: string;
        employee_id: string;
        duty: {
          start_time: number;
          end_time: number;
          duty_type?: string;
          description?: string;
          vehicle_id?: string | null;
          pay_type?: string;
          location_name?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
        };
      }>(request);
      if (!body) return error('Invalid request body');
      return createAdhocShift(env, body);
    }

    // POST /api/dispatch/cancel-duty-line - Cancel a duty line
    if (method === 'POST' && seg1 === 'cancel-duty-line') {
      const body = await parseBody<{
        duty_line_id: string;
        reason?: string;
      }>(request);
      if (!body) return error('Invalid request body');
      return cancelDutyLine(env, body);
    }

    // POST /api/dispatch/reinstate-duty-line - Reinstate a cancelled duty line
    if (method === 'POST' && seg1 === 'reinstate-duty-line') {
      const body = await parseBody<{
        duty_line_id: string;
      }>(request);
      if (!body) return error('Invalid request body');
      return reinstateDutyLine(env, body);
    }

    return error('Not found', 404);
  } catch (err) {
    console.error('Dispatch API error:', err);
    return error(err instanceof Error ? err.message : 'Internal server error', 500);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function mapDutyType(type: string): string {
  const typeMap: Record<string, string> = {
    'driving': 'driving',
    'oov': 'oov',
    'break': 'break',
    'waiting': 'waiting',
    'dead': 'dead',
    'charter': 'charter'
  };
  return typeMap[type?.toLowerCase()] || 'driving';
}

// ============================================
// GET DISPATCH DAY
// ============================================

async function getDispatchDay(env: Env, date: string): Promise<Response> {
  const depot = {
    id: 'depot-001',
    name: 'Main Depot',
    timezone: 'Australia/Brisbane'
  };

  // Get employees
  const employeesResult = await env.DB.prepare(`
    SELECT id, employee_number, first_name, last_name, phone, licence_number, role, status
    FROM employees 
    WHERE tenant_id = ? AND deleted_at IS NULL AND role = 'driver' AND status = 'active'
    ORDER BY last_name, first_name
  `).bind(TENANT_ID).all();

  // Get employee daily statuses
  const dailyStatuses = await env.DB.prepare(`
    SELECT employee_id, status as daily_status, leave_type
    FROM employee_daily_status
    WHERE date = ?
  `).bind(date).all();
  
  const statusMap = new Map((dailyStatuses.results as any[]).map(s => [s.employee_id, s]));

  // Get vehicles
  const vehiclesResult = await env.DB.prepare(`
    SELECT id, fleet_number, rego, capacity, status
    FROM vehicles
    WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'active'
    ORDER BY fleet_number
  `).bind(TENANT_ID).all();

  // Get roster entries for this date from PUBLISHED rosters
  const entriesResult = await env.DB.prepare(`
    SELECT 
      re.id as entry_id,
      re.roster_id,
      re.shift_template_id,
      re.duty_block_id,
      re.date,
      re.driver_id,
      re.vehicle_id,
      re.start_time,
      re.end_time,
      re.include_in_dispatch,
      r.code as roster_code,
      r.name as roster_name,
      st.code as shift_code,
      st.name as shift_name,
      st.shift_type,
      stdb.name as block_name,
      stdb.sequence as block_sequence
    FROM roster_entries re
    JOIN rosters r ON re.roster_id = r.id
    JOIN shift_templates st ON re.shift_template_id = st.id
    JOIN shift_template_duty_blocks stdb ON re.duty_block_id = stdb.id
    WHERE r.tenant_id = ?
      AND r.status = 'published'
      AND r.deleted_at IS NULL
      AND re.date = ?
      AND re.deleted_at IS NULL
      AND (re.driver_id IS NOT NULL OR re.include_in_dispatch = 1)
    ORDER BY re.start_time, stdb.sequence
  `).bind(TENANT_ID, date).all();

  const allEntries = entriesResult.results as any[];

  // Get roster duty lines (instance-specific overrides)
  const entryIds = allEntries.map(e => e.entry_id);
  let rosterDutyLines: any[] = [];
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    const rosterLinesResult = await env.DB.prepare(`
      SELECT rdl.*, v.fleet_number as vehicle_number
      FROM roster_duty_lines rdl
      LEFT JOIN vehicles v ON rdl.vehicle_id = v.id
      WHERE rdl.roster_entry_id IN (${placeholders})
      AND rdl.deleted_at IS NULL
      ORDER BY rdl.sequence
    `).bind(...entryIds).all();
    rosterDutyLines = rosterLinesResult.results as any[];
  }

  // Get template duty lines as fallback
  const blockIds = [...new Set(allEntries.map(e => e.duty_block_id))];
  let templateDutyLines: any[] = [];
  if (blockIds.length > 0) {
    const placeholders = blockIds.map(() => '?').join(',');
    const templateLinesResult = await env.DB.prepare(`
      SELECT stdl.*, v.fleet_number as vehicle_number
      FROM shift_template_duty_lines stdl
      LEFT JOIN vehicles v ON stdl.vehicle_id = v.id
      WHERE stdl.duty_block_id IN (${placeholders})
      ORDER BY stdl.sequence
    `).bind(...blockIds).all();
    templateDutyLines = templateLinesResult.results as any[];
  }

  // Get adhoc shifts for this date
  const adhocShiftsResult = await env.DB.prepare(`
    SELECT 
      das.id as entry_id,
      das.date,
      das.employee_id as driver_id,
      das.name,
      das.start_time,
      das.end_time,
      das.vehicle_id,
      das.status
    FROM dispatch_adhoc_shifts das
    WHERE das.tenant_id = ?
      AND das.date = ?
      AND das.deleted_at IS NULL
      AND das.status = 'active'
    ORDER BY das.start_time
  `).bind(TENANT_ID, date).all();

  const adhocShifts = adhocShiftsResult.results as any[];

  // Get adhoc duty lines
  const adhocShiftIds = adhocShifts.map(s => s.entry_id);
  let adhocDutyLines: any[] = [];
  if (adhocShiftIds.length > 0) {
    const placeholders = adhocShiftIds.map(() => '?').join(',');
    const adhocLinesResult = await env.DB.prepare(`
      SELECT dadl.*, v.fleet_number as vehicle_number
      FROM dispatch_adhoc_duty_lines dadl
      LEFT JOIN vehicles v ON dadl.vehicle_id = v.id
      WHERE dadl.adhoc_shift_id IN (${placeholders})
      AND dadl.deleted_at IS NULL
      ORDER BY dadl.sequence
    `).bind(...adhocShiftIds).all();
    adhocDutyLines = adhocLinesResult.results as any[];
  }

  // Build lookup map for adhoc duty lines
  const adhocDutyLinesByShift = new Map<string, any[]>();
  for (const line of adhocDutyLines) {
    if (!adhocDutyLinesByShift.has(line.adhoc_shift_id)) {
      adhocDutyLinesByShift.set(line.adhoc_shift_id, []);
    }
    adhocDutyLinesByShift.get(line.adhoc_shift_id)!.push(line);
  }

  // Build lookup maps
  const dutyLinesByEntry = new Map<string, any[]>();
  for (const line of rosterDutyLines) {
    if (!dutyLinesByEntry.has(line.roster_entry_id)) {
      dutyLinesByEntry.set(line.roster_entry_id, []);
    }
    dutyLinesByEntry.get(line.roster_entry_id)!.push(line);
  }

  const dutyLinesByBlock = new Map<string, any[]>();
  for (const line of templateDutyLines) {
    if (!dutyLinesByBlock.has(line.duty_block_id)) {
      dutyLinesByBlock.set(line.duty_block_id, []);
    }
    dutyLinesByBlock.get(line.duty_block_id)!.push(line);
  }

  // Build shifts
  const shiftsByDriver = new Map<string, DispatchShift[]>();
  const unassignedShifts: DispatchShift[] = [];
  const vehicleUsage = new Map<string, { shiftId: string; start: number; end: number; driverId: string | null }[]>();

  for (const entry of allEntries) {
    const rosterLines = dutyLinesByEntry.get(entry.entry_id);
    const templateLines = dutyLinesByBlock.get(entry.duty_block_id);
    const dutyLines = rosterLines || templateLines || [];
    const isFromTemplate = !rosterLines && !!templateLines;
    
    const duties: DispatchDuty[] = dutyLines.map((line: any) => ({
      id: line.id,
      type: mapDutyType(line.duty_type || line.duty_type_code),
      start: line.start_time,
      end: line.end_time,
      description: line.description || `${line.duty_type_name || line.duty_type || 'Duty'}`,
      vehicle: line.vehicle_id || null,
      vehicleId: line.vehicle_id || null,
      locationId: null,
      fromLocationId: null,
      toLocationId: null,
      payType: line.pay_type || 'STD',
      locationName: line.location_name || null,
      locationLat: line.location_lat || null,
      locationLng: line.location_lng || null,
      isTemplate: isFromTemplate
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
      start: entry.start_time,
      end: entry.end_time,
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

  // Process adhoc shifts
  for (const adhocShift of adhocShifts) {
    const adhocLines = adhocDutyLinesByShift.get(adhocShift.entry_id) || [];
    
    const duties: DispatchDuty[] = adhocLines.map((line: any) => ({
      id: line.id,
      type: mapDutyType(line.duty_type),
      start: line.start_time,
      end: line.end_time,
      description: line.description || 'Adhoc Duty',
      vehicle: line.vehicle_id || null,
      vehicleId: line.vehicle_id || null,
      locationId: null,
      fromLocationId: null,
      toLocationId: null,
      payType: line.pay_type || 'STD',
      locationName: line.location_name || null,
      locationLat: line.location_lat || null,
      locationLng: line.location_lng || null,
      isTemplate: false
    }));

    if (duties.length === 0) {
      duties.push({
        id: `placeholder-${adhocShift.entry_id}`,
        type: 'driving',
        start: adhocShift.start_time,
        end: adhocShift.end_time,
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

    // Track vehicle usage for adhoc duties
    for (const duty of duties) {
      if (duty.vehicleId) {
        if (!vehicleUsage.has(duty.vehicleId)) {
          vehicleUsage.set(duty.vehicleId, []);
        }
        vehicleUsage.get(duty.vehicleId)!.push({
          shiftId: adhocShift.entry_id,
          start: duty.start,
          end: duty.end,
          driverId: adhocShift.driver_id
        });
      }
    }

    const shift: DispatchShift = {
      id: `shift-${adhocShift.entry_id}`,
      entryId: adhocShift.entry_id,
      name: 'ADHOC',
      type: 'adhoc',
      start: adhocShift.start_time,
      end: adhocShift.end_time,
      rosterId: null as any,
      rosterCode: 'ADHOC',
      blockId: null as any,
      blockName: 'Adhoc',
      duties,
      pickupLocation: null,
      dropoffLocation: null
    };

    // Adhoc shifts always have a driver
    if (adhocShift.driver_id) {
      if (!shiftsByDriver.has(adhocShift.driver_id)) {
        shiftsByDriver.set(adhocShift.driver_id, []);
      }
      shiftsByDriver.get(adhocShift.driver_id)!.push(shift);
    }
  }

  // Build drivers array
  const drivers: DispatchDriver[] = (employeesResult.results as any[]).map(emp => {
    const shifts = shiftsByDriver.get(emp.id) || [];
    const dailyStatus = statusMap.get(emp.id);
    
    let status: string;
    if (dailyStatus?.daily_status === 'leave' || dailyStatus?.daily_status === 'sick') {
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
      depot,
      status,
      shifts
    };
  });

  const statusOrder: Record<string, number> = { leave: 0, working: 1, available: 2 };
  drivers.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  // Build vehicles array
  const vehicles: DispatchVehicle[] = (vehiclesResult.results as any[]).map(v => {
    const usage = vehicleUsage.get(v.id) || [];
    return {
      id: v.id,
      rego: v.rego,
      capacity: v.capacity,
      depot,
      status: usage.length > 0 ? 'in_use' : 'available',
      shifts: usage
    };
  });

  // Get commit status for this date (defensive - table may not exist)
  let allCommit = null;
  let individualCommits: any[] = [];
  try {
    const commitsResult = await env.DB.prepare(`
      SELECT * FROM dispatch_commits WHERE tenant_id = ? AND commit_date = ?
    `).bind(TENANT_ID, date).all();
    
    allCommit = (commitsResult.results as any[]).find(c => c.scope === 'all');
    individualCommits = (commitsResult.results as any[]).filter(c => c.scope === 'individual');
  } catch (err) {
    // Table may not exist yet - that's OK
    console.warn('dispatch_commits table not found, skipping commit status');
  }

  return json({
    data: {
      date,
      depot,
      drivers,
      vehicles,
      unassigned: unassignedShifts,
      commitStatus: {
        is_fully_committed: !!allCommit,
        all_commit: allCommit || null,
        committed_employee_ids: individualCommits.map(c => c.employee_id)
      }
    }
  });
}

// ============================================
// ASSIGNMENT FUNCTIONS
// ============================================

async function assignToEntry(
  env: Env,
  input: { roster_entry_id: string; driver_id?: string; vehicle_id?: string }
): Promise<Response> {
  const { roster_entry_id, driver_id, vehicle_id } = input;
  const now = new Date().toISOString();
  
  // Try roster_entries first
  const rosterUpdates: string[] = [];
  const rosterBindings: (string | null)[] = [];

  if (driver_id !== undefined) {
    rosterUpdates.push('driver_id = ?');
    rosterBindings.push(driver_id || null);
  }

  if (vehicle_id !== undefined) {
    rosterUpdates.push('vehicle_id = ?');
    rosterBindings.push(vehicle_id || null);
  }

  if (rosterUpdates.length === 0) {
    return error('No assignment provided');
  }

  rosterUpdates.push('updated_at = ?');
  rosterBindings.push(now);
  rosterBindings.push(roster_entry_id);

  const rosterResult = await env.DB.prepare(`
    UPDATE roster_entries SET ${rosterUpdates.join(', ')} WHERE id = ? AND deleted_at IS NULL
  `).bind(...rosterBindings).run();

  if (rosterResult.meta.changes > 0) {
    return json({ success: true, message: 'Assignment updated' });
  }

  // Try adhoc shifts
  const adhocUpdates: string[] = [];
  const adhocBindings: (string | null)[] = [];

  if (driver_id !== undefined) {
    adhocUpdates.push('employee_id = ?');
    adhocBindings.push(driver_id || null);
  }

  if (vehicle_id !== undefined) {
    adhocUpdates.push('vehicle_id = ?');
    adhocBindings.push(vehicle_id || null);
  }

  adhocUpdates.push('updated_at = ?');
  adhocBindings.push(now);
  adhocBindings.push(roster_entry_id);

  const adhocResult = await env.DB.prepare(`
    UPDATE dispatch_adhoc_shifts SET ${adhocUpdates.join(', ')} WHERE id = ? AND deleted_at IS NULL
  `).bind(...adhocBindings).run();

  if (adhocResult.meta.changes > 0) {
    return json({ success: true, message: 'Assignment updated' });
  }

  return error('Entry not found', 404);
}

async function transferEntry(
  env: Env,
  input: { roster_entry_id: string; to_driver_id?: string; to_vehicle_id?: string }
): Promise<Response> {
  const { roster_entry_id, to_driver_id, to_vehicle_id } = input;
  
  // Check roster_entries first
  const rosterEntry = await env.DB.prepare(`
    SELECT id FROM roster_entries WHERE id = ? AND deleted_at IS NULL
  `).bind(roster_entry_id).first();

  if (rosterEntry) {
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
      message: 'Transfer complete'
    });
  }

  // Check adhoc shifts
  const adhocShift = await env.DB.prepare(`
    SELECT id FROM dispatch_adhoc_shifts WHERE id = ? AND deleted_at IS NULL
  `).bind(roster_entry_id).first();

  if (adhocShift) {
    const updates: string[] = [];
    const bindings: (string | null)[] = [];

    if (to_driver_id !== undefined) {
      updates.push('employee_id = ?');
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
      UPDATE dispatch_adhoc_shifts SET ${updates.join(', ')} WHERE id = ?
    `).bind(...bindings).run();

    return json({ 
      success: true, 
      message: 'Transfer complete'
    });
  }

  return error('Entry not found', 404);
}

async function unassignEntry(
  env: Env,
  input: { roster_entry_id: string; unassign: 'driver' | 'vehicle' | 'both' }
): Promise<Response> {
  const { roster_entry_id, unassign } = input;
  const now = new Date().toISOString();
  
  // Try roster_entries first
  const rosterUpdates: string[] = [];
  
  if (unassign === 'driver' || unassign === 'both') {
    rosterUpdates.push('driver_id = NULL');
    rosterUpdates.push('include_in_dispatch = 1');
  }
  
  if (unassign === 'vehicle' || unassign === 'both') {
    rosterUpdates.push('vehicle_id = NULL');
  }

  rosterUpdates.push('updated_at = ?');
  
  const rosterResult = await env.DB.prepare(`
    UPDATE roster_entries SET ${rosterUpdates.join(', ')} WHERE id = ? AND deleted_at IS NULL
  `).bind(now, roster_entry_id).run();

  if (rosterResult.meta.changes > 0) {
    return json({ success: true });
  }

  // Try adhoc shifts
  const adhocUpdates: string[] = [];
  
  if (unassign === 'driver' || unassign === 'both') {
    adhocUpdates.push('employee_id = NULL');
  }
  
  if (unassign === 'vehicle' || unassign === 'both') {
    adhocUpdates.push('vehicle_id = NULL');
  }

  adhocUpdates.push('updated_at = ?');
  
  const adhocResult = await env.DB.prepare(`
    UPDATE dispatch_adhoc_shifts SET ${adhocUpdates.join(', ')} WHERE id = ? AND deleted_at IS NULL
  `).bind(now, roster_entry_id).run();

  if (adhocResult.meta.changes > 0) {
    return json({ success: true });
  }

  return error('Entry not found', 404);
}

// ============================================
// DUTY LINE FUNCTIONS
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
  const { duty_line_id, ...updates } = input;

  const setClause: string[] = [];
  const bindings: any[] = [];

  if (updates.start_time !== undefined) { setClause.push('start_time = ?'); bindings.push(updates.start_time); }
  if (updates.end_time !== undefined) { setClause.push('end_time = ?'); bindings.push(updates.end_time); }
  if (updates.duty_type !== undefined) { setClause.push('duty_type = ?'); bindings.push(updates.duty_type); }
  if (updates.description !== undefined) { setClause.push('description = ?'); bindings.push(updates.description); }
  if (updates.vehicle_id !== undefined) { setClause.push('vehicle_id = ?'); bindings.push(updates.vehicle_id); }
  if (updates.pay_type !== undefined) { setClause.push('pay_type = ?'); bindings.push(updates.pay_type); }
  if (updates.location_name !== undefined) { setClause.push('location_name = ?'); bindings.push(updates.location_name); }
  if (updates.location_lat !== undefined) { setClause.push('location_lat = ?'); bindings.push(updates.location_lat); }
  if (updates.location_lng !== undefined) { setClause.push('location_lng = ?'); bindings.push(updates.location_lng); }

  if (setClause.length === 0) {
    return error('No updates provided');
  }

  setClause.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(duty_line_id);

  // Try updating roster_duty_lines first
  const rosterResult = await env.DB.prepare(`
    UPDATE roster_duty_lines SET ${setClause.join(', ')} WHERE id = ? AND deleted_at IS NULL
  `).bind(...bindings).run();

  if (rosterResult.meta.changes > 0) {
    return json({ success: true });
  }

  // Try updating dispatch_adhoc_duty_lines
  const adhocResult = await env.DB.prepare(`
    UPDATE dispatch_adhoc_duty_lines SET ${setClause.join(', ')} WHERE id = ? AND deleted_at IS NULL
  `).bind(...bindings).run();

  if (adhocResult.meta.changes > 0) {
    return json({ success: true });
  }

  return error('Duty line not found', 404);
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
  if (!input.roster_entry_id) {
    return error('roster_entry_id is required');
  }

  const now = new Date().toISOString();
  const id = uuid();

  // Check if this is a roster entry
  const rosterEntry = await env.DB.prepare(`
    SELECT id FROM roster_entries WHERE id = ? AND deleted_at IS NULL
  `).bind(input.roster_entry_id).first();

  if (rosterEntry) {
    // Add to roster_duty_lines
    const maxSeq = await env.DB.prepare(`
      SELECT MAX(sequence) as max_seq FROM roster_duty_lines WHERE roster_entry_id = ?
    `).bind(input.roster_entry_id).first<{ max_seq: number | null }>();

    const sequence = (maxSeq?.max_seq || 0) + 1;

    await env.DB.prepare(`
      INSERT INTO roster_duty_lines (
        id, tenant_id, roster_entry_id, sequence, start_time, end_time,
        duty_type, description, vehicle_id, pay_type,
        location_name, location_lat, location_lng,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      TENANT_ID,
      input.roster_entry_id,
      sequence,
      input.start_time,
      input.end_time,
      input.duty_type || 'driving',
      input.description || null,
      input.vehicle_id || null,
      input.pay_type || 'STD',
      input.location_name || null,
      input.location_lat || null,
      input.location_lng || null,
      now,
      now
    ).run();

    return json({ success: true, data: { id } }, 201);
  }

  // Check if this is an adhoc shift
  const adhocShift = await env.DB.prepare(`
    SELECT id FROM dispatch_adhoc_shifts WHERE id = ? AND deleted_at IS NULL
  `).bind(input.roster_entry_id).first();

  if (adhocShift) {
    // Add to dispatch_adhoc_duty_lines
    const maxSeq = await env.DB.prepare(`
      SELECT MAX(sequence) as max_seq FROM dispatch_adhoc_duty_lines WHERE adhoc_shift_id = ?
    `).bind(input.roster_entry_id).first<{ max_seq: number | null }>();

    const sequence = (maxSeq?.max_seq || 0) + 1;

    await env.DB.prepare(`
      INSERT INTO dispatch_adhoc_duty_lines (
        id, tenant_id, adhoc_shift_id, sequence, start_time, end_time,
        duty_type, description, vehicle_id, pay_type,
        location_name, location_lat, location_lng,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      TENANT_ID,
      input.roster_entry_id,
      sequence,
      input.start_time,
      input.end_time,
      input.duty_type || 'driving',
      input.description || null,
      input.vehicle_id || null,
      input.pay_type || 'STD',
      input.location_name || null,
      input.location_lat || null,
      input.location_lng || null,
      now,
      now
    ).run();

    return json({ success: true, data: { id } }, 201);
  }

  return error('Entry not found', 404);
}

async function cancelDutyLine(
  env: Env,
  input: {
    duty_line_id: string;
    reason?: string;
  }
): Promise<Response> {
  const { duty_line_id, reason } = input;

  if (!duty_line_id) {
    return error('duty_line_id is required');
  }

  const now = new Date().toISOString();

  // Check if duty line exists in roster_duty_lines
  const rosterLine = await env.DB.prepare(`
    SELECT id FROM roster_duty_lines WHERE id = ? AND deleted_at IS NULL
  `).bind(duty_line_id).first();

  if (rosterLine) {
    await env.DB.prepare(`
      UPDATE roster_duty_lines 
      SET deleted_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, now, duty_line_id).run();
    return json({ success: true, message: 'Duty cancelled' });
  }

  // Check if duty line exists in dispatch_adhoc_duty_lines
  const adhocLine = await env.DB.prepare(`
    SELECT id FROM dispatch_adhoc_duty_lines WHERE id = ? AND deleted_at IS NULL
  `).bind(duty_line_id).first();

  if (adhocLine) {
    await env.DB.prepare(`
      UPDATE dispatch_adhoc_duty_lines 
      SET deleted_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(now, now, duty_line_id).run();
    return json({ success: true, message: 'Duty cancelled' });
  }

  // Check if it's a template duty line - these can't be directly cancelled
  const templateLine = await env.DB.prepare(`
    SELECT id FROM shift_template_duty_lines WHERE id = ?
  `).bind(duty_line_id).first();

  if (templateLine) {
    return json({ success: true, message: 'Duty cancelled (template)' });
  }

  return error('Duty line not found', 404);
}

async function reinstateDutyLine(
  env: Env,
  input: {
    duty_line_id: string;
  }
): Promise<Response> {
  const { duty_line_id } = input;

  if (!duty_line_id) {
    return error('duty_line_id is required');
  }

  const now = new Date().toISOString();

  // Check if duty line exists in roster_duty_lines (including deleted ones)
  const rosterLine = await env.DB.prepare(`
    SELECT id FROM roster_duty_lines WHERE id = ?
  `).bind(duty_line_id).first();

  if (rosterLine) {
    await env.DB.prepare(`
      UPDATE roster_duty_lines 
      SET deleted_at = NULL, updated_at = ?
      WHERE id = ?
    `).bind(now, duty_line_id).run();
    return json({ success: true, message: 'Duty reinstated' });
  }

  // Check if duty line exists in dispatch_adhoc_duty_lines (including deleted ones)
  const adhocLine = await env.DB.prepare(`
    SELECT id FROM dispatch_adhoc_duty_lines WHERE id = ?
  `).bind(duty_line_id).first();

  if (adhocLine) {
    await env.DB.prepare(`
      UPDATE dispatch_adhoc_duty_lines 
      SET deleted_at = NULL, updated_at = ?
      WHERE id = ?
    `).bind(now, duty_line_id).run();
    return json({ success: true, message: 'Duty reinstated' });
  }

  // Check if it's a template duty line
  const templateLine = await env.DB.prepare(`
    SELECT id FROM shift_template_duty_lines WHERE id = ?
  `).bind(duty_line_id).first();

  if (templateLine) {
    return json({ success: true, message: 'Duty reinstated (template)' });
  }

  return error('Duty line not found', 404);
}

async function createAdhocShift(
  env: Env,
  input: {
    date: string;
    employee_id: string;
    duty: {
      start_time: number;
      end_time: number;
      duty_type?: string;
      description?: string;
      vehicle_id?: string | null;
      pay_type?: string;
      location_name?: string | null;
      location_lat?: number | null;
      location_lng?: number | null;
    };
  }
): Promise<Response> {
  const { date, employee_id, duty } = input;
  const now = new Date().toISOString();

  // Create adhoc shift (standalone - no roster or template involved)
  const shiftId = uuid();
  await env.DB.prepare(`
    INSERT INTO dispatch_adhoc_shifts (
      id, tenant_id, date, employee_id, name, start_time, end_time, vehicle_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ADHOC', ?, ?, ?, 'active', ?, ?)
  `).bind(
    shiftId,
    TENANT_ID,
    date,
    employee_id,
    duty.start_time,
    duty.end_time,
    duty.vehicle_id || null,
    now,
    now
  ).run();

  // Create first duty line for this adhoc shift
  const dutyLineId = uuid();
  await env.DB.prepare(`
    INSERT INTO dispatch_adhoc_duty_lines (
      id, tenant_id, adhoc_shift_id, sequence, start_time, end_time,
      duty_type, description, vehicle_id, pay_type, location_name, location_lat, location_lng,
      created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    dutyLineId,
    TENANT_ID,
    shiftId,
    duty.start_time,
    duty.end_time,
    duty.duty_type || 'driving',
    duty.description || 'Adhoc Duty',
    duty.vehicle_id || null,
    duty.pay_type || 'STD',
    duty.location_name || null,
    duty.location_lat || null,
    duty.location_lng || null,
    now,
    now
  ).run();

  return json({ 
    success: true, 
    data: { 
      entry_id: shiftId,
      duty_line_id: dutyLineId 
    } 
  }, 201);
}
