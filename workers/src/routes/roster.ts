/**
 * Roster API Routes
 * /api/roster/*
 * 
 * Core roster functionality:
 * - Schedule shifts to dates
 * - Assign drivers/vehicles
 * - Copy roster entries (day, week, pattern)
 */

import { Env, json, error, uuid, parseBody } from '../index';

interface RosterEntryInput {
  shift_template_id?: string;
  date: string;
  name: string;
  shift_type?: string;
  route_id?: string;
  customer_id?: string;
  start_time: number;
  end_time: number;
  driver_id?: string;
  vehicle_id?: string;
  notes?: string;
}

interface RosterDutyInput {
  duty_type_id: string;
  sequence: number;
  start_time: number;
  end_time: number;
  description?: string;
  from_location_id?: string;
  to_location_id?: string;
  vehicle_id?: string;
  driver_id?: string;
  pay_type_id?: string;
  notes?: string;
}

interface CopyRosterInput {
  source_date: string;
  target_date: string;
  include_assignments?: boolean; // Copy driver/vehicle assignments
}

interface CopyWeekInput {
  source_week_start: string; // Monday of source week
  target_week_start: string; // Monday of target week
  include_assignments?: boolean;
}

interface BulkRosterInput {
  entries: RosterEntryInput[];
}

const TENANT_ID = 'default';

export async function handleRoster(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const firstSegment = segments[0];
  const secondSegment = segments[1];
  const thirdSegment = segments[2];

  // GET /api/roster?date=YYYY-MM-DD or date_from & date_to
  if (method === 'GET' && !firstSegment) {
    return listRosterEntries(env, new URL(request.url).searchParams);
  }

  // GET /api/roster/date/:date - Single day view
  if (method === 'GET' && firstSegment === 'date' && secondSegment) {
    return getRosterByDate(env, secondSegment);
  }

  // GET /api/roster/week/:date - Week view (date is any day in week)
  if (method === 'GET' && firstSegment === 'week' && secondSegment) {
    return getRosterWeek(env, secondSegment);
  }

  // GET /api/roster/month/:year/:month
  if (method === 'GET' && firstSegment === 'month' && secondSegment && thirdSegment) {
    return getRosterMonth(env, parseInt(secondSegment), parseInt(thirdSegment));
  }

  // GET /api/roster/:id - Single entry with duties
  if (method === 'GET' && firstSegment && !secondSegment) {
    return getRosterEntry(env, firstSegment);
  }

  // POST /api/roster - Create entry (instantiate from template or ad-hoc)
  if (method === 'POST' && !firstSegment) {
    const body = await parseBody<RosterEntryInput>(request);
    if (!body) return error('Invalid request body');
    return createRosterEntry(env, body);
  }

  // POST /api/roster/bulk - Create multiple entries
  if (method === 'POST' && firstSegment === 'bulk') {
    const body = await parseBody<BulkRosterInput>(request);
    if (!body) return error('Invalid request body');
    return bulkCreateRosterEntries(env, body);
  }

  // POST /api/roster/copy-day - Copy a day's roster to another day
  if (method === 'POST' && firstSegment === 'copy-day') {
    const body = await parseBody<CopyRosterInput>(request);
    if (!body) return error('Invalid request body');
    return copyRosterDay(env, body);
  }

  // POST /api/roster/copy-week - Copy a week's roster to another week
  if (method === 'POST' && firstSegment === 'copy-week') {
    const body = await parseBody<CopyWeekInput>(request);
    if (!body) return error('Invalid request body');
    return copyRosterWeek(env, body);
  }

  // PUT /api/roster/:id - Update entry
  if (method === 'PUT' && firstSegment && !secondSegment) {
    const body = await parseBody<Partial<RosterEntryInput>>(request);
    if (!body) return error('Invalid request body');
    return updateRosterEntry(env, firstSegment, body);
  }

  // PUT /api/roster/:id/assign - Quick assign driver/vehicle
  if (method === 'PUT' && firstSegment && secondSegment === 'assign') {
    const body = await parseBody<{ driver_id?: string; vehicle_id?: string }>(request);
    if (!body) return error('Invalid request body');
    return assignRosterEntry(env, firstSegment, body);
  }

  // DELETE /api/roster/:id
  if (method === 'DELETE' && firstSegment && !secondSegment) {
    return deleteRosterEntry(env, firstSegment);
  }

  // POST /api/roster/:id/duties - Add duty
  if (method === 'POST' && firstSegment && secondSegment === 'duties') {
    const body = await parseBody<RosterDutyInput>(request);
    if (!body) return error('Invalid request body');
    return addRosterDuty(env, firstSegment, body);
  }

  // PUT /api/roster/:id/duties/:dutyId - Update duty
  if (method === 'PUT' && firstSegment && secondSegment === 'duties' && thirdSegment) {
    const body = await parseBody<Partial<RosterDutyInput>>(request);
    if (!body) return error('Invalid request body');
    return updateRosterDuty(env, firstSegment, thirdSegment, body);
  }

  // DELETE /api/roster/:id/duties/:dutyId
  if (method === 'DELETE' && firstSegment && secondSegment === 'duties' && thirdSegment) {
    return deleteRosterDuty(env, firstSegment, thirdSegment);
  }

  return error('Method not allowed', 405);
}

