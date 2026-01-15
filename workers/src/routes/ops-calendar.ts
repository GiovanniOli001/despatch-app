/**
 * Operations Calendar API Routes
 * /api/ops-calendar/*
 * 
 * Provides month view of rosters and overlap checking.
 * Rosters only appear on calendar when explicitly scheduled (calendar_start_date/calendar_end_date set).
 */

import { Env, json, error } from '../index';

const TENANT_ID = 'default';

// QLD Public Holidays 2025-2027
const QLD_HOLIDAYS: Record<string, string> = {
  '2025-01-01': "New Year's Day",
  '2025-01-27': 'Australia Day',
  '2025-04-18': 'Good Friday',
  '2025-04-19': 'Easter Saturday',
  '2025-04-21': 'Easter Monday',
  '2025-04-25': 'ANZAC Day',
  '2025-05-05': 'Labour Day (QLD)',
  '2025-06-09': "King's Birthday (QLD)",
  '2025-08-13': 'Royal Queensland Show (Brisbane)',
  '2025-12-25': 'Christmas Day',
  '2025-12-26': 'Boxing Day',
  '2026-01-01': "New Year's Day",
  '2026-01-26': 'Australia Day',
  '2026-04-03': 'Good Friday',
  '2026-04-04': 'Easter Saturday',
  '2026-04-06': 'Easter Monday',
  '2026-04-25': 'ANZAC Day',
  '2026-05-04': 'Labour Day (QLD)',
  '2026-06-08': "King's Birthday (QLD)",
  '2026-08-12': 'Royal Queensland Show (Brisbane)',
  '2026-12-25': 'Christmas Day',
  '2026-12-26': 'Boxing Day',
  '2027-01-01': "New Year's Day",
  '2027-01-26': 'Australia Day',
  '2027-03-26': 'Good Friday',
  '2027-03-27': 'Easter Saturday',
  '2027-03-29': 'Easter Monday',
  '2027-04-25': 'ANZAC Day',
  '2027-05-03': 'Labour Day (QLD)',
  '2027-06-14': "King's Birthday (QLD)",
  '2027-08-11': 'Royal Queensland Show (Brisbane)',
  '2027-12-25': 'Christmas Day',
  '2027-12-27': 'Boxing Day (observed)',
};

// QLD School Holidays 2025-2027 (date ranges)
// Format: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', name: 'Holiday Name' }
const QLD_SCHOOL_HOLIDAYS: Array<{ start: string; end: string; name: string }> = [
  // 2025
  { start: '2025-01-01', end: '2025-01-27', name: 'Summer Holidays' },
  { start: '2025-04-05', end: '2025-04-21', name: 'Autumn Holidays' },
  { start: '2025-06-28', end: '2025-07-13', name: 'Winter Holidays' },
  { start: '2025-09-20', end: '2025-10-06', name: 'Spring Holidays' },
  { start: '2025-12-13', end: '2025-12-31', name: 'Summer Holidays' },
  // 2026
  { start: '2026-01-01', end: '2026-01-26', name: 'Summer Holidays' },
  { start: '2026-04-03', end: '2026-04-19', name: 'Autumn Holidays' },
  { start: '2026-06-27', end: '2026-07-12', name: 'Winter Holidays' },
  { start: '2026-09-19', end: '2026-10-05', name: 'Spring Holidays' },
  { start: '2026-12-12', end: '2026-12-31', name: 'Summer Holidays' },
  // 2027
  { start: '2027-01-01', end: '2027-01-26', name: 'Summer Holidays' },
  { start: '2027-03-26', end: '2027-04-11', name: 'Autumn Holidays' },
  { start: '2027-06-26', end: '2027-07-11', name: 'Winter Holidays' },
  { start: '2027-09-18', end: '2027-10-04', name: 'Spring Holidays' },
  { start: '2027-12-11', end: '2027-12-31', name: 'Summer Holidays' },
  // 2028 (partial - for summer continuation)
  { start: '2028-01-01', end: '2028-01-23', name: 'Summer Holidays' },
];

// Helper function to check if a date falls within school holidays
function getSchoolHoliday(dateStr: string): string | null {
  for (const holiday of QLD_SCHOOL_HOLIDAYS) {
    if (dateStr >= holiday.start && dateStr <= holiday.end) {
      return holiday.name;
    }
  }
  return null;
}

