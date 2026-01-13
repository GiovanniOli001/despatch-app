/**
 * Dispatch App - Main Application
 */

import { api } from './api.js';

// ============================================
// STATE
// ============================================

const state = {
  currentScreen: 'dispatch',
  currentDate: new Date(),
  sidebarCollapsed: false,
  
  // Data caches
  dispatch: null,
  employees: [],
  vehicles: [],
  shiftTemplates: [],
  dutyTypes: [],
  payTypes: [],
  
  // Selection state
  selectedItem: null,
  
  // Loading states
  loading: {
    dispatch: false,
    employees: false,
    vehicles: false,
  },
};

// ============================================
// UTILITIES
// ============================================

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(decimalHours) {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + minutes / 60;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  
  toast.className = `toast show ${type}`;
  toastMessage.textContent = message;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

// ============================================
// NAVIGATION
// ============================================

function navigateTo(screen) {
  // Update nav items
  $$('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screen);
  });
  
  // Update screens
  $$('.screen').forEach(s => {
    s.classList.toggle('active', s.id === `screen-${screen}`);
  });
  
  state.currentScreen = screen;
  
  // Load screen data
  loadScreenData(screen);
}

async function loadScreenData(screen) {
  switch (screen) {
    case 'dispatch':
      await loadDispatch();
      break;
    case 'hrm':
      await loadEmployees();
      break;
    case 'vehicles':
      await loadVehicles();
      break;
    case 'shifts':
      await loadShiftTemplates();
      break;
    case 'roster':
      await loadRosterWeek();
      break;
  }
}

// ============================================
// DATE NAVIGATION
// ============================================

function updateDateDisplay() {
  $('#currentDate').textContent = formatDisplayDate(state.currentDate);
}

function prevDate() {
  state.currentDate.setDate(state.currentDate.getDate() - 1);
  updateDateDisplay();
  if (state.currentScreen === 'dispatch') {
    loadDispatch();
  }
}

function nextDate() {
  state.currentDate.setDate(state.currentDate.getDate() + 1);
  updateDateDisplay();
  if (state.currentScreen === 'dispatch') {
    loadDispatch();
  }
}

// ============================================
// SIDEBAR
// ============================================

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  document.body.classList.toggle('nav-collapsed', state.sidebarCollapsed);
  $('#navSidebar').classList.toggle('collapsed', state.sidebarCollapsed);
}

// ============================================
// DATA LOADING
// ============================================

async function loadConfig() {
  try {
    const [dutyTypes, payTypes] = await Promise.all([
      api.getDutyTypes(),
      api.getPayTypes(),
    ]);
    
    state.dutyTypes = dutyTypes.data || [];
    state.payTypes = payTypes.data || [];
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

async function loadDispatch() {
  const container = $('#screen-dispatch');
  state.loading.dispatch = true;
  
  container.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading dispatch for ${formatDisplayDate(state.currentDate)}...</div>
    </div>
  `;
  
  try {
    const date = formatDate(state.currentDate);
    const result = await api.getDispatchDay(date);
    state.dispatch = result.data;
    renderDispatch();
  } catch (err) {
    console.error('Failed to load dispatch:', err);
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>Failed to load dispatch</h2>
        <p>${err.message}</p>
        <button class="btn btn-primary mt-4" onclick="window.app.loadDispatch()">Retry</button>
      </div>
    `;
  } finally {
    state.loading.dispatch = false;
  }
}

async function loadEmployees() {
  const container = $('#screen-hrm');
  state.loading.employees = true;
  
  container.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading employees...</div>
    </div>
  `;
  
  try {
    const result = await api.getEmployees();
    state.employees = result.data || [];
    renderEmployees();
  } catch (err) {
    console.error('Failed to load employees:', err);
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>Failed to load employees</h2>
        <p>${err.message}</p>
        <button class="btn btn-primary mt-4" onclick="window.app.loadEmployees()">Retry</button>
      </div>
    `;
  } finally {
    state.loading.employees = false;
  }
}