// ============================================
// LIST / GET
// ============================================

async function listRosterEntries(env: Env, params: URLSearchParams): Promise<Response> {
  const date = params.get('date');
  const dateFrom = params.get('date_from');
  const dateTo = params.get('date_to');
  const driverId = params.get('driver_id');
  const vehicleId = params.get('vehicle_id');
  const status = params.get('status');
  const unassigned = params.get('unassigned');

  let query = `SELECT * FROM v_roster_full WHERE tenant_id = ?`;
  const bindings: (string | number)[] = [TENANT_ID];

  if (date) {
    query += ` AND date = ?`;
    bindings.push(date);
  } else if (dateFrom && dateTo) {
    query += ` AND date >= ? AND date <= ?`;
    bindings.push(dateFrom, dateTo);
  }

  if (driverId) {
    query += ` AND driver_id = ?`;
    bindings.push(driverId);
  }

  if (vehicleId) {
    query += ` AND vehicle_id = ?`;
    bindings.push(vehicleId);
  }

  if (status) {
    query += ` AND status = ?`;
    bindings.push(status);
  }

  if (unassigned === 'true') {
    query += ` AND driver_id IS NULL`;
  }

  query += ` ORDER BY date, start_time`;

  const result = await env.DB.prepare(query).bind(...bindings).all();
  return json({ data: result.results });
}

async function getRosterByDate(env: Env, date: string): Promise<Response> {
  // Get all roster entries for the date with their duties
  const entries = await env.DB.prepare(`
    SELECT * FROM v_roster_full WHERE tenant_id = ? AND date = ? ORDER BY start_time
  `).bind(TENANT_ID, date).all();

  // Get duties for all entries
  const entryIds = entries.results.map((e: Record<string, unknown>) => e.id);
  
  if (entryIds.length === 0) {
    return json({ data: { date, entries: [] } });
  }

  const placeholders = entryIds.map(() => '?').join(',');
  const duties = await env.DB.prepare(`
    SELECT 
      rd.*,
      dt.code as duty_type_code,
      dt.name as duty_type_name,
      dt.color as duty_type_color,
      pt.code as pay_type_code
    FROM roster_duties rd
    JOIN duty_types dt ON rd.duty_type_id = dt.id
    LEFT JOIN pay_types pt ON rd.pay_type_id = pt.id
    WHERE rd.roster_entry_id IN (${placeholders})
    ORDER BY rd.roster_entry_id, rd.sequence
  `).bind(...entryIds).all();

  // Group duties by entry
  const dutiesByEntry = new Map<string, unknown[]>();
  for (const duty of duties.results) {
    const entryId = (duty as Record<string, unknown>).roster_entry_id as string;
    if (!dutiesByEntry.has(entryId)) {
      dutiesByEntry.set(entryId, []);
    }
    dutiesByEntry.get(entryId)!.push(duty);
  }

  // Combine
  const enrichedEntries = entries.results.map((entry: Record<string, unknown>) => ({
    ...entry,
    duties: dutiesByEntry.get(entry.id as string) || [],
  }));

  return json({ data: { date, entries: enrichedEntries } });
}

