// ============================================
// OPS CALENDAR
// ============================================

let opsCalendarYear = new Date().getFullYear();
let opsCalendarMonth = new Date().getMonth() + 1;
let opsCalendarData = null;
let allRostersData = []; // All rosters (for sidebar)
let selectedRosterForSchedule = null; // For schedule modal

async function loadOpsCalendar() {
  const grid = document.getElementById('opsCalendarGrid');
  const list = document.getElementById('opsRosterList');
  
  grid.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading calendar...</div>';
  list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Loading...</div>';
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  document.getElementById('calendarMonthLabel').textContent = `${monthNames[opsCalendarMonth - 1]} ${opsCalendarYear}`;
  
  try {
    // Load calendar view (only scheduled rosters appear here)
    const calResult = await apiRequest(`/ops-calendar/${opsCalendarYear}/${opsCalendarMonth}`);
    opsCalendarData = calResult.data;
    
    // Load ALL rosters for sidebar
    const rostersResult = await apiRequest('/ops-calendar/rosters');
    allRostersData = rostersResult.data || [];
    
    renderOpsCalendar();
    renderOpsRosterList();
  } catch (err) {
    grid.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--accent-red);">Error: ${err.message}</div>`;
    list.innerHTML = '';
  }
}

function renderOpsCalendar() {
  if (!opsCalendarData) return;
  
  const grid = document.getElementById('opsCalendarGrid');
  const { days, rosters } = opsCalendarData;
  
  // Only scheduled rosters come from calendar endpoint
  const rosterMap = {};
  rosters.forEach(r => rosterMap[r.id] = r);
  
  const firstDayOfWeek = days[0].dayOfWeek;
  
  let html = `
    <div class="calendar-month">
      <div class="calendar-header-row">
        <div class="calendar-header-cell">Sun</div>
        <div class="calendar-header-cell">Mon</div>
        <div class="calendar-header-cell">Tue</div>
        <div class="calendar-header-cell">Wed</div>
        <div class="calendar-header-cell">Thu</div>
        <div class="calendar-header-cell">Fri</div>
        <div class="calendar-header-cell weekend">Sat</div>
      </div>
      <div class="calendar-body">
  `;
  
  for (let i = 0; i < firstDayOfWeek; i++) {
    html += `<div class="calendar-day other-month"></div>`;
  }
  
  for (const day of days) {
    const classes = ['calendar-day'];
    if (day.isWeekend) classes.push('weekend');
    if (day.isToday) classes.push('today');
    if (day.isHoliday) classes.push('holiday');
    if (day.isSchoolHoliday && !day.isHoliday) classes.push('school-holiday');
    
    // Build badges for holidays
    let badgesHtml = '';
    if (day.isHoliday || day.isSchoolHoliday) {
      badgesHtml = '<div class="calendar-badges">';
      if (day.isHoliday) {
        badgesHtml += `<div class="calendar-holiday-badge" title="${day.holidayName}">${day.holidayName}</div>`;
      }
      if (day.isSchoolHoliday) {
        badgesHtml += `<div class="calendar-school-badge" title="${day.schoolHolidayName}">School Hols</div>`;
      }
      badgesHtml += '</div>';
    }
    
    html += `
      <div class="${classes.join(' ')}">
        <div class="calendar-day-header">
          <div class="calendar-day-number">${parseInt(day.date.split('-')[2])}</div>
          ${badgesHtml}
        </div>
        <div class="calendar-roster-bars">
    `;
    
    for (const rosterId of day.rosters) {
      const roster = rosterMap[rosterId];
      if (roster) {
        html += `
          <div class="calendar-roster-bar ${roster.status}" 
               onclick="openRosterFromCalendar('${roster.id}')" 
               title="${roster.code} - ${roster.name}">
            ${roster.code}
          </div>
        `;
      }
    }
    
    html += `</div></div>`;
  }
  
  const lastDayOfWeek = days[days.length - 1].dayOfWeek;
  for (let i = lastDayOfWeek + 1; i < 7; i++) {
    html += `<div class="calendar-day other-month"></div>`;
  }
  
  html += `</div></div>`;
  grid.innerHTML = html;
}

function renderOpsRosterList() {
  const list = document.getElementById('opsRosterList');
  
  if (allRostersData.length === 0) {
    list.innerHTML = `
      <div class="calendar-no-rosters">
        <p>No rosters available.</p>
        <p style="margin-top: 8px;"><a href="#" onclick="navigateTo('roster'); return false;" style="color: var(--accent-blue);">Go to Roster</a> to create one.</p>
      </div>
    `;
    return;
  }
  
  // Separate scheduled and unscheduled
  const scheduled = allRostersData.filter(r => r.isScheduled);
  const unscheduled = allRostersData.filter(r => !r.isScheduled);
  
  let html = '';
  
  // Scheduled rosters section
  if (scheduled.length > 0) {
    html += `<div class="ops-section-title">On Calendar (${scheduled.length})</div>`;
    for (const roster of scheduled) {
      html += renderOpsRosterItem(roster, true);
    }
  }
  
  // Unscheduled rosters section
  if (unscheduled.length > 0) {
    html += `<div class="ops-section-title" style="margin-top: 16px;">Available Rosters (${unscheduled.length})</div>`;
    for (const roster of unscheduled) {
      html += renderOpsRosterItem(roster, false);
    }
  }
  
  list.innerHTML = html;
}