async function loadVehicles() {
  const container = $('#screen-vehicles');
  state.loading.vehicles = true;
  
  container.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading vehicles...</div>
    </div>
  `;
  
  try {
    const result = await api.getVehicles();
    state.vehicles = result.data || [];
    renderVehicles();
  } catch (err) {
    console.error('Failed to load vehicles:', err);
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>Failed to load vehicles</h2>
        <p>${err.message}</p>
      </div>
    `;
  } finally {
    state.loading.vehicles = false;
  }
}

async function loadShiftTemplates() {
  const container = $('#screen-shifts');
  
  container.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading shift templates...</div>
    </div>
  `;
  
  try {
    const result = await api.getShiftTemplates();
    state.shiftTemplates = result.data || [];
    renderShiftTemplates();
  } catch (err) {
    console.error('Failed to load shift templates:', err);
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>Failed to load shift templates</h2>
        <p>${err.message}</p>
      </div>
    `;
  }
}

async function loadRosterWeek() {
  const container = $('#screen-roster');
  
  container.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading roster...</div>
    </div>
  `;
  
  try {
    const result = await api.getRosterWeek(formatDate(state.currentDate));
    renderRoster(result.data);
  } catch (err) {
    console.error('Failed to load roster:', err);
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>Failed to load roster</h2>
        <p>${err.message}</p>
      </div>
    `;
  }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderDispatch() {
  const container = $('#screen-dispatch');
  const data = state.dispatch;
  
  if (!data) {
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>No dispatch data</h2>
        <p>No data available for this date.</p>
      </div>
    `;
    return;
  }
  
  const { stats, drivers, vehicles, unassigned } = data;
  
  container.innerHTML = `
    <div class="dispatch-header">
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-value">${stats.drivers_available}</span>
          <span class="stat-label">Available</span>
        </div>
        <div class="stat">
          <span class="stat-value">${stats.drivers_working}</span>
          <span class="stat-label">Working</span>
        </div>
        <div class="stat">
          <span class="stat-value text-warning">${stats.drivers_leave}</span>
          <span class="stat-label">Leave</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat">
          <span class="stat-value">${stats.vehicles_available}</span>
          <span class="stat-label">Vehicles</span>
        </div>
        <div class="stat">
          <span class="stat-value">${stats.vehicles_in_use}</span>
          <span class="stat-label">In Use</span>
        </div>
        <div class="stat">
          <span class="stat-value text-error">${stats.vehicles_maintenance}</span>
          <span class="stat-label">Maint.</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat">
          <span class="stat-value ${stats.unassigned_count > 0 ? 'text-error' : 'text-success'}">${stats.unassigned_count}</span>
          <span class="stat-label">Unassigned</span>
        </div>
      </div>
    </div>
    
    <div class="dispatch-content">
      <div class="dispatch-section">
        <div class="section-header">
          <h3>Drivers (${drivers.filter(d => d.shifts.length > 0).length})</h3>
        </div>
        <div class="section-body">
          ${drivers.filter(d => d.shifts.length > 0 || d.daily_status !== 'available').map(d => renderDriverRow(d)).join('')}
          ${drivers.filter(d => d.shifts.length > 0).length === 0 ? '<div class="empty-message">No drivers assigned</div>' : ''}
        </div>
      </div>
      
      <div class="dispatch-section">
        <div class="section-header">
          <h3>Unassigned Jobs (${unassigned.length})</h3>
        </div>
        <div class="section-body">
          ${unassigned.map(j => renderUnassignedRow(j)).join('')}
          ${unassigned.length === 0 ? '<div class="empty-message">All jobs assigned ✓</div>' : ''}
        </div>
      </div>
    </div>
  `;
}

function renderDriverRow(driver) {
  const statusClass = driver.daily_status === 'leave' ? 'badge-warning' : 
                      driver.daily_status === 'sick' ? 'badge-error' : '';
  
  return `
    <div class="resource-row" data-driver-id="${driver.id}">
      <div class="resource-info">
        <span class="resource-id font-mono">${driver.employee_number}</span>
        <span class="resource-name">${driver.last_name}, ${driver.first_name}</span>
        ${statusClass ? `<span class="badge ${statusClass}">${driver.daily_status}</span>` : ''}
      </div>
      <div class="resource-timeline">
        ${driver.shifts.map(s => renderShiftBlock(s)).join('')}
      </div>
    </div>
  `;
}

function renderShiftBlock(shift) {
  const startPct = ((shift.start_time - 5) / 19) * 100; // 5am to midnight
  const widthPct = ((shift.end_time - shift.start_time) / 19) * 100;
  
  return `
    <div class="shift-block" style="left: ${startPct}%; width: ${widthPct}%;" 
         title="${shift.name}: ${formatTime(shift.start_time)} - ${formatTime(shift.end_time)}">
      <span class="shift-name">${shift.name}</span>
    </div>
  `;
}

function renderUnassignedRow(job) {
  return `
    <div class="job-row" data-job-id="${job.id}">
      <div class="job-info">
        <span class="job-name">${job.name}</span>
        <span class="job-time font-mono">${formatTime(job.start_time)} - ${formatTime(job.end_time)}</span>
        ${job.customer_name ? `<span class="job-customer">${job.customer_name}</span>` : ''}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="window.app.assignJob('${job.id}')">Assign</button>
    </div>
  `;
}

function renderEmployees() {
  const container = $('#screen-hrm');
  const employees = state.employees;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Employees</h2>
      <button class="btn btn-primary" onclick="window.app.showAddEmployee()">+ Add Employee</button>
    </div>
    
    <div class="screen-content">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Licence</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${employees.map(e => `
              <tr>
                <td class="font-mono">${e.employee_number}</td>
                <td>${e.first_name} ${e.last_name}</td>
                <td>${e.phone || '-'}</td>
                <td class="font-mono">${e.licence_number || '-'}</td>
                <td><span class="badge badge-info">${e.role}</span></td>
                <td><span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-warning'}">${e.status}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="window.app.editEmployee('${e.id}')">Edit</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderVehicles() {
  const container = $('#screen-vehicles');
  const vehicles = state.vehicles;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Vehicles</h2>
      <button class="btn btn-primary" onclick="window.app.showAddVehicle()">+ Add Vehicle</button>
    </div>
    
    <div class="screen-content">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Fleet #</th>
              <th>Rego</th>
              <th>Capacity</th>
              <th>Make/Model</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${vehicles.map(v => `
              <tr>
                <td class="font-mono">${v.fleet_number}</td>
                <td class="font-mono">${v.rego}</td>
                <td>${v.capacity}</td>
                <td>${v.make || ''} ${v.model || ''}</td>
                <td><span class="badge ${v.status === 'active' ? 'badge-success' : 'badge-warning'}">${v.status}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="window.app.editVehicle('${v.id}')">Edit</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderShiftTemplates() {
  const container = $('#screen-shifts');
  const templates = state.shiftTemplates;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Shift Templates</h2>
      <button class="btn btn-primary" onclick="window.app.showAddShiftTemplate()">+ Add Template</button>
    </div>
    
    <div class="screen-content">
      ${templates.length === 0 ? `
        <div class="empty-state">
          <p>No shift templates yet.</p>
          <p class="text-muted">Create templates to define reusable shift patterns.</p>
        </div>
      ` : `
        <div class="template-grid">
          ${templates.map(t => `
            <div class="card template-card">
              <div class="card-header">
                <span class="card-title">${t.name}</span>
                <span class="badge badge-info">${t.code}</span>
              </div>
              <div class="template-times font-mono">
                ${formatTime(t.default_start)} - ${formatTime(t.default_end)}
              </div>
              <div class="template-type">${t.shift_type}</div>
              <div class="card-actions">
                <button class="btn btn-secondary btn-sm" onclick="window.app.editShiftTemplate('${t.id}')">Edit</button>
                <button class="btn btn-secondary btn-sm" onclick="window.app.duplicateShiftTemplate('${t.id}')">Duplicate</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function renderRoster(data) {
  const container = $('#screen-roster');
  
  if (!data) {
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>No roster data</h2>
      </div>
    `;
    return;
  }
  
  const { week_start, week_end, days } = data;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Roster</h2>
      <div class="roster-nav">
        <button class="btn btn-secondary" onclick="window.app.prevRosterWeek()">◀ Prev Week</button>
        <span class="week-range">${week_start} to ${week_end}</span>
        <button class="btn btn-secondary" onclick="window.app.nextRosterWeek()">Next Week ▶</button>
      </div>
      <button class="btn btn-primary" onclick="window.app.showCopyWeek()">Copy Week</button>
    </div>
    
    <div class="roster-week">
      ${Object.entries(days).map(([date, entries], i) => `
        <div class="roster-day">
          <div class="day-header">
            <span class="day-name">${dayNames[i]}</span>
            <span class="day-date">${date.split('-')[2]}</span>
            <span class="day-count">${entries.length} shifts</span>
          </div>
          <div class="day-entries">
            ${entries.map(e => `
              <div class="roster-entry ${e.driver_id ? 'assigned' : 'unassigned'}">
                <div class="entry-name">${e.name}</div>
                <div class="entry-time font-mono">${formatTime(e.start_time)}-${formatTime(e.end_time)}</div>
                <div class="entry-driver">${e.driver_name || 'Unassigned'}</div>
              </div>
            `).join('')}
            ${entries.length === 0 ? '<div class="empty-day">No shifts</div>' : ''}
          </div>
          <button class="btn btn-secondary btn-sm add-shift-btn" onclick="window.app.addShiftToDay('${date}')">+ Add</button>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================
// MODAL PLACEHOLDERS
// ============================================

function showAddEmployee() {
  showToast('Employee form coming soon', 'info');
}

function showAddVehicle() {
  showToast('Vehicle form coming soon', 'info');
}

function showAddShiftTemplate() {
  showToast('Shift template form coming soon', 'info');
}

function editEmployee(id) {
  showToast(`Edit employee ${id}`, 'info');
}

function editVehicle(id) {
  showToast(`Edit vehicle ${id}`, 'info');
}

function editShiftTemplate(id) {
  showToast(`Edit template ${id}`, 'info');
}

function duplicateShiftTemplate(id) {
  showToast(`Duplicate template ${id}`, 'info');
}

function assignJob(id) {
  showToast(`Assign job ${id}`, 'info');
}

function addShiftToDay(date) {
  showToast(`Add shift to ${date}`, 'info');
}

function showCopyWeek() {
  showToast('Copy week dialog coming soon', 'info');
}

function prevRosterWeek() {
  state.currentDate.setDate(state.currentDate.getDate() - 7);
  loadRosterWeek();
}

function nextRosterWeek() {
  state.currentDate.setDate(state.currentDate.getDate() + 7);
  loadRosterWeek();
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  // Set up event listeners
  $('#menuToggle').addEventListener('click', toggleSidebar);
  $('#hideSidebar').addEventListener('click', toggleSidebar);
  $('#prevDate').addEventListener('click', prevDate);
  $('#nextDate').addEventListener('click', nextDate);
  
  // Navigation
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.screen);
    });
  });
  
  // Initialize date display
  updateDateDisplay();
  
  // Load config
  await loadConfig();
  
  // Check API health
  try {
    const health = await api.health();
    console.log('API connected:', health);
    $('#connectionStatus').classList.remove('offline');
  } catch (err) {
    console.error('API connection failed:', err);
    $('#connectionStatus').classList.add('offline');
    showToast('API connection failed - running in offline mode', 'error');
  }
  
  // Load initial screen
  loadScreenData(state.currentScreen);
}

// ============================================
// EXPORT FOR HTML
// ============================================

window.app = {
  loadDispatch,
  loadEmployees,
  showAddEmployee,
  showAddVehicle,
  showAddShiftTemplate,
  editEmployee,
  editVehicle,
  editShiftTemplate,
  duplicateShiftTemplate,
  assignJob,
  addShiftToDay,
  showCopyWeek,
  prevRosterWeek,
  nextRosterWeek,
};

// Start app
document.addEventListener('DOMContentLoaded', init);
