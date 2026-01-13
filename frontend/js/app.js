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
  
  // Filters
  employeeFilters: {
    search: '',
    role: '',
    status: '',
  },
  vehicleFilters: {
    search: '',
    status: '',
  },
  
  // Selection state
  selectedItem: null,
  editingEmployee: null,
  editingVehicle: null,
  
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
// MODAL MANAGEMENT
// ============================================

function showModal(title, bodyHtml, footerHtml) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalFooter').innerHTML = footerHtml;
  $('#modalOverlay').classList.add('active');
}

function closeModal() {
  $('#modalOverlay').classList.remove('active');
  state.editingEmployee = null;
  state.editingVehicle = null;
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
  $('#hideSidebar').textContent = state.sidebarCollapsed ? '▶ Show' : '◀ Hide';
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

// ============================================
// EMPLOYEES / HRM
// ============================================

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
    const params = {};
    if (state.employeeFilters.search) params.search = state.employeeFilters.search;
    if (state.employeeFilters.role) params.role = state.employeeFilters.role;
    if (state.employeeFilters.status) params.status = state.employeeFilters.status;
    
    const result = await api.getEmployees(params);
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

function renderEmployees() {
  const container = $('#screen-hrm');
  const employees = state.employees;
  const filters = state.employeeFilters;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Employees</h2>
      <button class="btn btn-primary" onclick="window.app.showAddEmployee()">+ Add Employee</button>
    </div>
    
    <div class="filter-bar">
      <input 
        type="text" 
        class="form-input filter-search" 
        placeholder="Search by name, ID, email..." 
        value="${filters.search}"
        onkeyup="window.app.handleEmployeeSearch(event)"
      />
      <select class="form-select filter-select" onchange="window.app.handleEmployeeRoleFilter(event)">
        <option value="">All Roles</option>
        <option value="driver" ${filters.role === 'driver' ? 'selected' : ''}>Drivers</option>
        <option value="dispatcher" ${filters.role === 'dispatcher' ? 'selected' : ''}>Dispatchers</option>
        <option value="admin" ${filters.role === 'admin' ? 'selected' : ''}>Admins</option>
      </select>
      <select class="form-select filter-select" onchange="window.app.handleEmployeeStatusFilter(event)">
        <option value="">All Statuses</option>
        <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        <option value="terminated" ${filters.status === 'terminated' ? 'selected' : ''}>Terminated</option>
      </select>
    </div>
    
    <div class="screen-content">
      ${employees.length === 0 ? `
        <div class="empty-state">
          <h3>No employees found</h3>
          <p class="text-muted">
            ${filters.search || filters.role || filters.status 
              ? 'Try adjusting your filters.' 
              : 'Add your first employee to get started.'}
          </p>
        </div>
      ` : `
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
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${employees.map(e => `
                <tr>
                  <td class="font-mono">${e.employee_number}</td>
                  <td>
                    <div class="employee-name">${e.first_name} ${e.last_name}</div>
                    ${e.email ? `<div class="employee-email text-muted">${e.email}</div>` : ''}
                  </td>
                  <td>${e.phone || '—'}</td>
                  <td>
                    ${e.licence_number ? `
                      <span class="font-mono">${e.licence_number}</span>
                      ${e.licence_expiry ? `<div class="text-muted" style="font-size:11px">Exp: ${e.licence_expiry}</div>` : ''}
                    ` : '—'}
                  </td>
                  <td><span class="badge badge-info">${e.role}</span></td>
                  <td><span class="badge ${getStatusBadgeClass(e.status)}">${e.status}</span></td>
                  <td class="text-right">
                    <button class="btn btn-secondary btn-sm" onclick="window.app.editEmployee('${e.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="window.app.confirmDeleteEmployee('${e.id}', '${e.first_name} ${e.last_name}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'active': return 'badge-success';
    case 'inactive': return 'badge-warning';
    case 'terminated': return 'badge-error';
    case 'sold': return 'badge-error';
    default: return 'badge-info';
  }
}

// Employee search with debounce
let employeeSearchTimeout;
function handleEmployeeSearch(event) {
  clearTimeout(employeeSearchTimeout);
  employeeSearchTimeout = setTimeout(() => {
    state.employeeFilters.search = event.target.value;
    loadEmployees();
  }, 300);
}

function handleEmployeeRoleFilter(event) {
  state.employeeFilters.role = event.target.value;
  loadEmployees();
}

function handleEmployeeStatusFilter(event) {
  state.employeeFilters.status = event.target.value;
  loadEmployees();
}

// Add/Edit Employee Modal
function showAddEmployee() {
  state.editingEmployee = null;
  showEmployeeForm();
}

function editEmployee(id) {
  const employee = state.employees.find(e => e.id === id);
  if (!employee) {
    showToast('Employee not found', 'error');
    return;
  }
  state.editingEmployee = employee;
  showEmployeeForm();
}

function showEmployeeForm() {
  const emp = state.editingEmployee;
  const isEdit = !!emp;
  
  const bodyHtml = `
    <form id="employeeForm" class="form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Employee Number *</label>
          <input type="text" name="employee_number" class="form-input" 
                 value="${emp?.employee_number || ''}" 
                 placeholder="e.g. D001" required />
        </div>
        <div class="form-group">
          <label class="form-label">Role *</label>
          <select name="role" class="form-select" required>
            <option value="driver" ${emp?.role === 'driver' ? 'selected' : ''}>Driver</option>
            <option value="dispatcher" ${emp?.role === 'dispatcher' ? 'selected' : ''}>Dispatcher</option>
            <option value="admin" ${emp?.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name *</label>
          <input type="text" name="first_name" class="form-input" 
                 value="${emp?.first_name || ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Last Name *</label>
          <input type="text" name="last_name" class="form-input" 
                 value="${emp?.last_name || ''}" required />
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" name="email" class="form-input" 
                 value="${emp?.email || ''}" placeholder="email@example.com" />
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input type="tel" name="phone" class="form-input" 
                 value="${emp?.phone || ''}" placeholder="04XX XXX XXX" />
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Licence Number</label>
          <input type="text" name="licence_number" class="form-input" 
                 value="${emp?.licence_number || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Licence Expiry</label>
          <input type="date" name="licence_expiry" class="form-input" 
                 value="${emp?.licence_expiry || ''}" />
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Hire Date</label>
          <input type="date" name="hire_date" class="form-input" 
                 value="${emp?.hire_date || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="active" ${!emp || emp?.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${emp?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="terminated" ${emp?.status === 'terminated' ? 'selected' : ''}>Terminated</option>
          </select>
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea name="notes" class="form-input form-textarea" rows="3">${emp?.notes || ''}</textarea>
      </div>
    </form>
  `;
  
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveEmployee()">${isEdit ? 'Save Changes' : 'Add Employee'}</button>
  `;
  
  showModal(isEdit ? 'Edit Employee' : 'Add Employee', bodyHtml, footerHtml);
}

async function saveEmployee() {
  const form = document.getElementById('employeeForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const formData = new FormData(form);
  const data = {
    employee_number: formData.get('employee_number'),
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    email: formData.get('email') || null,
    phone: formData.get('phone') || null,
    licence_number: formData.get('licence_number') || null,
    licence_expiry: formData.get('licence_expiry') || null,
    role: formData.get('role'),
    status: formData.get('status'),
    hire_date: formData.get('hire_date') || null,
    notes: formData.get('notes') || null,
  };
  
  try {
    if (state.editingEmployee) {
      await api.updateEmployee(state.editingEmployee.id, data);
      showToast('Employee updated successfully');
    } else {
      await api.createEmployee(data);
      showToast('Employee added successfully');
    }
    closeModal();
    loadEmployees();
  } catch (err) {
    showToast(err.message || 'Failed to save employee', 'error');
  }
}

function confirmDeleteEmployee(id, name) {
  showDeleteModal(
    `Are you sure you want to delete <strong>${name}</strong>?<br><br>This action cannot be undone.`,
    () => deleteEmployee(id)
  );
}

async function deleteEmployee(id) {
  try {
    await api.deleteEmployee(id);
    showToast('Employee deleted');
    closeDeleteModal();
    loadEmployees();
  } catch (err) {
    showToast(err.message || 'Failed to delete employee', 'error');
  }
}

// ============================================
// VEHICLES
// ============================================

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
    const params = {};
    if (state.vehicleFilters.search) params.search = state.vehicleFilters.search;
    if (state.vehicleFilters.status) params.status = state.vehicleFilters.status;
    
    const result = await api.getVehicles(params);
    state.vehicles = result.data || [];
    renderVehicles();
  } catch (err) {
    console.error('Failed to load vehicles:', err);
    container.innerHTML = `
      <div class="screen-placeholder">
        <h2>Failed to load vehicles</h2>
        <p>${err.message}</p>
        <button class="btn btn-primary mt-4" onclick="window.app.loadVehicles()">Retry</button>
      </div>
    `;
  } finally {
    state.loading.vehicles = false;
  }
}

function renderVehicles() {
  const container = $('#screen-vehicles');
  const vehicles = state.vehicles;
  const filters = state.vehicleFilters;
  
  container.innerHTML = `
    <div class="screen-header">
      <h2>Vehicles</h2>
      <button class="btn btn-primary" onclick="window.app.showAddVehicle()">+ Add Vehicle</button>
    </div>
    
    <div class="filter-bar">
      <input 
        type="text" 
        class="form-input filter-search" 
        placeholder="Search by fleet #, rego, make..." 
        value="${filters.search}"
        onkeyup="window.app.handleVehicleSearch(event)"
      />
      <select class="form-select filter-select" onchange="window.app.handleVehicleStatusFilter(event)">
        <option value="">All Statuses</option>
        <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        <option value="sold" ${filters.status === 'sold' ? 'selected' : ''}>Sold</option>
      </select>
    </div>
    
    <div class="screen-content">
      ${vehicles.length === 0 ? `
        <div class="empty-state">
          <h3>No vehicles found</h3>
          <p class="text-muted">
            ${filters.search || filters.status 
              ? 'Try adjusting your filters.' 
              : 'Add your first vehicle to get started.'}
          </p>
        </div>
      ` : `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Fleet #</th>
                <th>Rego</th>
                <th>Capacity</th>
                <th>Make / Model</th>
                <th>Year</th>
                <th>Status</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${vehicles.map(v => `
                <tr>
                  <td class="font-mono">${v.fleet_number}</td>
                  <td class="font-mono">${v.rego}</td>
                  <td>${v.capacity} seats</td>
                  <td>
                    ${v.make || v.model ? `
                      <div>${v.make || ''} ${v.model || ''}</div>
                    ` : '—'}
                  </td>
                  <td>${v.year || '—'}</td>
                  <td><span class="badge ${getStatusBadgeClass(v.status)}">${v.status}</span></td>
                  <td class="text-right">
                    <button class="btn btn-secondary btn-sm" onclick="window.app.editVehicle('${v.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="window.app.confirmDeleteVehicle('${v.id}', '${v.fleet_number}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// Vehicle search with debounce
let vehicleSearchTimeout;
function handleVehicleSearch(event) {
  clearTimeout(vehicleSearchTimeout);
  vehicleSearchTimeout = setTimeout(() => {
    state.vehicleFilters.search = event.target.value;
    loadVehicles();
  }, 300);
}

function handleVehicleStatusFilter(event) {
  state.vehicleFilters.status = event.target.value;
  loadVehicles();
}

// Add/Edit Vehicle Modal
function showAddVehicle() {
  state.editingVehicle = null;
  showVehicleForm();
}

function editVehicle(id) {
  const vehicle = state.vehicles.find(v => v.id === id);
  if (!vehicle) {
    showToast('Vehicle not found', 'error');
    return;
  }
  state.editingVehicle = vehicle;
  showVehicleForm();
}

function showVehicleForm() {
  const veh = state.editingVehicle;
  const isEdit = !!veh;
  
  const bodyHtml = `
    <form id="vehicleForm" class="form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fleet Number *</label>
          <input type="text" name="fleet_number" class="form-input" 
                 value="${veh?.fleet_number || ''}" 
                 placeholder="e.g. BUS-101" required />
        </div>
        <div class="form-group">
          <label class="form-label">Registration *</label>
          <input type="text" name="rego" class="form-input" 
                 value="${veh?.rego || ''}" 
                 placeholder="e.g. ABC123" required />
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Capacity (seats) *</label>
          <input type="number" name="capacity" class="form-input" 
                 value="${veh?.capacity || ''}" 
                 placeholder="e.g. 50" min="1" required />
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="active" ${!veh || veh?.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="inactive" ${veh?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            <option value="sold" ${veh?.status === 'sold' ? 'selected' : ''}>Sold</option>
          </select>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Make</label>
          <input type="text" name="make" class="form-input" 
                 value="${veh?.make || ''}" 
                 placeholder="e.g. Mercedes" />
        </div>
        <div class="form-group">
          <label class="form-label">Model</label>
          <input type="text" name="model" class="form-input" 
                 value="${veh?.model || ''}" 
                 placeholder="e.g. Sprinter" />
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Year</label>
          <input type="number" name="year" class="form-input" 
                 value="${veh?.year || ''}" 
                 placeholder="e.g. 2020" min="1900" max="2099" />
        </div>
        <div class="form-group">
          <label class="form-label">VIN</label>
          <input type="text" name="vin" class="form-input" 
                 value="${veh?.vin || ''}" 
                 placeholder="Vehicle identification number" />
        </div>
      </div>
      
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea name="notes" class="form-input form-textarea" rows="3">${veh?.notes || ''}</textarea>
      </div>
    </form>
  `;
  
  const footerHtml = `
    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="window.app.saveVehicle()">${isEdit ? 'Save Changes' : 'Add Vehicle'}</button>
  `;
  
  showModal(isEdit ? 'Edit Vehicle' : 'Add Vehicle', bodyHtml, footerHtml);
}

async function saveVehicle() {
  const form = document.getElementById('vehicleForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  
  const formData = new FormData(form);
  const data = {
    fleet_number: formData.get('fleet_number'),
    rego: formData.get('rego'),
    capacity: parseInt(formData.get('capacity')),
    make: formData.get('make') || null,
    model: formData.get('model') || null,
    year: formData.get('year') ? parseInt(formData.get('year')) : null,
    vin: formData.get('vin') || null,
    status: formData.get('status'),
    notes: formData.get('notes') || null,
  };
  
  try {
    if (state.editingVehicle) {
      await api.updateVehicle(state.editingVehicle.id, data);
      showToast('Vehicle updated successfully');
    } else {
      await api.createVehicle(data);
      showToast('Vehicle added successfully');
    }
    closeModal();
    loadVehicles();
  } catch (err) {
    showToast(err.message || 'Failed to save vehicle', 'error');
  }
}

function confirmDeleteVehicle(id, fleetNumber) {
  showDeleteModal(
    `Are you sure you want to delete vehicle <strong>${fleetNumber}</strong>?<br><br>This action cannot be undone.`,
    () => deleteVehicle(id)
  );
}

async function deleteVehicle(id) {
  try {
    await api.deleteVehicle(id);
    showToast('Vehicle deleted');
    closeDeleteModal();
    loadVehicles();
  } catch (err) {
    showToast(err.message || 'Failed to delete vehicle', 'error');
  }
}

// ============================================
// SHIFT TEMPLATES (placeholder)
// ============================================

async function loadShiftTemplates() {
  const container = $('#screen-shifts');
  container.innerHTML = `
    <div class="screen-placeholder">
      <h2>Shift Templates</h2>
      <p>Template builder coming soon.</p>
    </div>
  `;
}

// ============================================
// ROSTER (placeholder)
// ============================================

async function loadRosterWeek() {
  const container = $('#screen-roster');
  container.innerHTML = `
    <div class="screen-placeholder">
      <h2>Roster</h2>
      <p>Schedule management coming soon.</p>
    </div>
  `;
}

// ============================================
// DISPATCH
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
          <h3>Drivers (${drivers.filter(d => d.shifts.length > 0).length} working)</h3>
        </div>
        <div class="section-body">
          ${drivers.filter(d => d.shifts.length > 0 || d.daily_status !== 'available').length === 0 
            ? '<div class="empty-message">No drivers assigned for today</div>' 
            : drivers.filter(d => d.shifts.length > 0 || d.daily_status !== 'available').map(d => renderDriverRow(d)).join('')}
        </div>
      </div>
      
      <div class="dispatch-section">
        <div class="section-header">
          <h3>Unassigned Jobs (${unassigned.length})</h3>
        </div>
        <div class="section-body">
          ${unassigned.length === 0 
            ? '<div class="empty-message">All jobs assigned ✓</div>' 
            : unassigned.map(j => renderUnassignedRow(j)).join('')}
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
  const startPct = ((shift.start_time - 5) / 19) * 100;
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
      <button class="btn btn-secondary btn-sm">Assign</button>
    </div>
  `;
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
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  $('#deleteModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
  
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
    $('#connectionStatus').title = 'Connected';
  } catch (err) {
    console.error('API connection failed:', err);
    $('#connectionStatus').classList.add('offline');
    $('#connectionStatus').title = 'Disconnected';
    showToast('API connection failed', 'error');
  }
  
  // Load initial screen
  loadScreenData(state.currentScreen);
}

// ============================================
// EXPORT FOR HTML
// ============================================

window.app = {
  // Data loading
  loadDispatch,
  loadEmployees,
  loadVehicles,
  
  // Modal
  closeModal,
  closeDeleteModal,
  
  // Employees
  showAddEmployee,
  editEmployee,
  saveEmployee,
  confirmDeleteEmployee,
  handleEmployeeSearch,
  handleEmployeeRoleFilter,
  handleEmployeeStatusFilter,
  
  // Vehicles
  showAddVehicle,
  editVehicle,
  saveVehicle,
  confirmDeleteVehicle,
  handleVehicleSearch,
  handleVehicleStatusFilter,
};

// Start app
document.addEventListener('DOMContentLoaded', init);
