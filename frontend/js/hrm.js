// ============================================
// EMPLOYEES CRUD
// ============================================
let employeesData = [];
let employeeFiltersState = { search: '', role: '' };
let editingEmployeeId = null;

async function loadEmployees() {
  const tbody = document.getElementById('employeesTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading employees...</td></tr>';
  
  try {
    const params = new URLSearchParams();
    if (employeeFiltersState.search) params.set('search', employeeFiltersState.search);
    if (employeeFiltersState.role) params.set('role', employeeFiltersState.role);
    
    const result = await apiRequest(`/employees?${params}`);
    employeesData = result.data || [];
    renderEmployeesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderEmployeesTable() {
  const tbody = document.getElementById('employeesTableBody');
  if (employeesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No employees found</td></tr>';
    return;
  }
  
  tbody.innerHTML = employeesData.map(e => `
    <tr>
      <td style="font-family: 'JetBrains Mono', monospace;">${e.employee_number}</td>
      <td>${e.first_name} ${e.last_name}</td>
      <td>${e.phone || '—'}</td>
      <td style="font-family: 'JetBrains Mono', monospace;">${e.licence_number || '—'}</td>
      <td><span class="badge badge-info">${e.role}</span></td>
      <td><span class="badge ${e.status === 'active' ? 'badge-success' : 'badge-warning'}">${e.status}</span></td>
      <td>
        <button class="action-btn" onclick="editEmployee('${e.id}')">Edit</button>
        <button class="action-btn danger" onclick="deleteEmployee('${e.id}', '${e.first_name} ${e.last_name}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

let employeeSearchTimeout;
function filterEmployees(search) {
  clearTimeout(employeeSearchTimeout);
  employeeSearchTimeout = setTimeout(() => {
    employeeFiltersState.search = search;
    loadEmployees();
  }, 300);
}

function filterEmployeeRole(role) {
  employeeFiltersState.role = role;
  loadEmployees();
}

// Custom fields state
let customFieldDefinitions = [];
let editingCustomFieldId = null;

// Switch employee modal tabs
function switchEmployeeTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('#employeeModalOverlay .modal-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');
  
  // Update tab content
  document.querySelectorAll('#employeeModalOverlay .modal-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  if (tabName === 'general') {
    document.getElementById('empTabGeneral').classList.add('active');
  } else if (tabName === 'custom') {
    document.getElementById('empTabCustom').classList.add('active');
  } else if (tabName === 'payrecords') {
    document.getElementById('empTabPayRecords').classList.add('active');
    // Load pay records if we have an employee ID
    if (editingEmployeeId) {
      loadEmployeePayRecords(editingEmployeeId);
    }
  }
}

async function showAddEmployeeModal() {
  editingEmployeeId = null;
  document.getElementById('employeeModalTitle').textContent = 'Add Employee';
  document.getElementById('employeeForm').reset();
  
  // Reset to General tab
  document.querySelectorAll('#employeeModalOverlay .modal-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 0);
  });
  document.getElementById('empTabGeneral').classList.add('active');
  document.getElementById('empTabCustom').classList.remove('active');
  
  // Hide Pay Records tab for new employees
  const payRecordsTab = document.querySelector('#employeeModalOverlay .modal-tab[onclick*="payrecords"]');
  if (payRecordsTab) payRecordsTab.style.display = 'none';
  const payRecordsContent = document.getElementById('empTabPayRecords');
  if (payRecordsContent) payRecordsContent.classList.remove('active');
  
  // Load pay types dropdown
  await populatePayTypeDropdown();
  
  // Load custom fields (empty for new employee)
  await loadCustomFieldsForEmployee(null);
  
  document.getElementById('employeeModalOverlay').classList.add('show');
}

async function editEmployee(id) {
  const emp = employeesData.find(e => e.id === id);
  if (!emp) return;
  
  editingEmployeeId = id;
  document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
  document.getElementById('empNumber').value = emp.employee_number || '';
  document.getElementById('empFirstName').value = emp.first_name || '';
  document.getElementById('empLastName').value = emp.last_name || '';
  document.getElementById('empEmail').value = emp.email || '';
  document.getElementById('empPhone').value = emp.phone || '';
  document.getElementById('empLicence').value = emp.licence_number || '';
  document.getElementById('empRole').value = emp.role || 'driver';
  document.getElementById('empStatus').value = emp.status || 'active';
  
  // Load pay types dropdown and set value
  await populatePayTypeDropdown(emp.default_pay_type_id);
  
  // Reset to General tab
  document.querySelectorAll('#employeeModalOverlay .modal-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 0);
  });
  document.getElementById('empTabGeneral').classList.add('active');
  document.getElementById('empTabCustom').classList.remove('active');
  const payRecordsContent = document.getElementById('empTabPayRecords');
  if (payRecordsContent) payRecordsContent.classList.remove('active');
  
  // Show Pay Records tab for existing employees
  const payRecordsTab = document.querySelector('#employeeModalOverlay .modal-tab[onclick*="payrecords"]');
  if (payRecordsTab) payRecordsTab.style.display = '';
  
  // Load custom fields with values for this employee
  await loadCustomFieldsForEmployee(id);
  
  // Reset pay records filters
  resetPayRecordsFilters();
  
  document.getElementById('employeeModalOverlay').classList.add('show');
}

function closeEmployeeModal() {
  document.getElementById('employeeModalOverlay').classList.remove('show');
  editingEmployeeId = null;
}

async function populatePayTypeDropdown(selectedId = null) {
  const select = document.getElementById('empDefaultPayType');
  
  // If we already have payTypesData loaded, use it
  let data = payTypesData;
  
  // If not loaded yet, fetch from API
  if (!data || data.length === 0) {
    try {
      const result = await apiRequest('/pay-types');
      data = result.data || [];
    } catch (err) {
      console.error('Failed to load pay types:', err);
      data = [];
    }
  }
  
  // Build options
  let html = '<option value="">-- Select Pay Type --</option>';
  data.filter(pt => pt.is_active).forEach(pt => {
    const selected = pt.id === selectedId ? 'selected' : '';
    html += `<option value="${pt.id}" ${selected}>${escapeHtml(pt.code)} - ${escapeHtml(pt.name)} ($${parseFloat(pt.hourly_rate).toFixed(2)}/hr)</option>`;
  });
  
  select.innerHTML = html;
}

async function saveEmployee() {
  const data = {
    employee_number: document.getElementById('empNumber').value,
    first_name: document.getElementById('empFirstName').value,
    last_name: document.getElementById('empLastName').value,
    email: document.getElementById('empEmail').value || null,
    phone: document.getElementById('empPhone').value || null,
    licence_number: document.getElementById('empLicence').value || null,
    role: document.getElementById('empRole').value,
    status: document.getElementById('empStatus').value,
    default_pay_type_id: document.getElementById('empDefaultPayType').value || null,
  };
  
  // Validate required custom fields
  const requiredFields = document.querySelectorAll('.custom-field-input[data-required="true"]');
  for (const field of requiredFields) {
    const value = field.type === 'checkbox' ? field.checked : field.value;
    if (!value || value === '') {
      const fieldName = field.getAttribute('data-field-name') || 'Field';
      showToast(`${fieldName} is required`, 'error');
      // Switch to Custom Fields tab
      document.querySelectorAll('#employeeModalOverlay .modal-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === 1);
      });
      document.getElementById('empTabGeneral').classList.remove('active');
      document.getElementById('empTabCustom').classList.add('active');
      field.focus();
      return;
    }
  }
  
  try {
    let employeeId = editingEmployeeId;
    
    if (editingEmployeeId) {
      await apiRequest(`/employees/${editingEmployeeId}`, { method: 'PUT', body: data });
    } else {
      const result = await apiRequest('/employees', { method: 'POST', body: data });
      employeeId = result.data?.id;
    }
    
    // Save custom field values
    if (employeeId) {
      await saveCustomFieldValues(employeeId);
    }
    
    showToast(editingEmployeeId ? 'Employee updated' : 'Employee added');
    closeEmployeeModal();
    loadEmployees();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

// ============================================
// CUSTOM FIELDS - EMPLOYEE VALUES
// ============================================

async function loadCustomFieldsForEmployee(employeeId) {
  const container = document.getElementById('empCustomFieldsContainer');
  
  try {
    // Load field definitions
    const defsResult = await apiRequest('/employee-fields/definitions');
    customFieldDefinitions = defsResult.data || [];
    
    if (customFieldDefinitions.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-muted);">
          <p>No custom fields defined yet.</p>
          <p style="font-size: 12px; margin-top: 8px;">Click the ⚙️ settings button to add custom fields.</p>
        </div>
      `;
      return;
    }
    
    // Load values if editing existing employee
    let fieldValues = {};
    if (employeeId) {
      const valuesResult = await apiRequest(`/employee-fields/values/${employeeId}`);
      if (valuesResult.data) {
        for (const field of valuesResult.data) {
          fieldValues[field.id] = field.value;
        }
      }
    }
    
    // Render custom field inputs with grid layout
    let html = '<div class="custom-fields-grid">';
    
    // Group fields by row
    const fieldsByRow = {};
    for (const field of customFieldDefinitions) {
      const row = field.display_row || 0;
      if (!fieldsByRow[row]) fieldsByRow[row] = [];
      fieldsByRow[row].push(field);
    }
    
    // Sort rows and render
    const rowNumbers = Object.keys(fieldsByRow).map(Number).sort((a, b) => a - b);
    
    for (const rowNum of rowNumbers) {
      const rowFields = fieldsByRow[rowNum];
      html += `<div class="custom-fields-row">`;
      
      for (const field of rowFields) {
        const value = fieldValues[field.id] || '';
        const required = field.is_required ? ' *' : '';
        const requiredAttr = field.is_required ? 'data-required="true"' : '';
        const fieldWidth = field.field_width || 'full';
        const widthClass = fieldWidth === 'half' ? 'half-width' : 'full-width';
        
        html += `<div class="form-group custom-field-group ${widthClass}">`;
        html += `<label class="form-label">${escapeHtml(field.field_name)}${required}</label>`;
        
        switch (field.field_type) {
          case 'text':
            html += `<input type="text" class="form-input custom-field-input" data-field-id="${field.id}" data-field-name="${escapeHtml(field.field_name)}" value="${escapeHtml(value)}" ${requiredAttr}>`;
            break;
          case 'number':
            html += `<input type="number" class="form-input custom-field-input" data-field-id="${field.id}" data-field-name="${escapeHtml(field.field_name)}" value="${escapeHtml(value)}" ${requiredAttr}>`;
            break;
          case 'date':
            html += `<div class="date-input-wrapper">`;
            html += `<input type="date" class="form-input custom-field-input" id="cf_${field.id}" data-field-id="${field.id}" data-field-name="${escapeHtml(field.field_name)}" value="${escapeHtml(value)}" ${requiredAttr}>`;
            html += `<button type="button" class="date-picker-btn" onclick="document.getElementById('cf_${field.id}').showPicker()">📅</button>`;
            html += `</div>`;
            break;
          case 'boolean':
            const checked = value === 'true' || value === '1' ? 'checked' : '';
            html += `<label class="checkbox-wrapper"><input type="checkbox" class="custom-field-input" data-field-id="${field.id}" data-field-name="${escapeHtml(field.field_name)}" ${checked}><span class="checkbox-label">Yes</span></label>`;
            break;
          case 'select':
            html += `<select class="form-input custom-field-input" data-field-id="${field.id}" data-field-name="${escapeHtml(field.field_name)}" ${requiredAttr}>`;
            html += `<option value="">-- Select --</option>`;
            if (field.field_options && Array.isArray(field.field_options)) {
              for (const opt of field.field_options) {
                const selected = value === opt ? 'selected' : '';
                html += `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt)}</option>`;
              }
            }
            html += `</select>`;
            break;
        }
        
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += '</div>';
    
    container.innerHTML = html;
  } catch (err) {
    console.error('Failed to load custom fields:', err);
    container.innerHTML = `<div style="padding: 20px; color: var(--accent-red);">Failed to load custom fields</div>`;
  }
}

async function saveCustomFieldValues(employeeId) {
  const inputs = document.querySelectorAll('.custom-field-input');
  const values = [];
  
  for (const input of inputs) {
    const fieldId = input.getAttribute('data-field-id');
    let value;
    
    if (input.type === 'checkbox') {
      value = input.checked ? 'true' : 'false';
    } else {
      value = input.value || null;
    }
    
    values.push({
      field_definition_id: fieldId,
      value: value
    });
  }
  
  if (values.length > 0) {
    await apiRequest('/employee-fields/values/bulk', {
      method: 'POST',
      body: {
        employee_id: employeeId,
        values: values
      }
    });
  }
}

// ============================================
// CUSTOM FIELDS - SETTINGS/DEFINITIONS
// ============================================

async function showEmployeeFieldsSettings() {
  await loadCustomFieldDefinitions();
  document.getElementById('employeeFieldsSettingsOverlay').classList.add('show');
}

function closeEmployeeFieldsSettings() {
  document.getElementById('employeeFieldsSettingsOverlay').classList.remove('show');
}

// Switch tabs in settings modal
function switchFieldsSettingsTab(tabName) {
  document.querySelectorAll('#employeeFieldsSettingsOverlay .modal-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  event.target.classList.add('active');
  
  document.querySelectorAll('#employeeFieldsSettingsOverlay .modal-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  if (tabName === 'fields') {
    document.getElementById('fieldsTabFields').classList.add('active');
  } else if (tabName === 'layout') {
    document.getElementById('fieldsTabLayout').classList.add('active');
    // Initialize row count based on existing fields
    layoutRowCount = 0;
    for (const field of customFieldDefinitions) {
      layoutRowCount = Math.max(layoutRowCount, (field.display_row ?? 0) + 1);
    }
    if (layoutRowCount === 0) layoutRowCount = 1;
    renderLayoutEditor();
  }
}

// Layout editor state
let layoutRows = [];
let draggedFieldId = null;
let layoutRowCount = 0; // Track total rows including empty ones

function renderLayoutEditor() {
  const container = document.getElementById('layoutPreview');
  
  if (customFieldDefinitions.length === 0) {
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">No fields to arrange. Add fields first.</div>`;
    return;
  }
  
  // Group fields by row
  const fieldsByRow = {};
  let maxRow = -1;
  
  for (const field of customFieldDefinitions) {
    const row = field.display_row ?? 0;
    if (!fieldsByRow[row]) fieldsByRow[row] = [];
    fieldsByRow[row].push(field);
    maxRow = Math.max(maxRow, row);
  }
  
  // Ensure we show at least as many rows as layoutRowCount
  maxRow = Math.max(maxRow, layoutRowCount - 1);
  if (maxRow < 0) maxRow = 0;
  
  const typeLabels = {
    text: 'Text',
    number: 'Number',
    date: 'Date',
    boolean: 'Yes/No',
    select: 'Dropdown'
  };
  
  let html = '';
  for (let rowNum = 0; rowNum <= maxRow; rowNum++) {
    const rowFields = fieldsByRow[rowNum] || [];
    html += `<div class="layout-row" data-row="${rowNum}" ondragover="handleLayoutDragOver(event)" ondrop="handleLayoutDrop(event, ${rowNum})" ondragleave="handleLayoutDragLeave(event)">`;
    
    if (rowFields.length === 0) {
      html += `<div style="flex: 1; padding: 12px; text-align: center; color: var(--text-muted); font-size: 12px;">Drop fields here (Row ${rowNum + 1})</div>`;
    } else {
      for (const field of rowFields) {
        const width = field.field_width || 'full';
        const typeLabel = typeLabels[field.field_type] || field.field_type;
        html += `
          <div class="layout-field ${width}-width" draggable="true" data-field-id="${field.id}"
               ondragstart="handleLayoutDragStart(event, '${field.id}')" ondragend="handleLayoutDragEnd(event)">
            <div>
              <span class="layout-field-name">${escapeHtml(field.field_name)}</span>
              <span class="layout-field-type">${typeLabel}</span>
            </div>
            <div class="layout-field-controls">
              <button onclick="toggleFieldWidth('${field.id}')" title="Toggle width">${width === 'half' ? '◧' : '▣'}</button>
              <button onclick="moveFieldUp('${field.id}')" title="Move up">↑</button>
              <button onclick="moveFieldDown('${field.id}')" title="Move down">↓</button>
            </div>
          </div>
        `;
      }
    }
    html += `</div>`;
  }
  
  container.innerHTML = html;
}

function handleLayoutDragStart(event, fieldId) {
  draggedFieldId = fieldId;
  event.target.classList.add('dragging');
}

function handleLayoutDragEnd(event) {
  event.target.classList.remove('dragging');
  draggedFieldId = null;
}

function handleLayoutDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drop-target');
}

function handleLayoutDragLeave(event) {
  event.currentTarget.classList.remove('drop-target');
}

async function handleLayoutDrop(event, targetRow) {
  event.preventDefault();
  event.currentTarget.classList.remove('drop-target');
  
  if (!draggedFieldId) return;
  
  const field = customFieldDefinitions.find(f => f.id === draggedFieldId);
  if (!field) return;
  
  // Update row
  field.display_row = targetRow;
  
  // Save to backend
  try {
    await apiRequest(`/employee-fields/definitions/${field.id}`, {
      method: 'PUT',
      body: { display_row: targetRow }
    });
    renderLayoutEditor();
  } catch (err) {
    showToast('Failed to update layout', 'error');
  }
}

async function toggleFieldWidth(fieldId) {
  const field = customFieldDefinitions.find(f => f.id === fieldId);
  if (!field) return;
  
  const newWidth = field.field_width === 'half' ? 'full' : 'half';
  field.field_width = newWidth;
  
  try {
    await apiRequest(`/employee-fields/definitions/${fieldId}`, {
      method: 'PUT',
      body: { field_width: newWidth }
    });
    renderLayoutEditor();
  } catch (err) {
    showToast('Failed to update width', 'error');
  }
}

async function moveFieldUp(fieldId) {
  const field = customFieldDefinitions.find(f => f.id === fieldId);
  if (!field || field.display_row <= 0) return;
  
  field.display_row--;
  
  try {
    await apiRequest(`/employee-fields/definitions/${fieldId}`, {
      method: 'PUT',
      body: { display_row: field.display_row }
    });
    renderLayoutEditor();
  } catch (err) {
    showToast('Failed to move field', 'error');
  }
}

async function moveFieldDown(fieldId) {
  const field = customFieldDefinitions.find(f => f.id === fieldId);
  if (!field) return;
  
  field.display_row++;
  layoutRowCount = Math.max(layoutRowCount, field.display_row + 1);
  
  try {
    await apiRequest(`/employee-fields/definitions/${fieldId}`, {
      method: 'PUT',
      body: { display_row: field.display_row }
    });
    renderLayoutEditor();
  } catch (err) {
    showToast('Failed to move field', 'error');
  }
}

function addLayoutRow() {
  layoutRowCount++;
  renderLayoutEditor();
}

async function loadCustomFieldDefinitions() {
  try {
    const result = await apiRequest('/employee-fields/definitions');
    customFieldDefinitions = result.data || [];
    renderFieldDefinitionsTable();
  } catch (err) {
    console.error('Failed to load field definitions:', err);
  }
}

function renderFieldDefinitionsTable() {
  const tbody = document.getElementById('fieldDefinitionsBody');
  
  if (customFieldDefinitions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">No custom fields defined. Click "+ Add Field" to create one.</td></tr>';
    return;
  }
  
  const typeLabels = {
    text: 'Text',
    number: 'Number',
    date: 'Date',
    boolean: 'Yes/No',
    select: 'Dropdown'
  };
  
  tbody.innerHTML = customFieldDefinitions.map(field => `
    <tr>
      <td>${escapeHtml(field.field_name)}</td>
      <td>${typeLabels[field.field_type] || field.field_type}</td>
      <td>${field.is_required ? '✓' : ''}</td>
      <td>${field.field_width === 'half' ? 'Half' : 'Full'}</td>
      <td>
        <button class="action-btn" onclick="editFieldDefinition('${field.id}')">Edit</button>
        <button class="action-btn danger" onclick="deleteFieldDefinition('${field.id}', '${escapeHtml(field.field_name)}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function showAddFieldModal() {
  editingCustomFieldId = null;
  document.getElementById('fieldModalTitle').textContent = 'Add Custom Field';
  document.getElementById('fieldDefForm').reset();
  document.getElementById('fieldOptionsGroup').style.display = 'none';
  document.getElementById('fieldDefModalOverlay').classList.add('show');
}

function editFieldDefinition(id) {
  const field = customFieldDefinitions.find(f => f.id === id);
  if (!field) return;
  
  editingCustomFieldId = id;
  document.getElementById('fieldModalTitle').textContent = 'Edit Custom Field';
  document.getElementById('fieldDefName').value = field.field_name || '';
  document.getElementById('fieldDefType').value = field.field_type || 'text';
  document.getElementById('fieldDefRequired').checked = field.is_required || false;
  document.getElementById('fieldDefWidth').value = field.field_width || 'full';
  document.getElementById('fieldDefOptions').value = (field.field_options || []).join('\n');
  
  // Show/hide options based on type
  document.getElementById('fieldOptionsGroup').style.display = 
    field.field_type === 'select' ? 'block' : 'none';
  
  document.getElementById('fieldDefModalOverlay').classList.add('show');
}

function closeFieldDefModal() {
  document.getElementById('fieldDefModalOverlay').classList.remove('show');
  editingCustomFieldId = null;
}

function onFieldTypeChange() {
  const type = document.getElementById('fieldDefType').value;
  document.getElementById('fieldOptionsGroup').style.display = 
    type === 'select' ? 'block' : 'none';
}

async function saveFieldDefinition() {
  const data = {
    field_name: document.getElementById('fieldDefName').value,
    field_type: document.getElementById('fieldDefType').value,
    is_required: document.getElementById('fieldDefRequired').checked,
    field_width: document.getElementById('fieldDefWidth').value,
    field_options: document.getElementById('fieldDefType').value === 'select'
      ? document.getElementById('fieldDefOptions').value.split('\n').map(s => s.trim()).filter(s => s)
      : null,
    display_row: editingCustomFieldId 
      ? customFieldDefinitions.find(f => f.id === editingCustomFieldId)?.display_row || 0
      : customFieldDefinitions.length > 0 
        ? Math.max(...customFieldDefinitions.map(f => f.display_row || 0)) + 1
        : 0
  };
  
  try {
    if (editingCustomFieldId) {
      await apiRequest(`/employee-fields/definitions/${editingCustomFieldId}`, {
        method: 'PUT',
        body: data
      });
      showToast('Field updated');
    } else {
      await apiRequest('/employee-fields/definitions', {
        method: 'POST',
        body: data
      });
      showToast('Field added');
    }
    closeFieldDefModal();
    await loadCustomFieldDefinitions();
  } catch (err) {
    showToast(err.message || 'Failed to save field', 'error');
  }
}

async function deleteFieldDefinition(id, name) {
  if (!confirm(`Delete field "${name}"? This will also delete all values for this field.`)) return;
  
  try {
    await apiRequest(`/employee-fields/definitions/${id}`, { method: 'DELETE' });
    showToast('Field deleted');
    await loadCustomFieldDefinitions();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

// ============================================
// CUSTOM FIELD MODAL MANAGEMENT
// ============================================

function showAddCustomFieldModal() {
  editingCustomFieldId = null;
  document.getElementById('customFieldModalTitle').textContent = 'Add Custom Field';
  document.getElementById('customFieldForm').reset();
  document.getElementById('customFieldOptionsGroup').style.display = 'none';
  document.getElementById('customFieldModalOverlay').classList.add('show');
}

async function editCustomField(id) {
  const field = customFieldDefinitions.find(f => f.id === id);
  if (!field) return;
  
  editingCustomFieldId = id;
  document.getElementById('customFieldModalTitle').textContent = 'Edit Custom Field';
  document.getElementById('customFieldId').value = id;
  document.getElementById('customFieldName').value = field.field_name;
  document.getElementById('customFieldKey').value = field.field_key;
  document.getElementById('customFieldType').value = field.field_type;
  document.getElementById('customFieldWidth').value = field.field_width || 'full';
  document.getElementById('customFieldRequired').checked = field.is_required;
  
  // Handle options for select type
  if (field.field_type === 'select' && field.field_options) {
    document.getElementById('customFieldOptions').value = field.field_options.join('\n');
    document.getElementById('customFieldOptionsGroup').style.display = 'block';
  } else {
    document.getElementById('customFieldOptions').value = '';
    document.getElementById('customFieldOptionsGroup').style.display = 'none';
  }
  
  document.getElementById('customFieldModalOverlay').classList.add('show');
}

function closeCustomFieldModal() {
  document.getElementById('customFieldModalOverlay').classList.remove('show');
  editingCustomFieldId = null;
}

function toggleFieldOptions() {
  const type = document.getElementById('customFieldType').value;
  document.getElementById('customFieldOptionsGroup').style.display = type === 'select' ? 'block' : 'none';
}

async function saveCustomField() {
  const data = {
    field_name: document.getElementById('customFieldName').value,
    field_key: document.getElementById('customFieldKey').value,
    field_type: document.getElementById('customFieldType').value,
    field_width: document.getElementById('customFieldWidth').value,
    is_required: document.getElementById('customFieldRequired').checked,
  };
  
  // Add options for select type
  if (data.field_type === 'select') {
    const optionsText = document.getElementById('customFieldOptions').value;
    data.field_options = optionsText.split('\n').map(o => o.trim()).filter(o => o);
    if (data.field_options.length === 0) {
      showToast('Please add at least one option for dropdown field', 'error');
      return;
    }
  }
  
  try {
    if (editingCustomFieldId) {
      await apiRequest(`/employee-fields/definitions/${editingCustomFieldId}`, { method: 'PUT', body: data });
      showToast('Custom field updated');
    } else {
      await apiRequest('/employee-fields/definitions', { method: 'POST', body: data });
      showToast('Custom field added');
    }
    closeCustomFieldModal();
    loadCustomFieldDefinitions();
  } catch (err) {
    showToast(err.message || 'Failed to save custom field', 'error');
  }
}

async function deleteCustomField(id, name) {
  if (!confirm(`Delete custom field "${name}"?\n\nThis will also delete all stored values for this field across all employees.`)) return;
  
  try {
    await apiRequest(`/employee-fields/definitions/${id}`, { method: 'DELETE' });
    showToast('Custom field deleted');
    loadCustomFieldDefinitions();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

async function saveFieldLayouts() {
  // Layout is saved automatically when dragging, this just confirms
  showToast('Layout saved');
}

async function loadCustomFieldDefinitions() {
  try {
    const result = await apiRequest('/employee-fields/definitions');
    customFieldDefinitions = result.data || [];
    renderCustomFieldsList();
  } catch (err) {
    console.error('Failed to load custom field definitions:', err);
  }
}

function renderCustomFieldsList() {
  const container = document.getElementById('customFieldsList');
  
  if (customFieldDefinitions.length === 0) {
    container.innerHTML = '<div class="custom-fields-empty">No custom fields defined yet.</div>';
    return;
  }
  
  const typeLabels = {
    text: 'Text',
    number: 'Number',
    date: 'Date',
    boolean: 'Yes/No',
    select: 'Dropdown'
  };
  
  container.innerHTML = customFieldDefinitions.map(field => `
    <div class="custom-field-item">
      <div class="custom-field-drag">⋮⋮</div>
      <div class="custom-field-info">
        <div class="custom-field-name">
          ${escapeHtml(field.field_name)}
          <span class="field-type-badge">${typeLabels[field.field_type] || field.field_type}</span>
          ${field.is_required ? '<span class="field-type-badge required">Required</span>' : ''}
        </div>
        <div class="custom-field-meta">Key: ${escapeHtml(field.field_key)} | Width: ${field.field_width === 'half' ? 'Half' : 'Full'}</div>
      </div>
      <div class="custom-field-actions">
        <button class="action-btn" onclick="editCustomField('${field.id}')">Edit</button>
        <button class="action-btn danger" onclick="deleteCustomField('${field.id}', '${escapeHtml(field.field_name)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

async function deleteEmployee(id, name) {
  if (!confirm(`Delete ${name}?`)) return;
  try {
    await apiRequest(`/employees/${id}`, { method: 'DELETE' });
    showToast('Employee deleted');
    loadEmployees();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}


// ============================================
// HRM TAB SWITCHING
// ============================================

let currentHrmTab = 'employees';

function switchHrmTab(tab) {
  currentHrmTab = tab;
  
  // Update tab buttons
  document.querySelectorAll('.hrm-tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().includes(tab.replace('-', ' ').split(' ')[0]));
  });
  
  // Update tab content
  document.querySelectorAll('.hrm-tab-content').forEach(c => {
    c.classList.remove('active');
  });
  
  if (tab === 'employees') {
    document.getElementById('hrmTabEmployees').classList.add('active');
  } else if (tab === 'pay-types') {
    document.getElementById('hrmTabPayTypes').classList.add('active');
    loadPayTypes();
  }
}

// ============================================
// PAY TYPES CRUD
// ============================================

let payTypesData = [];
let editingPayTypeId = null;

async function loadPayTypes() {
  const tbody = document.getElementById('payTypesTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Loading pay types...</td></tr>';
  
  try {
    const result = await apiRequest('/pay-types');
    payTypesData = result.data || [];
    renderPayTypesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderPayTypesTable() {
  const tbody = document.getElementById('payTypesTableBody');
  
  if (payTypesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No pay types found. Add one to get started.</td></tr>';
    return;
  }
  
  tbody.innerHTML = payTypesData.map(pt => `
    <tr>
      <td><strong>${escapeHtml(pt.code)}</strong></td>
      <td>${escapeHtml(pt.name)}</td>
      <td>$${parseFloat(pt.hourly_rate).toFixed(2)}</td>
      <td><span class="status-badge ${pt.is_active ? 'active' : 'inactive'}">${pt.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <button class="action-btn" onclick="editPayType('${pt.id}')">Edit</button>
        <button class="action-btn danger" onclick="deletePayType('${pt.id}', '${escapeHtml(pt.name)}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function showAddPayTypeModal() {
  editingPayTypeId = null;
  document.getElementById('payTypeModalTitle').textContent = 'Add Pay Type';
  document.getElementById('payTypeForm').reset();
  document.getElementById('payTypeOrder').value = '0';
  document.getElementById('payTypeStatus').value = '1';
  document.getElementById('payTypeModalOverlay').classList.add('show');
}

function editPayType(id) {
  const pt = payTypesData.find(p => p.id === id);
  if (!pt) return;
  
  editingPayTypeId = id;
  document.getElementById('payTypeModalTitle').textContent = 'Edit Pay Type';
  document.getElementById('payTypeCode').value = pt.code;
  document.getElementById('payTypeName').value = pt.name;
  document.getElementById('payTypeRate').value = pt.hourly_rate;
  document.getElementById('payTypeOrder').value = pt.display_order || 0;
  document.getElementById('payTypeStatus').value = pt.is_active ? '1' : '0';
  document.getElementById('payTypeModalOverlay').classList.add('show');
}

function closePayTypeModal() {
  document.getElementById('payTypeModalOverlay').classList.remove('show');
  editingPayTypeId = null;
}

async function savePayType() {
  const data = {
    code: document.getElementById('payTypeCode').value.toUpperCase(),
    name: document.getElementById('payTypeName').value,
    hourly_rate: parseFloat(document.getElementById('payTypeRate').value),
    display_order: parseInt(document.getElementById('payTypeOrder').value) || 0,
    is_active: parseInt(document.getElementById('payTypeStatus').value)
  };
  
  if (!data.code || !data.name || isNaN(data.hourly_rate)) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  
  try {
    if (editingPayTypeId) {
      await apiRequest(`/pay-types/${editingPayTypeId}`, { method: 'PUT', body: data });
      showToast('Pay type updated');
    } else {
      await apiRequest('/pay-types', { method: 'POST', body: data });
      showToast('Pay type created');
    }
    closePayTypeModal();
    loadPayTypes();
  } catch (err) {
    showToast(err.message || 'Failed to save pay type', 'error');
  }
}

async function deletePayType(id, name) {
  if (!confirm(`Delete pay type "${name}"?`)) return;
  
  try {
    await apiRequest(`/pay-types/${id}`, { method: 'DELETE' });
    showToast('Pay type deleted');
    loadPayTypes();
  } catch (err) {
    showToast(err.message || 'Failed to delete pay type', 'error');
  }
}

// ============================================
// EMPLOYEE PAY RECORDS
// ============================================

let employeePayRecordsData = [];
let payRecordsFilters = {
  date_from: '',
  date_to: '',
  pay_type: ''
};
let editingPayRecordId = null;

function resetPayRecordsFilters() {
  payRecordsFilters = { date_from: '', date_to: '', pay_type: '' };
  employeePayRecordsData = [];
  
  const container = document.getElementById('empPayRecordsContainer');
  if (container) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted);">
        <p>Click the "Pay Records" tab to load pay records.</p>
      </div>
    `;
  }
}

async function loadEmployeePayRecords(employeeId) {
  const container = document.getElementById('empPayRecordsContainer');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-cell" style="padding: 20px;">Loading pay records...</div>';
  
  try {
    const params = new URLSearchParams();
    if (payRecordsFilters.date_from) params.set('date_from', payRecordsFilters.date_from);
    if (payRecordsFilters.date_to) params.set('date_to', payRecordsFilters.date_to);
    if (payRecordsFilters.pay_type) params.set('pay_type', payRecordsFilters.pay_type);
    
    const result = await apiRequest(`/employees/${employeeId}/pay-records?${params}`);
    employeePayRecordsData = result.data?.records || [];
    const totals = result.data?.totals || { total_hours: 0, total_amount: 0, by_pay_type: {} };
    
    renderPayRecordsTab(totals);
  } catch (err) {
    container.innerHTML = `<div style="padding: 20px; color: var(--accent-red);">Error: ${err.message}</div>`;
  }
}

function renderPayRecordsTab(totals) {
  const container = document.getElementById('empPayRecordsContainer');
  if (!container) return;
  
  // Get unique pay types for filter dropdown
  const payTypeCodes = [...new Set(employeePayRecordsData.map(r => r.pay_type_code).filter(Boolean))];
  
  let html = `
    <div class="pay-records-filters">
      <div class="filter-row">
        <div class="filter-group">
          <label>From Date</label>
          <input type="date" id="prFilterDateFrom" value="${payRecordsFilters.date_from}" 
                 onchange="updatePayRecordsFilter('date_from', this.value)">
        </div>
        <div class="filter-group">
          <label>To Date</label>
          <input type="date" id="prFilterDateTo" value="${payRecordsFilters.date_to}"
                 onchange="updatePayRecordsFilter('date_to', this.value)">
        </div>
        <div class="filter-group">
          <label>Pay Type</label>
          <select id="prFilterPayType" onchange="updatePayRecordsFilter('pay_type', this.value)">
            <option value="">All Types</option>
            ${payTypeCodes.map(code => `<option value="${code}" ${payRecordsFilters.pay_type === code ? 'selected' : ''}>${code}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <button class="action-btn" onclick="applyPayRecordsFilters()">Apply</button>
          <button class="action-btn" onclick="clearPayRecordsFilters()">Clear</button>
        </div>
      </div>
    </div>
    
    <div class="pay-records-table-wrapper">
      <table class="pay-records-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Shift</th>
            <th>Duty</th>
            <th>Pay Type</th>
            <th>Hours</th>
            <th>Rate</th>
            <th>Amount</th>
            <th>Note</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  if (employeePayRecordsData.length === 0) {
    html += `<tr><td colspan="9" class="loading-cell">No pay records found</td></tr>`;
  } else {
    for (const rec of employeePayRecordsData) {
      const isManual = rec.is_manual ? '<span class="badge badge-warning" title="Manually edited">M</span>' : '';
      html += `
        <tr data-record-id="${rec.id}" class="${rec.is_manual ? 'manual-edit' : ''}">
          <td>${rec.work_date}</td>
          <td>${escapeHtml(rec.shift_name || '—')}</td>
          <td>${escapeHtml(rec.duty_name || '—')}</td>
          <td><span class="badge badge-info">${escapeHtml(rec.pay_type_code || 'STD')}</span></td>
          <td class="numeric">${parseFloat(rec.hours).toFixed(2)}</td>
          <td class="numeric">$${parseFloat(rec.rate).toFixed(2)}</td>
          <td class="numeric">$${parseFloat(rec.total_amount).toFixed(2)}</td>
          <td>${escapeHtml(rec.notes || '')} ${isManual}</td>
          <td>
            <button class="action-btn small" onclick="editPayRecord('${rec.id}')">Edit</button>
          </td>
        </tr>
      `;
    }
  }
  
  html += `
        </tbody>
        <tfoot>
          <tr class="totals-row">
            <td colspan="4"><strong>Totals</strong></td>
            <td class="numeric"><strong>${totals.total_hours.toFixed(2)}</strong></td>
            <td></td>
            <td class="numeric"><strong>$${totals.total_amount.toFixed(2)}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    
    <div class="pay-records-summary">
      <strong>By Pay Type:</strong>
      ${Object.entries(totals.by_pay_type).map(([code, data]) => 
        `<span class="pay-type-summary">${code}: ${data.hours.toFixed(2)} hrs / $${data.amount.toFixed(2)}</span>`
      ).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

function updatePayRecordsFilter(key, value) {
  payRecordsFilters[key] = value;
}

function applyPayRecordsFilters() {
  if (editingEmployeeId) {
    loadEmployeePayRecords(editingEmployeeId);
  }
}

function clearPayRecordsFilters() {
  payRecordsFilters = { date_from: '', date_to: '', pay_type: '' };
  document.getElementById('prFilterDateFrom').value = '';
  document.getElementById('prFilterDateTo').value = '';
  document.getElementById('prFilterPayType').value = '';
  if (editingEmployeeId) {
    loadEmployeePayRecords(editingEmployeeId);
  }
}

function editPayRecord(id) {
  const record = employeePayRecordsData.find(r => r.id === id);
  if (!record) return;
  
  editingPayRecordId = id;
  document.getElementById('prEditHours').value = record.hours;
  document.getElementById('prEditRate').value = record.rate;
  document.getElementById('prEditPayType').value = record.pay_type_code || 'STD';
  document.getElementById('prEditNotes').value = record.notes || '';
  
  // Calculate amount display
  updatePayRecordAmountPreview();
  
  document.getElementById('payRecordEditOverlay').classList.add('show');
}

function closePayRecordEditModal() {
  document.getElementById('payRecordEditOverlay').classList.remove('show');
  editingPayRecordId = null;
}

function updatePayRecordAmountPreview() {
  const hours = parseFloat(document.getElementById('prEditHours').value) || 0;
  const rate = parseFloat(document.getElementById('prEditRate').value) || 0;
  const amount = hours * rate;
  document.getElementById('prEditAmountPreview').textContent = `$${amount.toFixed(2)}`;
}

async function savePayRecordEdit() {
  if (!editingPayRecordId) return;
  
  const data = {
    hours: parseFloat(document.getElementById('prEditHours').value),
    rate: parseFloat(document.getElementById('prEditRate').value),
    pay_type_code: document.getElementById('prEditPayType').value,
    notes: document.getElementById('prEditNotes').value || null
  };
  
  if (isNaN(data.hours) || isNaN(data.rate)) {
    showToast('Hours and rate must be valid numbers', 'error');
    return;
  }
  
  try {
    await apiRequest(`/employees/pay-records/${editingPayRecordId}`, { method: 'PUT', body: data });
    showToast('Pay record updated');
    closePayRecordEditModal();
    // Reload pay records
    if (editingEmployeeId) {
      loadEmployeePayRecords(editingEmployeeId);
    }
  } catch (err) {
    showToast(err.message || 'Failed to update pay record', 'error');
  }
}
