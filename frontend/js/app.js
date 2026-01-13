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
  rosterData: null,
  
  // Filters
  employeeFilters: { search: '', role: '', status: '' },
  vehicleFilters: { search: '', status: '' },
  templateFilters: { search: '', type: '' },
  
  // Editing state
  editingEmployee: null,
  editingVehicle: null,
  editingTemplate: null,
  editingDuty: null,
  editingRosterEntry: null,
  
  // Roster date
  rosterDate: new Date(),
  
  // Loading states
  loading: {},
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
  if (decimalHours === null || decimalHours === undefined) return '--:--';
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + minutes / 60;
}

function formatDuration(hours) {
  if (!hours) return '';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  toast.className = `toast show ${type}`;
  toastMessage.textContent = message;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

// ============================================
// MODAL MANAGEMENT
// ============================================

function showModal(title, bodyHtml, footerHtml, size = '') {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFooter').innerHTML = footerHtml;
  $('#modal').className = `modal ${size}`;
  $('#modalOverlay').classList.add('active');
}

function closeModal() {
  $('#modalOverlay').classList.remove('active');
  state.editingEmployee = null;
  state.editingVehicle = null;
  state.editingTemplate = null;
  state.editingDuty = null;
  state.editingRosterEntry = null;
}

function showDeleteModal(message, onConfirm) {
  $('#deleteModalBody').innerHTML = `<p>${message}</p>`;
  $('#confirmDeleteBtn').onclick = onConfirm;
  $('#deleteModalOverlay').classList.add('active');
}

function closeDeleteModal() {
  $('#deleteModalOverlay').classList.remove('active');
}

// ============================================
// NAVIGATION
// ============================================

function navigateTo(screen) {
  $$('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screen);
  });
  $$('.screen').forEach(s => {
    s.classList.toggle('active', s.id === `screen-${screen}`);
  });
  state.currentScreen = screen;
  loadScreenData(screen);
}

async function loadScreenData(screen) {
  switch (screen) {
    case 'dispatch': await loadDispatch(); break;
    case 'hrm': await loadEmployees(); break;
    case 'vehicles': await loadVehicles(); break;
    case 'shifts': await loadShiftTemplates(); break;
    case 'roster': await loadRoster(); break;
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
  if (state.currentScreen === 'dispatch') loadDispatch();
}

function nextDate() {
  state.currentDate.setDate(state.currentDate.getDate() + 1);
  updateDateDisplay();
  if (state.currentScreen === 'dispatch') loadDispatch();
}

// ============================================
// SIDEBAR
// ============================================

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  document.body.classList.toggle('nav-collapsed', state.sidebarCollapsed);
  $('#navSidebar').classList.toggle('collapsed', state.sidebarCollapsed);
  $('#hideSidebar').textContent = state.sidebarCollapsed ? '▶ Show' : '◀ Hide';
}

// ============================================
// CONFIG LOADING
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

// ============================================
// DISPATCH
// ============================================

async function loadDispatch() {
  const container = $('#screen-dispatch');
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">Loading dispatch...</div></div>`;
  
  try {
    const result = await api.getDispatchDay(formatDate(state.currentDate));
    state.dispatch = result.data;
    renderDispatch();
  } catch (err) {
    container.innerHTML = `<div class="screen-placeholder"><h2>Failed to load dispatch</h2><p>${err.message}</p></div>`;
  }
}