async function getRosterWeek(env: Env, anyDateInWeek: string): Promise<Response> {
  // Calculate Monday of the week
  const date = new Date(anyDateInWeek);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(date.setDate(diff));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = monday.toISOString().split('T')[0];
  const sundayStr = sunday.toISOString().split('T')[0];

  const entries = await env.DB.prepare(`
    SELECT * FROM v_roster_full 
    WHERE tenant_id = ? AND date >= ? AND date <= ?
    ORDER BY date, start_time
  `).bind(TENANT_ID, mondayStr, sundayStr).all();

  // Group by date
  const byDate: Record<string, unknown[]> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    byDate[d.toISOString().split('T')[0]] = [];
  }

  for (const entry of entries.results) {
    const dateKey = (entry as Record<string, unknown>).date as string;
    if (byDate[dateKey]) {
      byDate[dateKey].push(entry);
    }
  }

  return json({
    data: {
      week_start: mondayStr,
      week_end: sundayStr,
      days: byDate,
    },
  });
}

async function getRosterMonth(env: Env, year: number, month: number): Promise<Response> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

  const entries = await env.DB.prepare(`
    SELECT date, COUNT(*) as total_shifts,
           SUM(CASE WHEN driver_id IS NOT NULL THEN 1 ELSE 0 END) as assigned_shifts,
           SUM(CASE WHEN driver_id IS NULL THEN 1 ELSE 0 END) as unassigned_shifts
    FROM roster_entries
    WHERE tenant_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
    GROUP BY date
    ORDER BY date
  `).bind(TENANT_ID, startDate, endDate).all();

  return json({
    data: {
      year,
      month,
      start_date: startDate,
      end_date: endDate,
      summary: entries.results,
    },
  });
}

async function getRosterEntry(env: Env, id: string): Promise<Response> {
  const entry = await env.DB.prepare(`
    SELECT * FROM v_roster_full WHERE id = ? AND tenant_id = ?
  `).bind(id, TENANT_ID).first();

  if (!entry) return error('Roster entry not found', 404);

  const duties = await env.DB.prepare(`
    SELECT 
      rd.*,
      dt.code as duty_type_code,
      dt.name as duty_type_name,
      dt.color as duty_type_color,
      pt.code as pay_type_code
    FROM roster_duties rd
    JOIN duty_types dt ON rd.duty_type_id = dt.id
    LEFT JOIN pay_types pt ON rd.pay_type_id = pt.id
    WHERE rd.roster_entry_id = ?
    ORDER BY rd.sequence
  `).bind(id).all();

  return json({ data: { ...entry, duties: duties.results } });
}

// ============================================
// CREATE
// ============================================

