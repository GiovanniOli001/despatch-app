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
  rosterWeek: null,
  
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
  
  // Roster week navigation
  rosterWeekStart: null,
  
  // Loading states
  loading: {
    dispatch: false,
    employees: false,
    vehicles: false,
    templates: false,
    roster: false,
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

function formatShortDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
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

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
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
    case 'roster': await loadRosterWeek(); break;
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
  state.loading.dispatch = true;
  
  container.innerHTML = `
    <div class="loading-screen">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading dispatch...</div>
    </div>
  `;
  
  try {
    const result = await api.getDispatchDay(formatDate(state.currentDate));
    state.dispatch = result.data;
    renderDispatch();
  } catch (err) {
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
          ${drivers.filter(d => d.shifts.length > 0).length === 0 
            ? '<div class="empty-message">No drivers assigned for today</div>' 
            : drivers.filter(d => d.shifts.length > 0).map(d => `
              <div class="resource-row">
                <div class="resource-info">
                  <span class="resource-id font-mono">${d.employee_number}</span>
                  <span class="resource-name">${d.last_name}, ${d.first_name}</span>
                </div>
                <div class="resource-timeline">
                  ${d.shifts.map(s => {
                    const startPct = ((s.start_time - 5) / 19) * 100;
                    const widthPct = ((s.end_time - s.start_time) / 19) * 100;
                    return `<div class="shift-block" style="left:${startPct}%;width:${widthPct}%" title="${s.name}: ${formatTime(s.start_time)}-${formatTime(s.end_time)}"><span class="shift-name">${s.name}</span></div>`;
                  }).join('')}
                </div>
              </div>
            `).join('')}
        </div>
      </div>
      <div class="dispatch-section">
        <div class="section-header"><h3>Unassigned (${unassigned.length})</h3></div>
        <div class="section-body">
          ${unassigned.length === 0 
            ? '<div class="empty-message">All jobs assigned ✓</div>' 
            : unassigned.map(j => `
              <div class="job-row">
                <div class="job-info">
                  <span class="job-name">${j.name}</span>
                  <span class="job-time font-mono">${formatTime(j.start_time)}-${formatTime(j.end_time)}</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="window.app.showAssignModal('${j.id}')">Assign</button>
              </div>
            `).join('')}
        </div>
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
            <div class="card template-card">
              <div class="card-header">
                <span class="card-title">${t.name}</span>
                <span class="badge badge-info">${t.code}</span>
              </div>
              <div class="template-times font-mono">${formatTime(t.default_start)} - ${formatTime(t.default_end)}</div>
              <div class="template-meta">
                <span class="badge">${t.shift_type}</span>
                <span class="text-muted">${formatDuration(t.default_end - t.default_start)}</span>
              </div>
              <div class="card-actions">
                <button class="btn btn-secondary btn-sm" onclick="window.app.editTemplate('${t.id}')">Edit</button>
                <button class="btn btn-secondary btn-sm" onclick="window.app.duplicateTemplate('${t.id}')">Duplicate</button>
                <button class="btn btn-danger btn-sm" onclick="window.app.confirmDeleteTemplate('${t.id}', '${t.name}')">Delete</button>
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
  
  showModal(isEdit ? 'Edit Template' : 'Add Template', `
    <form id="templateForm" class="form">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Code *</label><input type="text" name="code" class="form-input" value="${tpl?.code || ''}" placeholder="e.g. AM-SHIFT" required /></div>
        <div class="form-group"><label class="form-label">Name *</label><input type="text" name="name" class="form-input" value="${tpl?.name || ''}" placeholder="e.g. Morning Shift" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start Time *</label><input type="time" name="default_start" class="form-input" value="${defaultStartTime}" required /></div>
        <div class="form-group"><label class="form-label">End Time *</label><input type="time" name="default_end" class="form-input" value="${defaultEndTime}" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Type</label><select name="shift_type" class="form-select"><option value="regular" ${tpl?.shift_type === 'regular' ? 'selected' : ''}>Regular</option><option value="charter" ${tpl?.shift_type === 'charter' ? 'selected' : ''}>Charter</option><option value="school" ${tpl?.shift_type === 'school' ? 'selected' : ''}>School</option></select></div>
        <div class="form-group"><label class="form-label">Default Vehicle</label><select name="default_vehicle_id" class="form-select"><option value="">None</option>${state.vehicles.filter(v => v.status === 'active').map(v => `<option value="${v.id}" ${tpl?.default_vehicle_id === v.id ? 'selected' : ''}>${v.fleet_number}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea name="notes" class="form-input form-textarea" rows="2">${tpl?.notes || ''}</textarea></div>
    </form>
    ${isEdit && tpl.duties ? `
      <div class="duties-section">
        <div class="duties-header">
          <h4>Duties</h4>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.showAddDuty('${tpl.id}')">+ Add Duty</button>
        </div>
        <div class="duties-list">
          ${tpl.duties.length === 0 ? '<div class="empty-message">No duties defined</div>' : tpl.duties.map((d, i) => `
            <div class="duty-item" style="border-left: 3px solid ${d.duty_type_color}">
              <div class="duty-info">
                <span class="duty-type">${d.duty_type_name}</span>
                <span class="duty-time font-mono">+${formatDuration(d.start_offset)} → ${formatDuration(d.duration)}</span>
              </div>
              <div class="duty-actions">
                <button class="btn btn-secondary btn-sm" onclick="window.app.editDuty('${tpl.id}', '${d.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="window.app.deleteDuty('${tpl.id}', '${d.id}')">×</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `, `
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveTemplate()">${isEdit ? 'Save' : 'Create'}</button>
  `, 'modal-large');
}

async function saveTemplate() {
  const form = document.getElementById('templateForm');
  if (!form.checkValidity()) return form.reportValidity();
  
  const fd = new FormData(form);
  const data = {
    code: fd.get('code'),
    name: fd.get('name'),
    default_start: parseTime(fd.get('default_start')),
    default_end: parseTime(fd.get('default_end')),
    shift_type: fd.get('shift_type'),
    default_vehicle_id: fd.get('default_vehicle_id') || null,
    notes: fd.get('notes') || null,
  };
  
  try {
    if (state.editingTemplate) {
      await api.updateShiftTemplate(state.editingTemplate.id, data);
      showToast('Template updated');
    } else {
      await api.createShiftTemplate(data);
      showToast('Template created');
    }
    closeModal();
    loadShiftTemplates();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

async function duplicateTemplate(id) {
  try {
    await api.duplicateShiftTemplate(id);
    showToast('Template duplicated');
    loadShiftTemplates();
  } catch (err) {
    showToast(err.message || 'Failed to duplicate', 'error');
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
    loadShiftTemplates();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// Duty management within templates
function showAddDuty(templateId) {
  state.editingDuty = null;
  showDutyForm(templateId);
}

function editDuty(templateId, dutyId) {
  const tpl = state.editingTemplate;
  state.editingDuty = tpl?.duties?.find(d => d.id === dutyId);
  showDutyForm(templateId);
}

function showDutyForm(templateId) {
  const duty = state.editingDuty;
  const isEdit = !!duty;
  
  showModal(isEdit ? 'Edit Duty' : 'Add Duty', `
    <form id="dutyForm" class="form">
      <input type="hidden" name="templateId" value="${templateId}" />
      <div class="form-group">
        <label class="form-label">Duty Type *</label>
        <select name="duty_type_id" class="form-select" required>
          ${state.dutyTypes.map(dt => `<option value="${dt.id}" ${duty?.duty_type_id === dt.id ? 'selected' : ''}>${dt.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start Offset (hours) *</label><input type="number" name="start_offset" class="form-input" value="${duty?.start_offset || 0}" step="0.25" min="0" required /></div>
        <div class="form-group"><label class="form-label">Duration (hours) *</label><input type="number" name="duration" class="form-input" value="${duty?.duration || 1}" step="0.25" min="0.25" required /></div>
      </div>
      <div class="form-group"><label class="form-label">Sequence</label><input type="number" name="sequence" class="form-input" value="${duty?.sequence || 1}" min="1" /></div>
      <div class="form-group"><label class="form-label">Description</label><input type="text" name="description_template" class="form-input" value="${duty?.description_template || ''}" /></div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.app.editTemplate('${templateId}')">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveDuty()">${isEdit ? 'Save' : 'Add'}</button>
  `);
}

async function saveDuty() {
  const form = document.getElementById('dutyForm');
  if (!form.checkValidity()) return form.reportValidity();
  
  const fd = new FormData(form);
  const templateId = fd.get('templateId');
  const data = {
    duty_type_id: fd.get('duty_type_id'),
    start_offset: parseFloat(fd.get('start_offset')),
    duration: parseFloat(fd.get('duration')),
    sequence: parseInt(fd.get('sequence')) || 1,
    description_template: fd.get('description_template') || null,
  };
  
  try {
    if (state.editingDuty) {
      await api.updateShiftDuty(templateId, state.editingDuty.id, data);
      showToast('Duty updated');
    } else {
      await api.addShiftDuty(templateId, data);
      showToast('Duty added');
    }
    editTemplate(templateId); // Refresh template modal
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

async function deleteDuty(templateId, dutyId) {
  try {
    await api.deleteShiftDuty(templateId, dutyId);
    showToast('Duty removed');
    editTemplate(templateId);
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// ============================================
// ROSTER
// ============================================

async function loadRosterWeek() {
  const container = $('#screen-roster');
  container.innerHTML = `<div class="loading-screen"><div class="loading-spinner"></div><div class="loading-text">Loading roster...</div></div>`;
  
  // Initialize week start if not set
  if (!state.rosterWeekStart) {
    state.rosterWeekStart = getMonday(new Date());
  }
  
  try {
    const result = await api.getRosterWeek(formatDate(state.rosterWeekStart));
    state.rosterWeek = result.data;
    
    // Also load employees and vehicles for assignment dropdowns
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
  const data = state.rosterWeek;
  
  if (!data) {
    container.innerHTML = `<div class="screen-placeholder"><h2>No roster data</h2></div>`;
    return;
  }
  
  const { week_start, week_end, days } = data;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayDates = Object.keys(days);
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Roster</h2>
      <div class="roster-nav">
        <button class="btn btn-secondary" onclick="window.app.prevRosterWeek()">◀ Prev</button>
        <span class="week-range">${formatShortDate(week_start)} - ${formatShortDate(week_end)}</span>
        <button class="btn btn-secondary" onclick="window.app.nextRosterWeek()">Next ▶</button>
        <button class="btn btn-secondary" onclick="window.app.goToCurrentWeek()">Today</button>
      </div>
      <div class="roster-actions">
        <button class="btn btn-secondary" onclick="window.app.showCopyWeekModal()">Copy Week</button>
      </div>
    </div>
    <div class="roster-week">
      ${dayDates.map((date, i) => {
        const entries = days[date] || [];
        const dayNum = date.split('-')[2];
        const isToday = date === formatDate(new Date());
        return `
          <div class="roster-day ${isToday ? 'is-today' : ''}">
            <div class="day-header">
              <span class="day-name">${dayNames[i]}</span>
              <span class="day-date">${dayNum}</span>
              <span class="day-count">${entries.length} shifts</span>
            </div>
            <div class="day-entries">
              ${entries.length === 0 ? '<div class="empty-day">No shifts</div>' : entries.map(e => `
                <div class="roster-entry ${e.driver_id ? 'assigned' : 'unassigned'}" onclick="window.app.editRosterEntry('${e.id}')">
                  <div class="entry-name">${e.name}</div>
                  <div class="entry-time font-mono">${formatTime(e.start_time)}-${formatTime(e.end_time)}</div>
                  <div class="entry-assignment">
                    ${e.driver_name || '<span class="text-warning">Unassigned</span>'}
                    ${e.vehicle_number ? `<span class="text-muted">• ${e.vehicle_number}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
            <button class="btn btn-secondary btn-sm add-shift-btn" onclick="window.app.showAddRosterEntry('${date}')">+ Add</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function prevRosterWeek() {
  state.rosterWeekStart.setDate(state.rosterWeekStart.getDate() - 7);
  loadRosterWeek();
}

function nextRosterWeek() {
  state.rosterWeekStart.setDate(state.rosterWeekStart.getDate() + 7);
  loadRosterWeek();
}

function goToCurrentWeek() {
  state.rosterWeekStart = getMonday(new Date());
  loadRosterWeek();
}

function showAddRosterEntry(date) {
  state.editingRosterEntry = { date, isNew: true };
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
  
  const templates = state.shiftTemplates;
  const employees = state.employees.filter(e => e.status === 'active' && e.role === 'driver');
  const vehicles = state.vehicles.filter(v => v.status === 'active');
  
  const startTime = entry && !isNew ? formatTime(entry.start_time) : '06:00';
  const endTime = entry && !isNew ? formatTime(entry.end_time) : '14:00';
  
  showModal(isNew ? 'Add Roster Entry' : 'Edit Roster Entry', `
    <form id="rosterEntryForm" class="form">
      <input type="hidden" name="date" value="${entry?.date || ''}" />
      
      ${isNew ? `
        <div class="form-group">
          <label class="form-label">From Template (optional)</label>
          <select name="shift_template_id" class="form-select" onchange="window.app.onTemplateSelect(this)">
            <option value="">— Manual Entry —</option>
            ${templates.map(t => `<option value="${t.id}" data-start="${t.default_start}" data-end="${t.default_end}" data-name="${t.name}">${t.code} - ${t.name}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input type="text" name="name" class="form-input" value="${entry?.name || ''}" required /></div>
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
            ${vehicles.map(v => `<option value="${v.id}" ${entry?.vehicle_id === v.id ? 'selected' : ''}>${v.fleet_number} (${v.capacity} seats)</option>`).join('')}
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

function onTemplateSelect(select) {
  const option = select.options[select.selectedIndex];
  if (!option.value) return;
  
  const form = document.getElementById('rosterEntryForm');
  form.querySelector('[name="name"]').value = option.dataset.name || '';
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
    loadRosterWeek();
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
    loadRosterWeek();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// Copy Week Modal
function showCopyWeekModal() {
  const weekStart = formatDate(state.rosterWeekStart);
  
  showModal('Copy Week', `
    <form id="copyWeekForm" class="form">
      <p class="text-muted mb-4">Copy all roster entries from this week to another week.</p>
      <div class="form-group">
        <label class="form-label">Source Week</label>
        <input type="text" class="form-input" value="${formatShortDate(weekStart)} - ${formatShortDate(new Date(state.rosterWeekStart.getTime() + 6*24*60*60*1000))}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Target Week Start (Monday) *</label>
        <input type="date" name="target_week_start" class="form-input" required />
      </div>
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" name="include_assignments" checked />
          <span>Include driver/vehicle assignments</span>
        </label>
      </div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.copyWeek()">Copy Week</button>
  `);
}

async function copyWeek() {
  const form = document.getElementById('copyWeekForm');
  if (!form.checkValidity()) return form.reportValidity();
  
  const fd = new FormData(form);
  const targetDate = new Date(fd.get('target_week_start'));
  const targetMonday = getMonday(targetDate);
  
  const data = {
    source_week_start: formatDate(state.rosterWeekStart),
    target_week_start: formatDate(targetMonday),
    include_assignments: fd.get('include_assignments') === 'on',
  };
  
  try {
    const result = await api.copyRosterWeek(data);
    showToast(`Copied ${result.data.total_copied} entries`);
    closeModal();
    // Navigate to target week
    state.rosterWeekStart = targetMonday;
    loadRosterWeek();
  } catch (err) {
    showToast(err.message || 'Failed to copy', 'error');
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
  duplicateTemplate,
  confirmDeleteTemplate,
  handleTemplateSearch,
  handleTemplateTypeFilter,
  showAddDuty,
  editDuty,
  saveDuty,
  deleteDuty,
  
  // Roster
  prevRosterWeek,
  nextRosterWeek,
  goToCurrentWeek,
  showAddRosterEntry,
  editRosterEntry,
  saveRosterEntry,
  onTemplateSelect,
  confirmDeleteRosterEntry,
  showCopyWeekModal,
  copyWeek,
  
  // Dispatch
  showAssignModal,
  assignShift,
};

document.addEventListener('DOMContentLoaded', init);