export async function handleOpsCalendar(
  request: Request,
  env: Env,
  segments: string[]
): Promise<Response> {
  const method = request.method;
  const seg1 = segments[0];
  const seg2 = segments[1];

  try {
    // GET /api/ops-calendar/:year/:month - Get month view
    if (method === 'GET' && seg1 && seg2 && !isNaN(parseInt(seg1)) && !isNaN(parseInt(seg2))) {
      const year = parseInt(seg1);
      const month = parseInt(seg2);
      if (month < 1 || month > 12) {
        return error('Invalid month (must be 1-12)');
      }
      return getMonthView(env, year, month);
    }

    // GET /api/ops-calendar/check-overlap?start_date=&end_date=&exclude_roster_id=
    if (method === 'GET' && seg1 === 'check-overlap') {
      const url = new URL(request.url);
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');
      const excludeRosterId = url.searchParams.get('exclude_roster_id');
      
      if (!startDate || !endDate) {
        return error('start_date and end_date are required');
      }
      return checkOverlap(env, startDate, endDate, excludeRosterId);
    }

    // GET /api/ops-calendar/rosters - Get all rosters (for sidebar)
    if (method === 'GET' && seg1 === 'rosters') {
      return getAllRosters(env);
    }

    return error('Not found', 404);
  } catch (err) {
    console.error('OpsCalendar API error:', err);
    return error(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

async function getMonthView(env: Env, year: number, month: number): Promise<Response> {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();

  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Get rosters that are SCHEDULED on this month (calendar_start_date and calendar_end_date are set)
  const scheduledRosters = await env.DB.prepare(`
    SELECT 
      r.id,
      r.code,
      r.name,
      r.start_date,
      r.end_date,
      r.calendar_start_date,
      r.calendar_end_date,
      r.status,
      r.notes,
      (SELECT COUNT(*) FROM roster_entries re WHERE re.roster_id = r.id AND re.deleted_at IS NULL) as entry_count,
      (SELECT COUNT(*) FROM roster_entries re WHERE re.roster_id = r.id AND re.deleted_at IS NULL AND re.driver_id IS NOT NULL) as assigned_count
    FROM rosters r
    WHERE r.tenant_id = ? 
      AND r.deleted_at IS NULL
      AND r.calendar_start_date IS NOT NULL
      AND r.calendar_end_date IS NOT NULL
      AND r.calendar_start_date <= ?
      AND r.calendar_end_date >= ?
    ORDER BY r.calendar_start_date, r.code
  `).bind(TENANT_ID, endDateStr, startDateStr).all();

  // Build roster data for calendar (only scheduled ones)
  const calendarRosters = (scheduledRosters.results as any[]).map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    calendarStartDate: r.calendar_start_date,
    calendarEndDate: r.calendar_end_date,
    status: r.status,
    entryCount: r.entry_count,
    assignedCount: r.assigned_count,
    unassignedCount: r.entry_count - r.assigned_count,
    notes: r.notes,
    isScheduled: true
  }));

  // Build days array
  const today = new Date().toISOString().split('T')[0];
  const days: any[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayDate = new Date(year, month - 1, d);
    const dayOfWeek = dayDate.getDay();

    // Use calendar dates (not roster dates) to determine which rosters appear on this day
    const rostersOnDay = calendarRosters
      .filter(r => r.calendarStartDate <= dateStr && r.calendarEndDate >= dateStr)
      .map(r => r.id);

    // Check for public holiday
    const publicHoliday = QLD_HOLIDAYS[dateStr] || null;
    
    // Check for school holiday
    const schoolHoliday = getSchoolHoliday(dateStr);

    days.push({
      date: dateStr,
      dayOfWeek,
      isToday: dateStr === today,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isHoliday: !!publicHoliday,
      holidayName: publicHoliday,
      isSchoolHoliday: !!schoolHoliday,
      schoolHolidayName: schoolHoliday,
      rosters: rostersOnDay
    });
  }

  return json({
    success: true,
    data: {
      year,
      month,
      monthName: monthNames[month - 1],
      daysInMonth,
      days,
      rosters: calendarRosters
    }
  });
}

async function checkOverlap(
  env: Env, 
  startDate: string, 
  endDate: string, 
  excludeRosterId: string | null
): Promise<Response> {
  let query = `
    SELECT id, code, name, calendar_start_date, calendar_end_date, status
    FROM rosters
    WHERE tenant_id = ?
      AND deleted_at IS NULL
      AND calendar_start_date IS NOT NULL
      AND calendar_end_date IS NOT NULL
      AND calendar_start_date <= ?
      AND calendar_end_date >= ?
  `;
  const params: any[] = [TENANT_ID, endDate, startDate];

  if (excludeRosterId) {
    query += ` AND id != ?`;
    params.push(excludeRosterId);
  }

  const overlapping = await env.DB.prepare(query).bind(...params).all();

  return json({
    success: true,
    data: {
      hasOverlap: overlapping.results.length > 0,
      overlappingRosters: overlapping.results
    }
  });
}

async function getAllRosters(env: Env): Promise<Response> {
  const rosters = await env.DB.prepare(`
    SELECT 
      r.id,
      r.code,
      r.name,
      r.start_date,
      r.end_date,
      r.calendar_start_date,
      r.calendar_end_date,
      r.status,
      r.notes,
      (SELECT COUNT(*) FROM roster_entries re WHERE re.roster_id = r.id AND re.deleted_at IS NULL) as entry_count,
      (SELECT COUNT(*) FROM roster_entries re WHERE re.roster_id = r.id AND re.deleted_at IS NULL AND re.driver_id IS NOT NULL) as assigned_count
    FROM rosters r
    WHERE r.tenant_id = ? 
      AND r.deleted_at IS NULL
    ORDER BY r.calendar_start_date DESC NULLS LAST, r.start_date DESC, r.code
  `).bind(TENANT_ID).all();

  const data = (rosters.results as any[]).map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    calendarStartDate: r.calendar_start_date,
    calendarEndDate: r.calendar_end_date,
    status: r.status,
    entryCount: r.entry_count,
    assignedCount: r.assigned_count,
    unassignedCount: r.entry_count - r.assigned_count,
    notes: r.notes,
    isScheduled: !!r.calendar_start_date && !!r.calendar_end_date
  }));

  return json({
    success: true,
    data
  });
}