async function createRosterEntry(env: Env, input: RosterEntryInput): Promise<Response> {
  if (!input.date || !input.name || input.start_time === undefined || input.end_time === undefined) {
    return error('date, name, start_time, and end_time are required');
  }

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO roster_entries (
      id, tenant_id, shift_template_id, date, name, shift_type, route_id, customer_id,
      start_time, end_time, driver_id, vehicle_id, status, notes, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, 'manual', ?, ?)
  `).bind(
    id, TENANT_ID, input.shift_template_id || null, input.date, input.name,
    input.shift_type || 'regular', input.route_id || null, input.customer_id || null,
    input.start_time, input.end_time, input.driver_id || null, input.vehicle_id || null,
    input.notes || null, now, now
  ).run();

  // If template provided, instantiate duties from template
  if (input.shift_template_id) {
    await instantiateDutiesFromTemplate(env, id, input.shift_template_id, input.start_time);
  }

  return getRosterEntry(env, id);
}

async function instantiateDutiesFromTemplate(
  env: Env,
  rosterEntryId: string,
  templateId: string,
  shiftStart: number
): Promise<void> {
  const templateDuties = await env.DB.prepare(`
    SELECT * FROM shift_template_duties WHERE shift_template_id = ? ORDER BY sequence
  `).bind(templateId).all();

  const now = new Date().toISOString();

  for (const td of templateDuties.results as Record<string, unknown>[]) {
    const startTime = shiftStart + (td.start_offset as number);
    const endTime = startTime + (td.duration as number);

    await env.DB.prepare(`
      INSERT INTO roster_duties (
        id, roster_entry_id, duty_type_id, sequence, start_time, end_time,
        description, pay_type_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
    `).bind(
      uuid(), rosterEntryId, td.duty_type_id, td.sequence, startTime, endTime,
      td.description_template || null, 'pt-std', now, now
    ).run();
  }
}

async function bulkCreateRosterEntries(env: Env, input: BulkRosterInput): Promise<Response> {
  const created: string[] = [];

  for (const entry of input.entries) {
    const result = await createRosterEntry(env, entry);
    const data = await result.json() as { data: { id: string } };
    if (data.data?.id) {
      created.push(data.data.id);
    }
  }

  return json({ data: { created_count: created.length, ids: created } });
}

// ============================================
// COPY FUNCTIONALITY
// ============================================

async function copyRosterDay(env: Env, input: CopyRosterInput): Promise<Response> {
  const { source_date, target_date, include_assignments } = input;

  // Get source entries
  const sourceEntries = await env.DB.prepare(`
    SELECT * FROM roster_entries 
    WHERE tenant_id = ? AND date = ? AND deleted_at IS NULL
  `).bind(TENANT_ID, source_date).all();

  if (sourceEntries.results.length === 0) {
    return error('No roster entries found for source date');
  }

  const now = new Date().toISOString();
  const createdIds: string[] = [];

  for (const source of sourceEntries.results as Record<string, unknown>[]) {
    const newId = uuid();

    // Copy entry
    await env.DB.prepare(`
      INSERT INTO roster_entries (
        id, tenant_id, shift_template_id, date, name, shift_type, route_id, customer_id,
        start_time, end_time, driver_id, vehicle_id, status, notes, source, source_roster_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, 'copied', ?, ?, ?)
    `).bind(
      newId, TENANT_ID, source.shift_template_id, target_date, source.name,
      source.shift_type, source.route_id, source.customer_id,
      source.start_time, source.end_time,
      include_assignments ? source.driver_id : null,
      include_assignments ? source.vehicle_id : null,
      source.notes, source.id, now, now
    ).run();

    // Copy duties
    const sourceDuties = await env.DB.prepare(`
      SELECT * FROM roster_duties WHERE roster_entry_id = ?
    `).bind(source.id).all();

    for (const duty of sourceDuties.results as Record<string, unknown>[]) {
      await env.DB.prepare(`
        INSERT INTO roster_duties (
          id, roster_entry_id, duty_type_id, sequence, start_time, end_time,
          description, from_location_id, to_location_id, vehicle_id, driver_id,
          pay_type_id, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
      `).bind(
        uuid(), newId, duty.duty_type_id, duty.sequence, duty.start_time, duty.end_time,
        duty.description, duty.from_location_id, duty.to_location_id,
        include_assignments ? duty.vehicle_id : null,
        include_assignments ? duty.driver_id : null,
        duty.pay_type_id, duty.notes, now, now
      ).run();
    }

    createdIds.push(newId);
  }

  return json({
    data: {
      source_date,
      target_date,
      copied_count: createdIds.length,
      ids: createdIds,
    },
  });
}

async function copyRosterWeek(env: Env, input: CopyWeekInput): Promise<Response> {
  const { source_week_start, target_week_start, include_assignments } = input;

  // Calculate week date ranges
  const sourceStart = new Date(source_week_start);
  const targetStart = new Date(target_week_start);

  const results: { date: string; copied: number }[] = [];

  // Copy each day
  for (let i = 0; i < 7; i++) {
    const sourceDate = new Date(sourceStart);
    sourceDate.setDate(sourceStart.getDate() + i);
    const sourceDateStr = sourceDate.toISOString().split('T')[0];

    const targetDate = new Date(targetStart);
    targetDate.setDate(targetStart.getDate() + i);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    const dayResult = await copyRosterDay(env, {
      source_date: sourceDateStr,
      target_date: targetDateStr,
      include_assignments,
    });

    const dayData = await dayResult.json() as { data: { copied_count: number } };
    results.push({ date: targetDateStr, copied: dayData.data?.copied_count || 0 });
  }

  return json({
    data: {
      source_week_start,
      target_week_start,
      days: results,
      total_copied: results.reduce((sum, d) => sum + d.copied, 0),
    },
  });
}

// ============================================
// UPDATE / ASSIGN
// ============================================

async function updateRosterEntry(env: Env, id: string, input: Partial<RosterEntryInput>): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM roster_entries WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(id, TENANT_ID).first();

  if (!existing) return error('Roster entry not found', 404);

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof RosterEntryInput)[] = [
    'date', 'name', 'shift_type', 'route_id', 'customer_id',
    'start_time', 'end_time', 'driver_id', 'vehicle_id', 'notes'
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
    UPDATE roster_entries SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
  `).bind(...bindings).run();

  return getRosterEntry(env, id);
}

async function assignRosterEntry(
  env: Env,
  id: string,
  input: { driver_id?: string; vehicle_id?: string }
): Promise<Response> {
  const updates: string[] = [];
  const bindings: (string | null)[] = [];

  if ('driver_id' in input) {
    updates.push('driver_id = ?');
    bindings.push(input.driver_id || null);
  }

  if ('vehicle_id' in input) {
    updates.push('vehicle_id = ?');
    bindings.push(input.vehicle_id || null);
  }

  if (updates.length === 0) return error('No assignment provided');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString());
  bindings.push(id, TENANT_ID);

  const result = await env.DB.prepare(`
    UPDATE roster_entries SET ${updates.join(', ')} 
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(...bindings).run();

  if (result.meta.changes === 0) return error('Roster entry not found', 404);

  return getRosterEntry(env, id);
}

async function deleteRosterEntry(env: Env, id: string): Promise<Response> {
  const result = await env.DB.prepare(`
    UPDATE roster_entries SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(new Date().toISOString(), new Date().toISOString(), id, TENANT_ID).run();

  if (result.meta.changes === 0) return error('Roster entry not found', 404);
  return json({ success: true });
}

// ============================================
// DUTY MANAGEMENT
// ============================================

async function addRosterDuty(env: Env, entryId: string, input: RosterDutyInput): Promise<Response> {
  const entry = await env.DB.prepare(`
    SELECT id FROM roster_entries WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
  `).bind(entryId, TENANT_ID).first();

  if (!entry) return error('Roster entry not found', 404);

  const id = uuid();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO roster_duties (
      id, roster_entry_id, duty_type_id, sequence, start_time, end_time,
      description, from_location_id, to_location_id, vehicle_id, driver_id,
      pay_type_id, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
  `).bind(
    id, entryId, input.duty_type_id, input.sequence, input.start_time, input.end_time,
    input.description || null, input.from_location_id || null, input.to_location_id || null,
    input.vehicle_id || null, input.driver_id || null, input.pay_type_id || 'pt-std',
    input.notes || null, now, now
  ).run();

  return getRosterEntry(env, entryId);
}

async function updateRosterDuty(
  env: Env,
  entryId: string,
  dutyId: string,
  input: Partial<RosterDutyInput>
): Promise<Response> {
  const existing = await env.DB.prepare(`
    SELECT id FROM roster_duties WHERE id = ? AND roster_entry_id = ?
  `).bind(dutyId, entryId).first();

  if (!existing) return error('Duty not found', 404);

  const updates: string[] = [];
  const bindings: (string | number | null)[] = [];

  const fields: (keyof RosterDutyInput)[] = [
    'duty_type_id', 'sequence', 'start_time', 'end_time', 'description',
    'from_location_id', 'to_location_id', 'vehicle_id', 'driver_id', 'pay_type_id', 'notes'
  ];

  for (const field of fields) {
    if (field in input) {
      updates.push(`${field} = ?`);
      bindings.push(input[field] ?? null);
    }
  }

  if (updates.length === 0) return error('No fields to update');

  updates.push('updated_at = ?');
  bindings.push(new Date().toISOString(), dutyId);

  await env.DB.prepare(`
    UPDATE roster_duties SET ${updates.join(', ')} WHERE id = ?
  `).bind(...bindings).run();

  return getRosterEntry(env, entryId);
}

async function deleteRosterDuty(env: Env, entryId: string, dutyId: string): Promise<Response> {
  const result = await env.DB.prepare(`
    DELETE FROM roster_duties WHERE id = ? AND roster_entry_id = ?
  `).bind(dutyId, entryId).run();

  if (result.meta.changes === 0) return error('Duty not found', 404);
  return getRosterEntry(env, entryId);
}