function renderOpsRosterItem(roster, isScheduled) {
  const validStart = new Date(roster.startDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const validEnd = new Date(roster.endDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  
  let calendarDates = '';
  if (isScheduled && roster.calendarStartDate && roster.calendarEndDate) {
    const calStart = new Date(roster.calendarStartDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const calEnd = new Date(roster.calendarEndDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    calendarDates = `<div class="ops-roster-cal-dates">📅 ${calStart} → ${calEnd}</div>`;
  }
  
  return `
    <div class="ops-roster-item ${isScheduled ? 'status-' + roster.status : 'unscheduled'}" onclick="${isScheduled ? `openRosterFromCalendar('${roster.id}')` : ''}">
      <div class="ops-roster-header">
        <span class="ops-roster-code">${roster.code}</span>
        ${isScheduled ? 
          `<span class="ops-roster-status ${roster.status}">${roster.status}</span>` :
          `<span class="ops-roster-status unscheduled">not scheduled</span>`
        }
      </div>
      <div class="ops-roster-name">${roster.name}</div>
      <div class="ops-roster-dates">Valid: ${validStart} → ${validEnd}</div>
      ${calendarDates}
      <div class="ops-roster-stats">
        <span>📋 ${roster.entryCount} entries</span>
        <span>✓ ${roster.assignedCount} assigned</span>
        ${roster.unassignedCount > 0 ? `<span style="color: var(--accent-amber);">⚠ ${roster.unassignedCount} unassigned</span>` : ''}
      </div>
      <div class="ops-roster-actions" onclick="event.stopPropagation();">
        ${!isScheduled ? 
          `<button class="btn-schedule" onclick="showScheduleModal('${roster.id}')">+ Add to Calendar</button>` :
          roster.status === 'draft' ? 
            `<button class="btn-unschedule" onclick="unscheduleRoster('${roster.id}')">Remove</button>
             <button class="btn-publish" onclick="publishRosterFromCalendar('${roster.id}')">Publish</button>` :
          roster.status === 'published' ?
            `<button class="btn-unpublish" onclick="unpublishRosterFromCalendar('${roster.id}')">Unpublish</button>` : ''
        }
        ${isScheduled ? `<button class="btn-open" onclick="openRosterFromCalendar('${roster.id}')">Open →</button>` : ''}
      </div>
    </div>
  `;
}

function changeCalendarMonth(delta) {
  opsCalendarMonth += delta;
  if (opsCalendarMonth > 12) { opsCalendarMonth = 1; opsCalendarYear++; }
  else if (opsCalendarMonth < 1) { opsCalendarMonth = 12; opsCalendarYear--; }
  loadOpsCalendar();
}

function goToCalendarToday() {
  const today = new Date();
  opsCalendarYear = today.getFullYear();
  opsCalendarMonth = today.getMonth() + 1;
  loadOpsCalendar();
}

function openRosterFromCalendar(rosterId) {
  navigateTo('roster');
  setTimeout(() => openRoster(rosterId), 100);
}

// Schedule Modal
function showScheduleModal(rosterId) {
  selectedRosterForSchedule = allRostersData.find(r => r.id === rosterId);
  if (!selectedRosterForSchedule) return;
  
  // Set default dates to roster's valid range
  document.getElementById('scheduleStartDate').value = selectedRosterForSchedule.startDate;
  document.getElementById('scheduleEndDate').value = selectedRosterForSchedule.endDate;
  document.getElementById('scheduleStartDate').min = selectedRosterForSchedule.startDate;
  document.getElementById('scheduleStartDate').max = selectedRosterForSchedule.endDate;
  document.getElementById('scheduleEndDate').min = selectedRosterForSchedule.startDate;
  document.getElementById('scheduleEndDate').max = selectedRosterForSchedule.endDate;
  
  document.getElementById('scheduleRosterName').textContent = `${selectedRosterForSchedule.code} - ${selectedRosterForSchedule.name}`;
  document.getElementById('scheduleValidRange').textContent = `Valid range: ${selectedRosterForSchedule.startDate} to ${selectedRosterForSchedule.endDate}`;
  
  document.getElementById('scheduleModalOverlay').classList.add('show');
}

function closeScheduleModal() {
  document.getElementById('scheduleModalOverlay').classList.remove('show');
  selectedRosterForSchedule = null;
}

async function confirmScheduleRoster() {
  if (!selectedRosterForSchedule) return;
  
  const startDate = document.getElementById('scheduleStartDate').value;
  const endDate = document.getElementById('scheduleEndDate').value;
  
  if (!startDate || !endDate) {
    showToast('Please select both start and end dates', 'error');
    return;
  }
  
  if (startDate > endDate) {
    showToast('Start date cannot be after end date', 'error');
    return;
  }
  
  try {
    await apiRequest(`/roster/containers/${selectedRosterForSchedule.id}/schedule`, {
      method: 'POST',
      body: {
        calendar_start_date: startDate,
        calendar_end_date: endDate
      }
    });
    showToast('Roster added to calendar!', 'success');
    closeScheduleModal();
    loadOpsCalendar();
  } catch (err) {
    showToast(err.message || 'Failed to schedule roster', 'error');
  }
}

async function unscheduleRoster(rosterId) {
  if (!confirm('Remove this roster from the calendar?')) return;
  
  try {
    await apiRequest(`/roster/containers/${rosterId}/unschedule`, { method: 'POST' });
    showToast('Roster removed from calendar', 'success');
    loadOpsCalendar();
  } catch (err) {
    showToast(err.message || 'Failed to remove roster', 'error');
  }
}

async function publishRosterFromCalendar(rosterId) {
  if (!confirm('Publish this roster? It will become visible in Dispatch.')) return;
  
  try {
    const result = await apiRequest(`/roster/containers/${rosterId}/publish`, { method: 'POST' });
    if (result.error) {
      if (result.conflict) {
        showToast(`Conflict: ${result.conflict.driverName} on ${result.conflict.date} (${result.conflict.conflictingRoster})`, 'error');
      } else {
        showToast(result.error, 'error');
      }
      return;
    }
    showToast('Roster published!', 'success');
    loadOpsCalendar();
  } catch (err) {
    showToast(err.message || 'Failed to publish', 'error');
  }
}

async function unpublishRosterFromCalendar(rosterId) {
  const confirmMsg = 'WARNING: Unpublishing this roster will remove ALL duties from this roster from Dispatch.\n\nDrivers will no longer see these assignments until the roster is published again.\n\nContinue?';
  if (!confirm(confirmMsg)) return;
  
  try {
    await apiRequest(`/roster/containers/${rosterId}/unpublish`, { method: 'POST' });
    showToast('Roster unpublished - duties removed from dispatch', 'success');
    loadOpsCalendar();
  } catch (err) {
    showToast(err.message || 'Failed to unpublish', 'error');
  }
}

// ============================================
// ROSTER - NEW DESIGN
// ============================================
// All shift duty blocks appear in Unassigned by default
// User drags blocks from Unassigned to Drivers
// ============================================

let rostersData = [];
let currentRoster = null;
let currentRosterId = null;
let currentRosterDate = null;
let dayViewData = null; // Holds the day's blocks and assignments
let pendingAssignment = null; // For the "move connected" modal

// Gantt config
const GANTT_START_HOUR = 4;
const GANTT_END_HOUR = 24;
const GANTT_HOURS = GANTT_END_HOUR - GANTT_START_HOUR;

// ============================================
// ROSTER LIST
// ============================================

async function loadRosters() {
  const tbody = document.getElementById('rosterListTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Loading rosters...</td></tr>';
  
  try {
    const result = await apiRequest('/roster/containers');
    rostersData = result.data || [];
    renderRosterList();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderRosterList() {
  const tbody = document.getElementById('rosterListTableBody');
  const search = (document.getElementById('rosterSearchInput')?.value || '').toLowerCase();
  
  let filtered = rostersData;
  if (search) {
    filtered = rostersData.filter(r => 
      r.code?.toLowerCase().includes(search) || 
      r.name?.toLowerCase().includes(search)
    );
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No rosters found. Click "+ New Roster" to create one.</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><strong>${r.code}</strong></td>
      <td>${r.name}</td>
      <td>${formatDateShort(new Date(r.start_date))} - ${formatDateShort(new Date(r.end_date))}</td>
      <td><span class="roster-status ${r.status}">${r.status}</span></td>
      <td>${r.entry_count || 0}</td>
      <td>
        <button class="action-btn" onclick="openRoster('${r.id}')">Open</button>
        <button class="action-btn" onclick="editRosterDetails('${r.id}')">Edit</button>
        <button class="action-btn danger" onclick="deleteRoster('${r.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function filterRosters() {
  renderRosterList();
}

// ============================================
// ROSTER DETAIL VIEW
// ============================================

async function openRoster(id) {
  // Check if roster is published - block editing
  const roster = rostersData.find(r => r.id === id);
  if (roster && roster.status === 'published') {
    showToast('This roster cannot be opened for editing as it is published. Unpublish it first to make changes.', 'error');
    return;
  }
  
  try {
    document.getElementById('rosterListView').style.display = 'none';
    document.getElementById('rosterDetailView').style.display = 'flex';
    document.getElementById('rosterGantt').innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">Loading...</div>';
    
    const result = await apiRequest(`/roster/containers/${id}`);
    currentRoster = result.data;
    
    // Double-check from server response
    if (currentRoster.status === 'published') {
      showToast('This roster cannot be opened for editing as it is published. Unpublish it first to make changes.', 'error');
      backToRosterList();
      return;
    }
    
    currentRosterId = id;
    currentRosterDate = new Date(currentRoster.start_date);
    
    document.getElementById('rosterDetailTitle').textContent = `${currentRoster.code} - ${currentRoster.name}`;
    document.getElementById('rosterDetailDates').textContent = 
      `${formatDateShort(new Date(currentRoster.start_date))} to ${formatDateShort(new Date(currentRoster.end_date))}`;
    
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Failed to load roster', 'error');
    backToRosterList();
  }
}

function backToRosterList() {
  document.getElementById('rosterDetailView').style.display = 'none';
  document.getElementById('rosterListView').style.display = 'block';
  currentRoster = null;
  currentRosterId = null;
  dayViewData = null;
  loadRosters();
}

function changeRosterDay(delta) {
  if (!currentRosterDate || !currentRoster) return;
  currentRosterDate.setDate(currentRosterDate.getDate() + delta);
  
  const start = new Date(currentRoster.start_date);
  const end = new Date(currentRoster.end_date);
  if (currentRosterDate < start) currentRosterDate = new Date(start);
  if (currentRosterDate > end) currentRosterDate = new Date(end);
  
  loadDayView();
}

function goToRosterDay(dateStr) {
  if (!dateStr) return;
  currentRosterDate = new Date(dateStr);
  loadDayView();
}

async function loadDayView() {
  if (!currentRosterId || !currentRosterDate) return;
  
  const dateStr = formatDateISO(currentRosterDate);
  document.getElementById('rosterDayPicker').value = dateStr;
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  document.getElementById('rosterDayLabel').textContent = 
    `${dayNames[currentRosterDate.getDay()]}, ${formatDateShort(currentRosterDate)}`;
  
  // Check for public holiday and school holiday
  const holidayBadge = document.getElementById('rosterDayHoliday');
  const holiday = getAustralianHoliday(dateStr);
  const schoolHol = getSchoolHoliday(dateStr);
  
  if (holiday) {
    holidayBadge.textContent = holiday;
    holidayBadge.style.display = 'inline';
    holidayBadge.style.background = 'rgba(239, 68, 68, 0.15)';
    holidayBadge.style.color = 'var(--accent-red)';
  } else if (schoolHol) {
    holidayBadge.textContent = schoolHol;
    holidayBadge.style.display = 'inline';
    holidayBadge.style.background = 'rgba(139, 92, 246, 0.15)';
    holidayBadge.style.color = '#8b5cf6';
  } else {
    holidayBadge.style.display = 'none';
  }
  
  try {
    const result = await apiRequest(`/roster/day/${currentRosterId}/${dateStr}`);
    dayViewData = result.data;
    renderGantt();
  } catch (err) {
    document.getElementById('rosterGantt').innerHTML = 
      `<div style="padding: 40px; text-align: center; color: var(--accent-red);">Error: ${err.message}</div>`;
  }
}

function getAustralianHoliday(dateStr) {
  // Australian public holidays (QLD focused)
  const holidays = {
    // 2025
    '2025-01-01': "New Year's Day",
    '2025-01-27': "Australia Day",
    '2025-04-18': "Good Friday",
    '2025-04-19': "Easter Saturday",
    '2025-04-21': "Easter Monday",
    '2025-04-25': "ANZAC Day",
    '2025-05-05': "Labour Day (QLD)",
    '2025-06-09': "King's Birthday (QLD)",
    '2025-08-13': "Royal Queensland Show (Brisbane)",
    '2025-12-25': "Christmas Day",
    '2025-12-26': "Boxing Day",
    // 2026
    '2026-01-01': "New Year's Day",
    '2026-01-26': "Australia Day",
    '2026-04-03': "Good Friday",
    '2026-04-04': "Easter Saturday",
    '2026-04-06': "Easter Monday",
    '2026-04-25': "ANZAC Day",
    '2026-05-04': "Labour Day (QLD)",
    '2026-06-08': "King's Birthday (QLD)",
    '2026-08-12': "Royal Queensland Show (Brisbane)",
    '2026-12-25': "Christmas Day",
    '2026-12-26': "Boxing Day",
    '2026-12-28': "Boxing Day (Observed)",
    // 2027
    '2027-01-01': "New Year's Day",
    '2027-01-26': "Australia Day",
    '2027-03-26': "Good Friday",
    '2027-03-27': "Easter Saturday",
    '2027-03-29': "Easter Monday",
    '2027-04-26': "ANZAC Day (Observed)",
    '2027-05-03': "Labour Day (QLD)",
    '2027-06-14': "King's Birthday (QLD)",
    '2027-12-25': "Christmas Day",
    '2027-12-27': "Christmas Day (Observed)",
    '2027-12-26': "Boxing Day",
    '2027-12-28': "Boxing Day (Observed)",
  };
  return holidays[dateStr] || null;
}

function getSchoolHoliday(dateStr) {
  // QLD School Holidays 2025-2028
  const schoolHolidays = [
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
  
  for (const holiday of schoolHolidays) {
    if (dateStr >= holiday.start && dateStr <= holiday.end) {
      return holiday.name;
    }
  }
  return null;
}

// ============================================
// GANTT RENDERING
// ============================================

function renderGantt() {
  const container = document.getElementById('rosterGantt');
  if (!dayViewData) {
    container.innerHTML = '<div style="padding: 40px; text-align: center;">No data</div>';
    return;
  }
  
  const { drivers, unassigned, by_driver } = dayViewData;
  
  // Stats
  const totalBlocks = unassigned.length + Object.values(by_driver).flat().length;
  const assignedBlocks = Object.values(by_driver).flat().length;
  document.getElementById('rosterDayStats').textContent = 
    `${assignedBlocks} of ${totalBlocks} blocks assigned | ${drivers.length} drivers`;
  
  // Header
  let html = '<div class="roster-gantt-header">';
  html += '<div class="roster-gantt-driver-col">Driver</div>';
  html += '<div class="roster-gantt-timeline">';
  for (let h = GANTT_START_HOUR; h < GANTT_END_HOUR; h++) {
    html += `<div class="roster-gantt-hour">${h.toString().padStart(2, '0')}:00</div>`;
  }
  html += '</div></div>';
  
  // Driver rows
  for (const driver of drivers) {
    const driverBlocks = by_driver[driver.id] || [];
    html += renderGanttRow(driver, driverBlocks);
  }
  
  // Unassigned section - group by shift
  const unassignedByShift = {};
  for (const block of unassigned) {
    const shiftId = block.shift_template_id;
    if (!unassignedByShift[shiftId]) {
      unassignedByShift[shiftId] = {
        shift_code: block.shift_code,
        shift_name: block.shift_name,
        blocks: []
      };
    }
    unassignedByShift[shiftId].blocks.push(block);
  }
  
  // Unassigned header with toggle buttons
  const includedCount = unassigned.filter(b => b.include_in_dispatch === 1).length;
  const omittedCount = unassigned.filter(b => b.include_in_dispatch !== 1).length;
  
  html += `<div class="unassigned-header">`;
  html += `<div class="unassigned-header-title">`;
  html += `UNASSIGNED`;
  html += `<span class="unassigned-header-stats">`;
  html += `<span class="included">✓ ${includedCount} in dispatch</span>`;
  html += ` / <span class="omitted">${omittedCount} omitted</span>`;
  html += `</span>`;
  html += `</div>`;
  html += `<div class="unassigned-header-actions">`;
  html += `<div class="toggle-group">`;
  html += `<span class="toggle-group-label">This Day:</span>`;
  html += `<button class="btn-toggle-include" onclick="toggleDayDispatch(true)" title="Include all unassigned for this day in dispatch">✓ Include All</button>`;
  html += `<button class="btn-toggle-omit" onclick="toggleDayDispatch(false)" title="Omit all unassigned for this day from dispatch">✗ Omit All</button>`;
  html += `</div>`;
  html += `<div class="toggle-group">`;
  html += `<span class="toggle-group-label">Entire Roster:</span>`;
  html += `<button class="btn-toggle-include" onclick="toggleRosterDispatch(true)" title="Include all unassigned for entire roster period">✓ Include All</button>`;
  html += `<button class="btn-toggle-omit" onclick="toggleRosterDispatch(false)" title="Omit all unassigned for entire roster">✗ Omit All</button>`;
  html += `</div>`;
  html += `</div>`;
  html += `</div>`;
  
  // Render each shift as its own unassigned row
  for (const shiftId of Object.keys(unassignedByShift)) {
    const shift = unassignedByShift[shiftId];
    html += renderUnassignedShiftRow(shift.shift_code, shift.blocks);
  }
  
  // If no unassigned, show empty drop zone
  if (Object.keys(unassignedByShift).length === 0) {
    html += renderEmptyUnassignedRow();
  }
  
  container.innerHTML = html;
  setupDragDrop();
}

function renderEmptyUnassignedRow() {
  let html = `<div class="roster-gantt-row unassigned-row" data-driver-id="">`;
  html += `<div class="roster-gantt-driver" style="background: var(--bg-tertiary);">`;
  html += `<div class="roster-gantt-driver-name" style="color: var(--text-muted);">Unassigned</div>`;
  html += `<div class="roster-gantt-driver-id">Drop here</div>`;
  html += `</div>`;
  html += `<div class="roster-gantt-blocks" data-driver-id="">`;
  for (let h = 0; h < GANTT_HOURS; h++) {
    html += `<div class="roster-gantt-grid-line" style="left: ${(h / GANTT_HOURS) * 100}%;"></div>`;
  }
  html += `</div></div>`;
  return html;
}

function renderUnassignedShiftRow(shiftCode, blocks) {
  let html = `<div class="roster-gantt-row unassigned-row" data-driver-id="">`;
  html += `<div class="roster-gantt-driver" style="background: var(--bg-tertiary);">`;
  html += `<div class="roster-gantt-driver-name" style="color: var(--text-muted);">${shiftCode}</div>`;
  html += `<div class="roster-gantt-driver-id" style="color: var(--text-muted);">${blocks.length} block${blocks.length !== 1 ? 's' : ''}</div>`;
  html += `</div>`;
  
  html += `<div class="roster-gantt-blocks" data-driver-id="">`;
  
  // Grid lines
  for (let h = 0; h < GANTT_HOURS; h++) {
    html += `<div class="roster-gantt-grid-line" style="left: ${(h / GANTT_HOURS) * 100}%;"></div>`;
  }
  
  // Blocks
  for (const block of blocks) {
    const startPct = ((block.start_time - GANTT_START_HOUR) / GANTT_HOURS) * 100;
    const widthPct = ((block.end_time - block.start_time) / GANTT_HOURS) * 100;
    if (startPct < 0 || startPct >= 100) continue;
    
    const color = getShiftColor(block.shift_type);
    const hasMultiple = block.blocks_in_shift > 1;
    const hasDefault = block.default_driver_id && !block.assigned_driver_id;
    const isIncluded = block.include_in_dispatch === 1;
    
    html += `<div class="roster-gantt-block" 
      style="left: ${Math.max(0, startPct)}%; width: ${Math.min(widthPct, 100 - startPct)}%; background: ${color};"
      draggable="true"
      data-block-id="${block.id}"
      data-shift-id="${block.shift_template_id}"
      data-entry-id="${block.entry_id || ''}"
      data-has-multiple="${hasMultiple}"
      ondragstart="onBlockDragStart(event)"
      onclick="showBlockInfo('${block.id}')"
    >`;
    
    // Dispatch toggle button
    const toggleClass = isIncluded ? 'included' : 'omitted';
    const toggleIcon = isIncluded ? '✓' : '○';
    const toggleTitle = isIncluded ? 'Included in dispatch - click to omit' : 'Omitted from dispatch - click to include';
    html += `<button class="dispatch-toggle-btn ${toggleClass}" 
      onclick="event.stopPropagation(); toggleBlockDispatch('${block.id}', '${block.shift_template_id}', ${!isIncluded})" 
      title="${toggleTitle}">${toggleIcon}</button>`;
    
    html += `<div class="roster-gantt-block-name">${block.shift_code} / ${block.block_name}</div>`;
    html += `<div class="roster-gantt-block-time">${formatDecimalTime(block.start_time)} - ${formatDecimalTime(block.end_time)}</div>`;
    
    if (hasDefault) {
      html += `<button class="quick-assign-btn" onclick="event.stopPropagation(); quickAssign('${block.id}', '${block.shift_template_id}', '${block.default_driver_id}')" title="Assign to ${block.default_driver_name}">⚡</button>`;
    }
    
    html += `</div>`;
  }
  
  html += `</div></div>`;
  return html;
}

function renderGanttRow(driver, blocks) {
  const driverId = driver.id;
  const driverName = `${driver.first_name} ${driver.last_name}`;
  const driverNumber = driver.employee_number;
  
  let html = `<div class="roster-gantt-row" data-driver-id="${driverId}">`;
  html += `<div class="roster-gantt-driver">`;
  html += `<div class="roster-gantt-driver-name">${driverName}</div>`;
  html += `<div class="roster-gantt-driver-id">${driverNumber}</div>`;
  html += `</div>`;
  
  html += `<div class="roster-gantt-blocks" data-driver-id="${driverId}">`;
  
  // Grid lines
  for (let h = 0; h < GANTT_HOURS; h++) {
    html += `<div class="roster-gantt-grid-line" style="left: ${(h / GANTT_HOURS) * 100}%;"></div>`;
  }
  
  // Blocks
  for (const block of blocks) {
    const startPct = ((block.start_time - GANTT_START_HOUR) / GANTT_HOURS) * 100;
    const widthPct = ((block.end_time - block.start_time) / GANTT_HOURS) * 100;
    if (startPct < 0 || startPct >= 100) continue;
    
    const color = getShiftColor(block.shift_type);
    const hasMultiple = block.blocks_in_shift > 1;
    
    html += `<div class="roster-gantt-block" 
      style="left: ${Math.max(0, startPct)}%; width: ${Math.min(widthPct, 100 - startPct)}%; background: ${color};"
      draggable="true"
      data-block-id="${block.id}"
      data-shift-id="${block.shift_template_id}"
      data-entry-id="${block.entry_id || ''}"
      data-has-multiple="${hasMultiple}"
      ondragstart="onBlockDragStart(event)"
      onclick="showBlockInfo('${block.id}')"
    >`;
    html += `<div class="roster-gantt-block-name">${block.shift_code} / ${block.block_name}</div>`;
    html += `<div class="roster-gantt-block-time">${formatDecimalTime(block.start_time)} - ${formatDecimalTime(block.end_time)}</div>`;
    html += `</div>`;
  }
  
  html += `</div></div>`;
  return html;
}

function getShiftColor(shiftType) {
  const colors = {
    regular: '#3b82f6',
    charter: '#a855f7',
    school: '#22c55e',
  };
  return colors[shiftType] || '#3b82f6';
}

// ============================================
// DRAG & DROP
// ============================================

function setupDragDrop() {
  document.querySelectorAll('.roster-gantt-blocks').forEach(container => {
    container.addEventListener('dragover', e => {
      e.preventDefault();
      container.classList.add('drag-over');
    });
    
    container.addEventListener('dragleave', () => {
      container.classList.remove('drag-over');
    });
    
    container.addEventListener('drop', async e => {
      e.preventDefault();
      container.classList.remove('drag-over');
      
      const blockId = e.dataTransfer.getData('blockId');
      const shiftId = e.dataTransfer.getData('shiftId');
      const hasMultiple = e.dataTransfer.getData('hasMultiple') === 'true';
      const newDriverId = container.dataset.driverId || null;
      
      if (hasMultiple && newDriverId) {
        // Show modal asking about connected blocks
        pendingAssignment = { blockId, shiftId, driverId: newDriverId };
        showConnectedModal();
      } else {
        // Direct assign
        await doAssign(blockId, shiftId, newDriverId, false);
      }
    });
  });
}

function onBlockDragStart(e) {
  const target = e.target.closest('.roster-gantt-block');
  e.dataTransfer.setData('blockId', target.dataset.blockId);
  e.dataTransfer.setData('shiftId', target.dataset.shiftId);
  e.dataTransfer.setData('hasMultiple', target.dataset.hasMultiple);
  target.classList.add('dragging');
  setTimeout(() => target.classList.remove('dragging'), 100);
}

// ============================================
// ASSIGNMENT API
// ============================================

async function doAssign(blockId, shiftId, driverId, includeConnected) {
  try {
    const result = await apiRequest('/roster/assign', {
      method: 'POST',
      body: {
        roster_id: currentRosterId,
        shift_template_id: shiftId,
        duty_block_id: blockId,
        date: formatDateISO(currentRosterDate),
        driver_id: driverId,
        include_connected: includeConnected,
      }
    });
    
    // Check if API returned an error
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    showToast(driverId ? 'Block assigned' : 'Block unassigned');
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Assignment failed', 'error');
  }
}

async function quickAssign(blockId, shiftId, defaultDriverId) {
  // Find the block to check if it has multiple
  let hasMultiple = false;
  if (dayViewData) {
    const allBlocks = [...dayViewData.unassigned, ...Object.values(dayViewData.by_driver).flat()];
    const block = allBlocks.find(b => b.id === blockId);
    hasMultiple = block?.blocks_in_shift > 1;
  }
  
  if (hasMultiple) {
    pendingAssignment = { blockId, shiftId, driverId: defaultDriverId };
    showConnectedModal();
  } else {
    await doAssign(blockId, shiftId, defaultDriverId, false);
  }
}

// ============================================
// DISPATCH TOGGLE FUNCTIONS
// ============================================

async function toggleBlockDispatch(blockId, shiftId, include) {
  try {
    const result = await apiRequest('/roster/toggle-dispatch', {
      method: 'POST',
      body: {
        roster_id: currentRosterId,
        duty_block_id: blockId,
        shift_template_id: shiftId,
        date: formatDateISO(currentRosterDate),
        include: include
      }
    });
    
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    showToast(include ? 'Block included in dispatch' : 'Block omitted from dispatch');
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Toggle failed', 'error');
  }
}

async function toggleDayDispatch(include) {
  try {
    const result = await apiRequest('/roster/toggle-dispatch-day', {
      method: 'POST',
      body: {
        roster_id: currentRosterId,
        date: formatDateISO(currentRosterDate),
        include: include
      }
    });
    
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    showToast(result.message || (include ? 'All included' : 'All omitted'));
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Toggle failed', 'error');
  }
}

async function toggleRosterDispatch(include) {
  if (!confirm(`This will ${include ? 'include' : 'omit'} ALL unassigned blocks for the ENTIRE roster period. Continue?`)) {
    return;
  }
  
  try {
    showToast('Processing...', 'info');
    
    const result = await apiRequest('/roster/toggle-dispatch-all', {
      method: 'POST',
      body: {
        roster_id: currentRosterId,
        include: include
      }
    });
    
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    showToast(result.message || (include ? 'All included' : 'All omitted'), 'success');
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Toggle failed', 'error');
  }
}

function showBlockInfo(blockId) {
  if (!dayViewData) return;
  const allBlocks = [...dayViewData.unassigned, ...Object.values(dayViewData.by_driver).flat()];
  const block = allBlocks.find(b => b.id === blockId);
  if (block) {
    showToast(`${block.shift_code} / ${block.block_name}: ${formatDecimalTime(block.start_time)} - ${formatDecimalTime(block.end_time)}`);
  }
}

// ============================================
// CONNECTED BLOCKS MODAL
// ============================================

function showConnectedModal() {
  document.getElementById('connectedModalOverlay').classList.add('show');
}

function closeConnectedModal() {
  document.getElementById('connectedModalOverlay').classList.remove('show');
  pendingAssignment = null;
}

async function confirmConnected(includeAll) {
  if (!pendingAssignment) return;
  const { blockId, shiftId, driverId } = pendingAssignment;
  closeConnectedModal();
  await doAssign(blockId, shiftId, driverId, includeAll);
}

// ============================================
// ROSTER CRUD MODALS
// ============================================

let editingRosterId = null;

function showAddRosterModal() {
  document.getElementById('rosterModalTitle').textContent = 'New Roster';
  document.getElementById('rosterForm').reset();
  
  const today = new Date();
  const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  
  document.getElementById('rosterStartDate').value = formatDateISO(nextMonday);
  document.getElementById('rosterEndDate').value = formatDateISO(nextSunday);
  
  editingRosterId = null;
  document.getElementById('rosterModalOverlay').classList.add('show');
}

function editRosterDetails(id) {
  const roster = rostersData.find(r => r.id === id);
  if (!roster) return;
  
  // Block editing if roster is published
  if (roster.status === 'published') {
    showToast('This roster cannot be edited as it is published to the Ops calendar. Unpublish the roster to make changes.', 'error');
    return;
  }
  
  document.getElementById('rosterModalTitle').textContent = 'Edit Roster';
  document.getElementById('rosterCode').value = roster.code;
  document.getElementById('rosterName').value = roster.name;
  document.getElementById('rosterStartDate').value = roster.start_date;
  document.getElementById('rosterEndDate').value = roster.end_date;
  document.getElementById('rosterStatus').value = roster.status || 'draft';
  document.getElementById('rosterNotes').value = roster.notes || '';
  
  editingRosterId = id;
  document.getElementById('rosterModalOverlay').classList.add('show');
}

function closeRosterModal() {
  document.getElementById('rosterModalOverlay').classList.remove('show');
  editingRosterId = null;
}

async function saveRoster() {
  const data = {
    code: document.getElementById('rosterCode').value,
    name: document.getElementById('rosterName').value,
    start_date: document.getElementById('rosterStartDate').value,
    end_date: document.getElementById('rosterEndDate').value,
    status: document.getElementById('rosterStatus').value,
    notes: document.getElementById('rosterNotes').value || null,
  };
  
  if (!data.code || !data.name || !data.start_date || !data.end_date) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  
  try {
    if (editingRosterId) {
      await apiRequest(`/roster/containers/${editingRosterId}`, { method: 'PUT', body: data });
      showToast('Roster updated');
    } else {
      await apiRequest('/roster/containers', { method: 'POST', body: data });
      showToast('Roster created');
    }
    closeRosterModal();
    loadRosters();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

async function deleteRoster(id) {
  if (!confirm('Delete this roster and all assignments?')) return;
  try {
    await apiRequest(`/roster/containers/${id}`, { method: 'DELETE' });
    showToast('Roster deleted');
    loadRosters();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// Legacy aliases
async function loadRoster() { await loadRosters(); }
function renderRosterTable() { renderRosterList(); }
function showAddRosterEntryModal() { showAddRosterModal(); }