function renderDispatch() {
  const container = $('#screen-dispatch');
  const data = state.dispatch;
  
  if (!data) {
    container.innerHTML = `<div class="screen-placeholder"><h2>No dispatch data</h2></div>`;
    return;
  }
  
  const { stats, drivers, unassigned } = data;
  
  container.innerHTML = `
    <div class="dispatch-header">
      <div class="stats-bar">
        <div class="stat"><span class="stat-value">${stats.drivers_available}</span><span class="stat-label">Available</span></div>
        <div class="stat"><span class="stat-value">${stats.drivers_working}</span><span class="stat-label">Working</span></div>
        <div class="stat"><span class="stat-value text-warning">${stats.drivers_leave}</span><span class="stat-label">Leave</span></div>
        <div class="stat-divider"></div>
        <div class="stat"><span class="stat-value">${stats.vehicles_available}</span><span class="stat-label">Vehicles</span></div>
        <div class="stat"><span class="stat-value">${stats.vehicles_in_use}</span><span class="stat-label">In Use</span></div>
        <div class="stat-divider"></div>
        <div class="stat"><span class="stat-value ${stats.unassigned_count > 0 ? 'text-error' : 'text-success'}">${stats.unassigned_count}</span><span class="stat-label">Unassigned</span></div>
      </div>
    </div>
    <div class="dispatch-content">
      <div class="dispatch-section">
        <div class="section-header"><h3>Drivers (${drivers.filter(d => d.shifts.length > 0).length} working)</h3></div>
        <div class="section-body">
          ${renderTimelineHeader()}
          ${drivers.filter(d => d.shifts.length > 0).length === 0 
            ? '<div class="empty-message">No drivers assigned for today</div>' 
            : drivers.filter(d => d.shifts.length > 0).map(d => renderDriverRow(d)).join('')}
        </div>
      </div>
      <div class="dispatch-section">
        <div class="section-header"><h3>Unassigned (${unassigned.length})</h3></div>
        <div class="section-body">
          ${unassigned.length === 0 
            ? '<div class="empty-message">All jobs assigned ✓</div>' 
            : unassigned.map(j => renderUnassignedRow(j)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderTimelineHeader() {
  const hours = [];
  for (let h = 5; h <= 24; h++) {
    hours.push(`<span class="hour-mark">${String(h).padStart(2, '0')}</span>`);
  }
  return `<div class="timeline-header"><div class="resource-info-placeholder"></div><div class="timeline-hours">${hours.join('')}</div></div>`;
}

function renderDriverRow(driver) {
  return `
    <div class="resource-row">
      <div class="resource-info">
        <span class="resource-id font-mono">${driver.employee_number}</span>
        <span class="resource-name">${driver.last_name}, ${driver.first_name}</span>
      </div>
      <div class="resource-timeline">
        ${driver.shifts.map(s => {
          const startPct = ((s.start_time - 5) / 19) * 100;
          const widthPct = ((s.end_time - s.start_time) / 19) * 100;
          return `<div class="shift-block" style="left:${startPct}%;width:${widthPct}%" title="${s.name}: ${formatTime(s.start_time)}-${formatTime(s.end_time)}"><span class="shift-name">${s.name}</span></div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderUnassignedRow(job) {
  return `
    <div class="resource-row">
      <div class="resource-info">
        <span class="resource-name">${job.name}</span>
      </div>
      <div class="resource-timeline">
        ${(() => {
          const startPct = ((job.start_time - 5) / 19) * 100;
          const widthPct = ((job.end_time - job.start_time) / 19) * 100;
          return `<div class="shift-block unassigned" style="left:${startPct}%;width:${widthPct}%" onclick="window.app.showAssignModal('${job.id}')"><span class="shift-name">${formatTime(job.start_time)}-${formatTime(job.end_time)}</span></div>`;
        })()}
      </div>
    </div>
  `;
}

// ============================================
// EMPLOYEES / HRM
// ============================================

async function loadEmployees() {
  const container = $('#screen-hrm');
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">Loading employees...</div></div>`;
  
  try {
    const params = {};
    if (state.employeeFilters.search) params.search = state.employeeFilters.search;
    if (state.employeeFilters.role) params.role = state.employeeFilters.role;
    if (state.employeeFilters.status) params.status = state.employeeFilters.status;
    
    const result = await api.getEmployees(params);
    state.employees = result.data || [];
    renderEmployees();
  } catch (err) {
    container.innerHTML = `<div class="screen-placeholder"><h2>Failed to load employees</h2><p>${err.message}</p></div>`;
  }
}

function renderEmployees() {
  const container = $('#screen-hrm');
  const employees = state.employees;
  const f = state.employeeFilters;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Employees</h2>
      <button class="btn btn-primary" onclick="window.app.showAddEmployee()">+ Add Employee</button>
    </div>
    <div class="filter-bar">
      <input type="text" class="form-input filter-search" placeholder="Search..." value="${f.search}" onkeyup="window.app.handleEmployeeSearch(event)" />
      <select class="form-select filter-select" onchange="window.app.handleEmployeeRoleFilter(event)">
        <option value="">All Roles</option>
        <option value="driver" ${f.role === 'driver' ? 'selected' : ''}>Drivers</option>
        <option value="dispatcher" ${f.role === 'dispatcher' ? 'selected' : ''}>Dispatchers</option>
        <option value="admin" ${f.role === 'admin' ? 'selected' : ''}>Admins</option>
      </select>
      <select class="form-select filter-select" onchange="window.app.handleEmployeeStatusFilter(event)">
        <option value="">All Statuses</option>
        <option value="active" ${f.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${f.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      </select>
    </div>
    <div class="screen-content">
      ${employees.length === 0 ? '<div class="empty-state"><h3>No employees found</h3></div>' : `
        <table class="table">
          <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Licence</th><th>Role</th><th>Status</th><th class="text-right">Actions</th></tr></thead>
          <tbody>
            ${employees.map(e => `
              <tr>
                <td class="font-mono">${e.employee_number}</td>
                <td><div class="employee-name">${e.first_name} ${e.last_name}</div>${e.email ? `<div class="text-muted" style="font-size:12px">${e.email}</div>` : ''}</td>
                <td>${e.phone || '—'}</td>
                <td class="font-mono">${e.licence_number || '—'}</td>
                <td><span class="badge badge-info">${e.role}</span></td>
                <td><span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-warning'}">${e.status}</span></td>
                <td class="text-right">
                  <button class="btn btn-secondary btn-sm" onclick="window.app.editEmployee('${e.id}')">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="window.app.confirmDeleteEmployee('${e.id}', '${e.first_name} ${e.last_name}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

let employeeSearchTimeout;
function handleEmployeeSearch(e) {
  clearTimeout(employeeSearchTimeout);
  employeeSearchTimeout = setTimeout(() => { state.employeeFilters.search = e.target.value; loadEmployees(); }, 300);
}
function handleEmployeeRoleFilter(e) { state.employeeFilters.role = e.target.value; loadEmployees(); }
function handleEmployeeStatusFilter(e) { state.employeeFilters.status = e.target.value; loadEmployees(); }

function showAddEmployee() { state.editingEmployee = null; showEmployeeForm(); }
function editEmployee(id) {
  state.editingEmployee = state.employees.find(e => e.id === id);
  if (!state.editingEmployee) return showToast('Employee not found', 'error');
  showEmployeeForm();
}

function showEmployeeForm() {
  const emp = state.editingEmployee;
  const isEdit = !!emp;
  
  showModal(isEdit ? 'Edit Employee' : 'Add Employee', `
    <form id="employeeForm" class="form">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Employee Number *</label><input type="text" name="employee_number" class="form-input" value="${emp?.employee_number || ''}" required /></div>
        <div class="form-group"><label class="form-label">Role</label><select name="role" class="form-select"><option value="driver" ${emp?.role === 'driver' ? 'selected' : ''}>Driver</option><option value="dispatcher" ${emp?.role === 'dispatcher' ? 'selected' : ''}>Dispatcher</option><option value="admin" ${emp?.role === 'admin' ? 'selected' : ''}>Admin</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">First Name *</label><input type="text" name="first_name" class="form-input" value="${emp?.first_name || ''}" required /></div>
        <div class="form-group"><label class="form-label">Last Name *</label><input type="text" name="last_name" class="form-input" value="${emp?.last_name || ''}" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input type="email" name="email" class="form-input" value="${emp?.email || ''}" /></div>
        <div class="form-group"><label class="form-label">Phone</label><input type="tel" name="phone" class="form-input" value="${emp?.phone || ''}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Licence Number</label><input type="text" name="licence_number" class="form-input" value="${emp?.licence_number || ''}" /></div>
        <div class="form-group"><label class="form-label">Licence Expiry</label><input type="date" name="licence_expiry" class="form-input" value="${emp?.licence_expiry || ''}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Hire Date</label><input type="date" name="hire_date" class="form-input" value="${emp?.hire_date || ''}" /></div>
        <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-select"><option value="active" ${emp?.status !== 'inactive' ? 'selected' : ''}>Active</option><option value="inactive" ${emp?.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-input form-textarea" rows="2">${emp?.notes || ''}</textarea></div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveEmployee()">${isEdit ? 'Save' : 'Add'}</button>
  `);
}

async function saveEmployee() {
  const form = document.getElementById('employeeForm');
  if (!form.checkValidity()) return form.reportValidity();
  
  const fd = new FormData(form);
  const data = {
    employee_number: fd.get('employee_number'),
    first_name: fd.get('first_name'),
    last_name: fd.get('last_name'),
    email: fd.get('email') || null,
    phone: fd.get('phone') || null,
    licence_number: fd.get('licence_number') || null,
    licence_expiry: fd.get('licence_expiry') || null,
    role: fd.get('role'),
    status: fd.get('status'),
    hire_date: fd.get('hire_date') || null,
    notes: fd.get('notes') || null,
  };
  
  try {
    if (state.editingEmployee) {
      await api.updateEmployee(state.editingEmployee.id, data);
      showToast('Employee updated');
    } else {
      await api.createEmployee(data);
      showToast('Employee added');
    }
    closeModal();
    loadEmployees();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

function confirmDeleteEmployee(id, name) {
  showDeleteModal(`Delete <strong>${name}</strong>?`, () => deleteEmployee(id));
}

async function deleteEmployee(id) {
  try {
    await api.deleteEmployee(id);
    showToast('Employee deleted');
    closeDeleteModal();
    loadEmployees();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// ============================================
// VEHICLES
// ============================================

async function loadVehicles() {
  const container = $('#screen-vehicles');
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">Loading vehicles...</div></div>`;
  
  try {
    const params = {};
    if (state.vehicleFilters.search) params.search = state.vehicleFilters.search;
    if (state.vehicleFilters.status) params.status = state.vehicleFilters.status;
    
    const result = await api.getVehicles(params);
    state.vehicles = result.data || [];
    renderVehicles();
  } catch (err) {
    container.innerHTML = `<div class="screen-placeholder"><h2>Failed to load vehicles</h2><p>${err.message}</p></div>`;
  }
}

function renderVehicles() {
  const container = $('#screen-vehicles');
  const vehicles = state.vehicles;
  const f = state.vehicleFilters;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Vehicles</h2>
      <button class="btn btn-primary" onclick="window.app.showAddVehicle()">+ Add Vehicle</button>
    </div>
    <div class="filter-bar">
      <input type="text" class="form-input filter-search" placeholder="Search..." value="${f.search}" onkeyup="window.app.handleVehicleSearch(event)" />
      <select class="form-select filter-select" onchange="window.app.handleVehicleStatusFilter(event)">
        <option value="">All Statuses</option>
        <option value="active" ${f.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${f.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        <option value="sold" ${f.status === 'sold' ? 'selected' : ''}>Sold</option>
      </select>
    </div>
    <div class="screen-content">
      ${vehicles.length === 0 ? '<div class="empty-state"><h3>No vehicles found</h3></div>' : `
        <table class="table">
          <thead><tr><th>Fleet #</th><th>Rego</th><th>Capacity</th><th>Make/Model</th><th>Year</th><th>Status</th><th class="text-right">Actions</th></tr></thead>
          <tbody>
            ${vehicles.map(v => `
              <tr>
                <td class="font-mono">${v.fleet_number}</td>
                <td class="font-mono">${v.rego}</td>
                <td>${v.capacity} seats</td>
                <td>${v.make || ''} ${v.model || ''}</td>
                <td>${v.year || '—'}</td>
                <td><span class="badge ${v.status === 'active' ? 'badge-success' : v.status === 'sold' ? 'badge-error' : 'badge-warning'}">${v.status}</span></td>
                <td class="text-right">
                  <button class="btn btn-secondary btn-sm" onclick="window.app.editVehicle('${v.id}')">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="window.app.confirmDeleteVehicle('${v.id}', '${v.fleet_number}')">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

let vehicleSearchTimeout;
function handleVehicleSearch(e) {
  clearTimeout(vehicleSearchTimeout);
  vehicleSearchTimeout = setTimeout(() => { state.vehicleFilters.search = e.target.value; loadVehicles(); }, 300);
}
function handleVehicleStatusFilter(e) { state.vehicleFilters.status = e.target.value; loadVehicles(); }

function showAddVehicle() { state.editingVehicle = null; showVehicleForm(); }
function editVehicle(id) {
  state.editingVehicle = state.vehicles.find(v => v.id === id);
  if (!state.editingVehicle) return showToast('Vehicle not found', 'error');
  showVehicleForm();
}

function showVehicleForm() {
  const veh = state.editingVehicle;
  const isEdit = !!veh;
  
  showModal(isEdit ? 'Edit Vehicle' : 'Add Vehicle', `
    <form id="vehicleForm" class="form">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Fleet Number *</label><input type="text" name="fleet_number" class="form-input" value="${veh?.fleet_number || ''}" required /></div>
        <div class="form-group"><label class="form-label">Registration *</label><input type="text" name="rego" class="form-input" value="${veh?.rego || ''}" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Capacity *</label><input type="number" name="capacity" class="form-input" value="${veh?.capacity || ''}" min="1" required /></div>
        <div class="form-group"><label class="form-label">Status</label><select name="status" class="form-select"><option value="active" ${veh?.status !== 'inactive' && veh?.status !== 'sold' ? 'selected' : ''}>Active</option><option value="inactive" ${veh?.status === 'inactive' ? 'selected' : ''}>Inactive</option><option value="sold" ${veh?.status === 'sold' ? 'selected' : ''}>Sold</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Make</label><input type="text" name="make" class="form-input" value="${veh?.make || ''}" /></div>
        <div class="form-group"><label class="form-label">Model</label><input type="text" name="model" class="form-input" value="${veh?.model || ''}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Year</label><input type="number" name="year" class="form-input" value="${veh?.year || ''}" min="1900" max="2099" /></div>
        <div class="form-group"><label class="form-label">VIN</label><input type="text" name="vin" class="form-input" value="${veh?.vin || ''}" /></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-input form-textarea" rows="2">${veh?.notes || ''}</textarea></div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveVehicle()">${isEdit ? 'Save' : 'Add'}</button>
  `);
}

async function saveVehicle() {
  const form = document.getElementById('vehicleForm');
  if (!form.checkValidity()) return form.reportValidity();
  
  const fd = new FormData(form);
  const data = {
    fleet_number: fd.get('fleet_number'),
    rego: fd.get('rego'),
    capacity: parseInt(fd.get('capacity')),
    make: fd.get('make') || null,
    model: fd.get('model') || null,
    year: fd.get('year') ? parseInt(fd.get('year')) : null,
    vin: fd.get('vin') || null,
    status: fd.get('status'),
    notes: fd.get('notes') || null,
  };
  
  try {
    if (state.editingVehicle) {
      await api.updateVehicle(state.editingVehicle.id, data);
      showToast('Vehicle updated');
    } else {
      await api.createVehicle(data);
      showToast('Vehicle added');
    }
    closeModal();
    loadVehicles();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

function confirmDeleteVehicle(id, name) {
  showDeleteModal(`Delete vehicle <strong>${name}</strong>?`, () => deleteVehicle(id));
}

async function deleteVehicle(id) {
  try {
    await api.deleteVehicle(id);
    showToast('Vehicle deleted');
    closeDeleteModal();
    loadVehicles();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// ============================================
// SHIFT TEMPLATES
// ============================================

async function loadShiftTemplates() {
  const container = $('#screen-shifts');
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">Loading templates...</div></div>`;
  
  try {
    const result = await api.getShiftTemplates();
    state.shiftTemplates = result.data || [];
    renderShiftTemplates();
  } catch (err) {
    container.innerHTML = `<div class="screen-placeholder"><h2>Failed to load templates</h2><p>${err.message}</p></div>`;
  }
}

function renderShiftTemplates() {
  const container = $('#screen-shifts');
  const templates = state.shiftTemplates;
  const f = state.templateFilters;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Shift Templates</h2>
      <button class="btn btn-primary" onclick="window.app.showAddTemplate()">+ Add Template</button>
    </div>
    <div class="filter-bar">
      <input type="text" class="form-input filter-search" placeholder="Search..." value="${f.search}" onkeyup="window.app.handleTemplateSearch(event)" />
      <select class="form-select filter-select" onchange="window.app.handleTemplateTypeFilter(event)">
        <option value="">All Types</option>
        <option value="regular" ${f.type === 'regular' ? 'selected' : ''}>Regular</option>
        <option value="charter" ${f.type === 'charter' ? 'selected' : ''}>Charter</option>
        <option value="school" ${f.type === 'school' ? 'selected' : ''}>School</option>
      </select>
    </div>
    <div class="screen-content">
      ${templates.length === 0 ? '<div class="empty-state"><h3>No templates found</h3><p class="text-muted">Create templates to define reusable shift patterns.</p></div>' : `
        <div class="template-grid">
          ${templates.map(t => `
            <div class="card template-card" onclick="window.app.editTemplate('${t.id}')">
              <div class="card-header">
                <span class="card-title">${t.name}</span>
                <span class="badge badge-info">${t.code}</span>
              </div>
              <div class="template-times font-mono">${formatTime(t.default_start)} - ${formatTime(t.default_end)}</div>
              <div class="template-meta">
                <span class="badge">${t.shift_type}</span>
                <span class="text-muted">${formatDuration(t.default_end - t.default_start)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

let templateSearchTimeout;
function handleTemplateSearch(e) {
  clearTimeout(templateSearchTimeout);
  templateSearchTimeout = setTimeout(() => { state.templateFilters.search = e.target.value; loadShiftTemplates(); }, 300);
}
function handleTemplateTypeFilter(e) { state.templateFilters.type = e.target.value; loadShiftTemplates(); }

function showAddTemplate() { state.editingTemplate = null; showTemplateForm(); }

async function editTemplate(id) {
  try {
    const result = await api.getShiftTemplate(id);
    state.editingTemplate = result.data;
    showTemplateForm();
  } catch (err) {
    showToast('Failed to load template', 'error');
  }
}

function showTemplateForm() {
  const tpl = state.editingTemplate;
  const isEdit = !!tpl;
  
  const defaultStartTime = tpl ? formatTime(tpl.default_start) : '06:00';
  const defaultEndTime = tpl ? formatTime(tpl.default_end) : '14:00';
  
  // Build duties list - using actual times (shift start + offset)
  let dutiesHtml = '';
  if (isEdit && tpl.duties && tpl.duties.length > 0) {
    dutiesHtml = tpl.duties.map((d, i) => {
      const dutyStart = tpl.default_start + d.start_offset;
      const dutyEnd = dutyStart + d.duration;
      const dutyType = state.dutyTypes.find(dt => dt.id === d.duty_type_id);
      return `
        <div class="duty-row" data-duty-id="${d.id}" data-index="${i}">
          <select class="form-select duty-type-select" name="duty_type_${i}" style="border-left: 3px solid ${dutyType?.color || '#666'}">
            ${state.dutyTypes.map(dt => `<option value="${dt.id}" ${d.duty_type_id === dt.id ? 'selected' : ''} data-color="${dt.color}">${dt.name}</option>`).join('')}
          </select>
          <input type="time" class="form-input duty-start" name="duty_start_${i}" value="${formatTime(dutyStart)}" />
          <input type="time" class="form-input duty-end" name="duty_end_${i}" value="${formatTime(dutyEnd)}" />
          <button type="button" class="btn btn-danger btn-sm" onclick="window.app.removeDutyRow(this)">✕</button>
        </div>
      `;
    }).join('');
  }
  
  showModal(isEdit ? 'Edit Template' : 'Add Template', `
    <form id="templateForm" class="form">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Code *</label><input type="text" name="code" class="form-input" value="${tpl?.code || ''}" placeholder="e.g. AM-01" required /></div>
        <div class="form-group"><label class="form-label">Name *</label><input type="text" name="name" class="form-input" value="${tpl?.name || ''}" placeholder="e.g. Morning Shift" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Shift Start *</label><input type="time" name="default_start" id="shiftStart" class="form-input" value="${defaultStartTime}" required onchange="window.app.onShiftTimesChange()" /></div>
        <div class="form-group"><label class="form-label">Shift End *</label><input type="time" name="default_end" id="shiftEnd" class="form-input" value="${defaultEndTime}" required onchange="window.app.onShiftTimesChange()" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Type</label><select name="shift_type" class="form-select"><option value="regular" ${tpl?.shift_type === 'regular' ? 'selected' : ''}>Regular</option><option value="charter" ${tpl?.shift_type === 'charter' ? 'selected' : ''}>Charter</option><option value="school" ${tpl?.shift_type === 'school' ? 'selected' : ''}>School</option></select></div>
        <div class="form-group"><label class="form-label">Default Vehicle</label><select name="default_vehicle_id" class="form-select"><option value="">None</option>${state.vehicles.filter(v => v.status === 'active').map(v => `<option value="${v.id}" ${tpl?.default_vehicle_id === v.id ? 'selected' : ''}>${v.fleet_number}</option>`).join('')}</select></div>
      </div>
      
      <div class="duties-section">
        <div class="duties-header">
          <h4>Duties</h4>
        </div>
        <div class="duties-table">
          <div class="duties-table-header">
            <span>Type</span>
            <span>Start</span>
            <span>End</span>
            <span></span>
          </div>
          <div id="dutiesList">
            ${dutiesHtml || '<div class="empty-message">No duties - click Add Duty below</div>'}
          </div>
        </div>
        <button type="button" class="btn btn-secondary mt-3" onclick="window.app.addDutyRow()">+ Add Duty</button>
      </div>
    </form>
  `, `
    ${isEdit ? `<button class="btn btn-danger" onclick="window.app.confirmDeleteTemplate('${tpl.id}', '${tpl.name}')" style="margin-right:auto">Delete</button>` : ''}
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveTemplate()">${isEdit ? 'Save' : 'Create'}</button>
  `, 'modal-large');
}

function addDutyRow() {
  const dutiesList = document.getElementById('dutiesList');
  const emptyMsg = dutiesList.querySelector('.empty-message');
  if (emptyMsg) emptyMsg.remove();
  
  const shiftStart = parseTime($('#shiftStart').value) || 6;
  const shiftEnd = parseTime($('#shiftEnd').value) || 14;
  
  // Find next available time slot
  const existingRows = dutiesList.querySelectorAll('.duty-row');
  let startTime = shiftStart;
  if (existingRows.length > 0) {
    const lastRow = existingRows[existingRows.length - 1];
    const lastEnd = parseTime(lastRow.querySelector('.duty-end').value);
    startTime = lastEnd || shiftStart;
  }
  
  const endTime = Math.min(startTime + 1, shiftEnd);
  const index = existingRows.length;
  const defaultDutyType = state.dutyTypes[0];
  
  const rowHtml = `
    <div class="duty-row" data-index="${index}">
      <select class="form-select duty-type-select" name="duty_type_${index}" style="border-left: 3px solid ${defaultDutyType?.color || '#666'}" onchange="window.app.onDutyTypeChange(this)">
        ${state.dutyTypes.map(dt => `<option value="${dt.id}" data-color="${dt.color}">${dt.name}</option>`).join('')}
      </select>
      <input type="time" class="form-input duty-start" name="duty_start_${index}" value="${formatTime(startTime)}" />
      <input type="time" class="form-input duty-end" name="duty_end_${index}" value="${formatTime(endTime)}" />
      <button type="button" class="btn btn-danger btn-sm" onclick="window.app.removeDutyRow(this)">✕</button>
    </div>
  `;
  
  dutiesList.insertAdjacentHTML('beforeend', rowHtml);
}

function removeDutyRow(btn) {
  const row = btn.closest('.duty-row');
  row.remove();
  
  const dutiesList = document.getElementById('dutiesList');
  if (dutiesList.querySelectorAll('.duty-row').length === 0) {
    dutiesList.innerHTML = '<div class="empty-message">No duties - click Add Duty below</div>';
  }
}

function onDutyTypeChange(select) {
  const option = select.options[select.selectedIndex];
  const color = option.dataset.color || '#666';
  select.style.borderLeftColor = color;
}

function onShiftTimesChange() {
  // Could validate duties are within shift times here
}

async function saveTemplate() {
  const form = document.getElementById('templateForm');
  if (!form.checkValidity()) return form.reportValidity();
  
  const fd = new FormData(form);
  const shiftStart = parseTime(fd.get('default_start'));
  const shiftEnd = parseTime(fd.get('default_end'));
  
  const data = {
    code: fd.get('code'),
    name: fd.get('name'),
    default_start: shiftStart,
    default_end: shiftEnd,
    shift_type: fd.get('shift_type'),
    default_vehicle_id: fd.get('default_vehicle_id') || null,
  };
  
  // Collect duties
  const dutyRows = document.querySelectorAll('#dutiesList .duty-row');
  const duties = [];
  dutyRows.forEach((row, i) => {
    const dutyTypeId = row.querySelector('.duty-type-select').value;
    const dutyStart = parseTime(row.querySelector('.duty-start').value);
    const dutyEnd = parseTime(row.querySelector('.duty-end').value);
    
    duties.push({
      duty_type_id: dutyTypeId,
      start_offset: dutyStart - shiftStart,
      duration: dutyEnd - dutyStart,
      sequence: i + 1,
    });
  });
  
  try {
    if (state.editingTemplate) {
      // Update template
      await api.updateShiftTemplate(state.editingTemplate.id, data);
      
      // Sync duties - delete old ones and create new
      // For simplicity, we'll delete all and recreate
      if (state.editingTemplate.duties) {
        for (const duty of state.editingTemplate.duties) {
          await api.deleteShiftDuty(state.editingTemplate.id, duty.id);
        }
      }
      for (const duty of duties) {
        await api.addShiftDuty(state.editingTemplate.id, duty);
      }
      
      showToast('Template updated');
    } else {
      // Create template
      const result = await api.createShiftTemplate(data);
      const templateId = result.data.id;
      
      // Add duties
      for (const duty of duties) {
        await api.addShiftDuty(templateId, duty);
      }
      
      showToast('Template created');
    }
    closeModal();
    loadShiftTemplates();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

function confirmDeleteTemplate(id, name) {
  showDeleteModal(`Delete template <strong>${name}</strong>?`, () => deleteTemplate(id));
}

async function deleteTemplate(id) {
  try {
    await api.deleteShiftTemplate(id);
    showToast('Template deleted');
    closeDeleteModal();
    closeModal();
    loadShiftTemplates();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// ============================================
// ROSTER (Gantt-style like dispatch)
// ============================================

async function loadRoster() {
  const container = $('#screen-roster');
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">Loading roster...</div></div>`;
  
  try {
    // Load roster for the selected date
    const result = await api.getRosterByDate(formatDate(state.rosterDate));
    state.rosterData = result.data;
    
    // Also ensure we have employees loaded
    if (state.employees.length === 0) {
      const empResult = await api.getEmployees({ status: 'active' });
      state.employees = empResult.data || [];
    }
    if (state.vehicles.length === 0) {
      const vehResult = await api.getVehicles({ status: 'active' });
      state.vehicles = vehResult.data || [];
    }
    if (state.shiftTemplates.length === 0) {
      const tplResult = await api.getShiftTemplates();
      state.shiftTemplates = tplResult.data || [];
    }
    
    renderRoster();
  } catch (err) {
    container.innerHTML = `<div class="screen-placeholder"><h2>Failed to load roster</h2><p>${err.message}</p></div>`;
  }
}

function renderRoster() {
  const container = $('#screen-roster');
  const data = state.rosterData;
  
  // Group entries by driver
  const entries = data?.entries || [];
  const assignedByDriver = {};
  const unassigned = [];
  
  entries.forEach(e => {
    if (e.driver_id) {
      if (!assignedByDriver[e.driver_id]) {
        assignedByDriver[e.driver_id] = {
          driver: { id: e.driver_id, name: e.driver_name, number: e.driver_number },
          shifts: []
        };
      }
      assignedByDriver[e.driver_id].shifts.push(e);
    } else {
      unassigned.push(e);
    }
  });
  
  const drivers = Object.values(assignedByDriver);
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Roster</h2>
      <div class="roster-date-nav">
        <button class="btn btn-secondary" onclick="window.app.prevRosterDate()">◀</button>
        <span class="roster-current-date">${formatDisplayDate(state.rosterDate)}</span>
        <button class="btn btn-secondary" onclick="window.app.nextRosterDate()">▶</button>
        <button class="btn btn-secondary" onclick="window.app.goToToday()">Today</button>
      </div>
      <button class="btn btn-primary" onclick="window.app.showAddRosterEntry()">+ Add Shift</button>
    </div>
    
    <div class="dispatch-content">
      <div class="dispatch-section">
        <div class="section-header"><h3>Assigned Drivers (${drivers.length})</h3></div>
        <div class="section-body">
          ${renderTimelineHeader()}
          ${drivers.length === 0 
            ? '<div class="empty-message">No drivers assigned for this day</div>' 
            : drivers.map(d => renderRosterDriverRow(d)).join('')}
        </div>
      </div>
      
      <div class="dispatch-section">
        <div class="section-header"><h3>Unassigned Shifts (${unassigned.length})</h3></div>
        <div class="section-body">
          ${unassigned.length === 0 
            ? '<div class="empty-message">All shifts assigned ✓</div>' 
            : unassigned.map(e => renderRosterUnassignedRow(e)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderRosterDriverRow(driverData) {
  const { driver, shifts } = driverData;
  return `
    <div class="resource-row">
      <div class="resource-info">
        <span class="resource-id font-mono">${driver.number || '—'}</span>
        <span class="resource-name">${driver.name}</span>
      </div>
      <div class="resource-timeline">
        ${shifts.map(s => {
          const startPct = ((s.start_time - 5) / 19) * 100;
          const widthPct = ((s.end_time - s.start_time) / 19) * 100;
          return `<div class="shift-block" style="left:${startPct}%;width:${widthPct}%" onclick="window.app.editRosterEntry('${s.id}')" title="${s.name}: ${formatTime(s.start_time)}-${formatTime(s.end_time)}"><span class="shift-name">${s.name}</span></div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderRosterUnassignedRow(entry) {
  return `
    <div class="resource-row">
      <div class="resource-info">
        <span class="resource-name">${entry.name}</span>
      </div>
      <div class="resource-timeline">
        ${(() => {
          const startPct = ((entry.start_time - 5) / 19) * 100;
          const widthPct = ((entry.end_time - entry.start_time) / 19) * 100;
          return `<div class="shift-block unassigned" style="left:${startPct}%;width:${widthPct}%" onclick="window.app.editRosterEntry('${entry.id}')"><span class="shift-name">${formatTime(entry.start_time)}-${formatTime(entry.end_time)}</span></div>`;
        })()}
      </div>
    </div>
  `;
}

function prevRosterDate() {
  state.rosterDate.setDate(state.rosterDate.getDate() - 1);
  loadRoster();
}

function nextRosterDate() {
  state.rosterDate.setDate(state.rosterDate.getDate() + 1);
  loadRoster();
}

function goToToday() {
  state.rosterDate = new Date();
  loadRoster();
}

function showAddRosterEntry() {
  state.editingRosterEntry = { date: formatDate(state.rosterDate), isNew: true };
  showRosterEntryForm();
}

async function editRosterEntry(id) {
  try {
    const result = await api.getRosterEntry(id);
    state.editingRosterEntry = result.data;
    showRosterEntryForm();
  } catch (err) {
    showToast('Failed to load entry', 'error');
  }
}

function showRosterEntryForm() {
  const entry = state.editingRosterEntry;
  const isNew = entry?.isNew;
  
  const employees = state.employees.filter(e => e.status === 'active' && e.role === 'driver');
  const vehicles = state.vehicles.filter(v => v.status === 'active');
  const templates = state.shiftTemplates;
  
  const startTime = entry && !isNew ? formatTime(entry.start_time) : '06:00';
  const endTime = entry && !isNew ? formatTime(entry.end_time) : '14:00';
  
  showModal(isNew ? 'Add Roster Entry' : 'Edit Roster Entry', `
    <form id="rosterEntryForm" class="form">
      <input type="hidden" name="date" value="${entry?.date || formatDate(state.rosterDate)}" />
      
      ${isNew ? `
        <div class="form-group">
          <label class="form-label">From Template</label>
          <select name="shift_template_id" class="form-select" onchange="window.app.onRosterTemplateSelect(this)">
            <option value="">— Select or create manually —</option>
            ${templates.map(t => `<option value="${t.id}" data-start="${t.default_start}" data-end="${t.default_end}" data-name="${t.name}" data-type="${t.shift_type}">${t.code} - ${t.name}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input type="text" name="name" class="form-input" value="${entry?.name || ''}" placeholder="Shift name" required /></div>
        <div class="form-group"><label class="form-label">Type</label><select name="shift_type" class="form-select"><option value="regular" ${entry?.shift_type === 'regular' ? 'selected' : ''}>Regular</option><option value="charter" ${entry?.shift_type === 'charter' ? 'selected' : ''}>Charter</option><option value="school" ${entry?.shift_type === 'school' ? 'selected' : ''}>School</option></select></div>
      </div>
      
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start Time *</label><input type="time" name="start_time" class="form-input" value="${startTime}" required /></div>
        <div class="form-group"><label class="form-label">End Time *</label><input type="time" name="end_time" class="form-input" value="${endTime}" required /></div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Driver</label>
          <select name="driver_id" class="form-select">
            <option value="">— Unassigned —</option>
            ${employees.map(e => `<option value="${e.id}" ${entry?.driver_id === e.id ? 'selected' : ''}>${e.first_name} ${e.last_name} (${e.employee_number})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Vehicle</label>
          <select name="vehicle_id" class="form-select">
            <option value="">— None —</option>
            ${vehicles.map(v => `<option value="${v.id}" ${entry?.vehicle_id === v.id ? 'selected' : ''}>${v.fleet_number}</option>`).join('')}
          </select>
        </div>
      </div>
      
      <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-input form-textarea" rows="2">${entry?.notes || ''}</textarea></div>
    </form>
  `, `
    ${!isNew ? `<button class="btn btn-danger" onclick="window.app.confirmDeleteRosterEntry('${entry.id}', '${entry.name}')" style="margin-right:auto">Delete</button>` : ''}
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveRosterEntry()">${isNew ? 'Create' : 'Save'}</button>
  `);
}

function onRosterTemplateSelect(select) {
  const option = select.options[select.selectedIndex];
  if (!option.value) return;
  
  const form = document.getElementById('rosterEntryForm');
  form.querySelector('[name="name"]').value = option.dataset.name || '';
  form.querySelector('[name="shift_type"]').value = option.dataset.type || 'regular';
  form.querySelector('[name="start_time"]').value = formatTime(parseFloat(option.dataset.start));
  form.querySelector('[name="end_time"]').value = formatTime(parseFloat(option.dataset.end));
}

async function saveRosterEntry() {
  const form = document.getElementById('rosterEntryForm');
  if (!form.checkValidity()) return form.reportValidity();
  
  const fd = new FormData(form);
  const isNew = state.editingRosterEntry?.isNew;
  
  const data = {
    date: fd.get('date'),
    name: fd.get('name'),
    shift_type: fd.get('shift_type'),
    start_time: parseTime(fd.get('start_time')),
    end_time: parseTime(fd.get('end_time')),
    driver_id: fd.get('driver_id') || null,
    vehicle_id: fd.get('vehicle_id') || null,
    notes: fd.get('notes') || null,
  };
  
  if (isNew && fd.get('shift_template_id')) {
    data.shift_template_id = fd.get('shift_template_id');
  }
  
  try {
    if (isNew) {
      await api.createRosterEntry(data);
      showToast('Entry created');
    } else {
      await api.updateRosterEntry(state.editingRosterEntry.id, data);
      showToast('Entry updated');
    }
    closeModal();
    loadRoster();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

function confirmDeleteRosterEntry(id, name) {
  showDeleteModal(`Delete <strong>${name}</strong>?`, () => deleteRosterEntry(id));
}

async function deleteRosterEntry(id) {
  try {
    await api.deleteRosterEntry(id);
    showToast('Entry deleted');
    closeDeleteModal();
    closeModal();
    loadRoster();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// ============================================
// DISPATCH ASSIGN MODAL
// ============================================

function showAssignModal(rosterEntryId) {
  const employees = state.employees.filter(e => e.status === 'active' && e.role === 'driver');
  const vehicles = state.vehicles.filter(v => v.status === 'active');
  
  showModal('Assign Shift', `
    <form id="assignForm" class="form">
      <input type="hidden" name="roster_entry_id" value="${rosterEntryId}" />
      <div class="form-group">
        <label class="form-label">Driver</label>
        <select name="driver_id" class="form-select">
          <option value="">— Select Driver —</option>
          ${employees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Vehicle</label>
        <select name="vehicle_id" class="form-select">
          <option value="">— Select Vehicle —</option>
          ${vehicles.map(v => `<option value="${v.id}">${v.fleet_number}</option>`).join('')}
        </select>
      </div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.assignShift()">Assign</button>
  `);
}

async function assignShift() {
  const form = document.getElementById('assignForm');
  const fd = new FormData(form);
  
  const data = {
    roster_entry_id: fd.get('roster_entry_id'),
    driver_id: fd.get('driver_id') || undefined,
    vehicle_id: fd.get('vehicle_id') || undefined,
  };
  
  if (!data.driver_id && !data.vehicle_id) {
    return showToast('Select a driver or vehicle', 'error');
  }
  
  try {
    await api.assignDispatch(data);
    showToast('Shift assigned');
    closeModal();
    loadDispatch();
  } catch (err) {
    showToast(err.message || 'Failed to assign', 'error');
  }
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  $('#menuToggle').addEventListener('click', toggleSidebar);
  $('#hideSidebar').addEventListener('click', toggleSidebar);
  $('#prevDate').addEventListener('click', prevDate);
  $('#nextDate').addEventListener('click', nextDate);
  $('#modalClose').addEventListener('click', closeModal);
  $('#deleteModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
  
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.screen));
  });
  
  updateDateDisplay();
  await loadConfig();
  
  // Preload vehicles for template form
  try {
    const vehResult = await api.getVehicles({ status: 'active' });
    state.vehicles = vehResult.data || [];
  } catch (err) {
    console.error('Failed to preload vehicles:', err);
  }
  
  try {
    await api.health();
    $('#connectionStatus').classList.remove('offline');
  } catch (err) {
    $('#connectionStatus').classList.add('offline');
    showToast('API connection failed', 'error');
  }
  
  loadScreenData(state.currentScreen);
}

// ============================================
// EXPORTS
// ============================================

window.app = {
  // General
  closeModal,
  closeDeleteModal,
  loadDispatch,
  
  // Employees
  loadEmployees,
  showAddEmployee,
  editEmployee,
  saveEmployee,
  confirmDeleteEmployee,
  handleEmployeeSearch,
  handleEmployeeRoleFilter,
  handleEmployeeStatusFilter,
  
  // Vehicles
  loadVehicles,
  showAddVehicle,
  editVehicle,
  saveVehicle,
  confirmDeleteVehicle,
  handleVehicleSearch,
  handleVehicleStatusFilter,
  
  // Templates
  showAddTemplate,
  editTemplate,
  saveTemplate,
  confirmDeleteTemplate,
  handleTemplateSearch,
  handleTemplateTypeFilter,
  addDutyRow,
  removeDutyRow,
  onDutyTypeChange,
  onShiftTimesChange,
  
  // Roster
  prevRosterDate,
  nextRosterDate,
  goToToday,
  showAddRosterEntry,
  editRosterEntry,
  saveRosterEntry,
  onRosterTemplateSelect,
  confirmDeleteRosterEntry,
  
  // Dispatch
  showAssignModal,
  assignShift,
};

document.addEventListener('DOMContentLoaded', init);
