// ============================================
// SHIFTS CRUD
// ============================================
let shiftsData = [];
let shiftFiltersState = { search: '', type: '' };
let editingShiftId = null;
let shiftDutyBlocks = []; // Array of duty blocks, each with name, driver_id, and lines
let shiftEmployees = []; // Employees for driver dropdown
let shiftVehicles = []; // Vehicles for vehicle dropdown

const SHIFT_DUTY_TYPES = [
  { code: 'driving', name: 'Driving' },
  { code: 'oov', name: 'Out of Vehicle' },
  { code: 'break', name: 'Meal Break' },
  { code: 'waiting', name: 'Waiting' },
  { code: 'charter', name: 'Charter' },
  { code: 'dead', name: 'Dead Running' }
];

// Pay types - loaded from API, with fallback defaults
let shiftPayTypes = [
  { code: 'STD', name: 'Standard' },
  { code: 'OT', name: 'Overtime' },
  { code: 'DT', name: 'Double Time' },
  { code: 'PEN', name: 'Penalty' },
  { code: 'UNP', name: 'Unpaid' }
];

async function loadShiftFormData() {
  // Load employees, vehicles, and pay types for dropdowns
  try {
    const [empResult, vehResult, payTypesResult] = await Promise.all([
      apiRequest('/employees?status=active&limit=500'),
      apiRequest('/vehicles?status=active&limit=500'),
      apiRequest('/pay-types')
    ]);
    shiftEmployees = empResult.data || [];
    shiftVehicles = vehResult.data || [];
    // Use API pay types if available, filtering to active only
    if (payTypesResult.data && payTypesResult.data.length > 0) {
      shiftPayTypes = payTypesResult.data.filter(pt => pt.is_active !== 0);
    }
  } catch (err) {
    console.error('Failed to load form data:', err);
  }
}

async function loadShifts() {
  const tbody = document.getElementById('shiftsTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Loading shift templates...</td></tr>';
  
  try {
    const params = new URLSearchParams();
    if (shiftFiltersState.search) params.set('search', shiftFiltersState.search);
    if (shiftFiltersState.type) params.set('type', shiftFiltersState.type);
    
    const result = await apiRequest(`/shifts?${params}`);
    shiftsData = result.data || [];
    renderShiftsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function formatDecimalTime(decimal) {
  if (decimal === null || decimal === undefined) return '';
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeInput(val) {
  if (!val) return null;
  val = val.replace(/[^0-9:]/g, '');
  if (val.includes(':')) {
    const [h, m] = val.split(':').map(Number);
    return h + (m / 60);
  } else if (val.length >= 3) {
    const h = parseInt(val.slice(0, -2)) || 0;
    const m = parseInt(val.slice(-2)) || 0;
    return h + (m / 60);
  }
  return null;
}

function renderShiftsTable() {
  const tbody = document.getElementById('shiftsTableBody');
  if (shiftsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No shift templates found. Click "+ Add Template" to create one.</td></tr>';
    return;
  }
  
  tbody.innerHTML = shiftsData.map(s => {
    const duration = (s.default_end || 0) - (s.default_start || 0);
    const durationStr = duration > 0 ? `${Math.floor(duration)}h ${Math.round((duration % 1) * 60)}m` : '—';
    return `
      <tr>
        <td style="font-family: 'JetBrains Mono', monospace;">${s.code}</td>
        <td>${s.name}</td>
        <td><span class="badge badge-info">${s.shift_type}</span></td>
        <td>${formatDecimalTime(s.default_start) || '—'}</td>
        <td>${formatDecimalTime(s.default_end) || '—'}</td>
        <td>${durationStr}</td>
        <td>${s.duty_count || 0}</td>
        <td>
          <button class="action-btn" onclick="editShift('${s.id}')">Edit</button>
          <button class="action-btn" onclick="duplicateShift('${s.id}')">Copy</button>
          <button class="action-btn danger" onclick="deleteShift('${s.id}', '${s.name}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

let shiftSearchTimeout;
function filterShifts(search) {
  clearTimeout(shiftSearchTimeout);
  shiftSearchTimeout = setTimeout(() => {
    shiftFiltersState.search = search;
    loadShifts();
  }, 300);
}

function filterShiftType(type) {
  shiftFiltersState.type = type;
  loadShifts();
}

async function showAddShiftModal() {
  editingShiftId = null;
  shiftDutyBlocks = [];
  document.getElementById('shiftModalTitle').textContent = 'Add Shift Template';
  document.getElementById('shiftForm').reset();
  await loadShiftFormData();
  renderShiftDutyBlocks();
  document.getElementById('shiftModalOverlay').classList.add('show');
}

async function editShift(id) {
  // Check if shift is locked by published rosters
  try {
    const lockStatus = await apiRequest(`/shifts/${id}/lock-status`);
    if (lockStatus.locked) {
      const rosterNames = lockStatus.published_rosters.map(r => r.code).join(', ');
      showToast(`This shift cannot be edited - it is used in published roster(s): ${rosterNames}. Unpublish the roster(s) first.`, 'error');
      return;
    }
  } catch (err) {
    console.error('Lock check failed:', err);
  }
  
  // Fetch full shift data with duty blocks
  try {
    await loadShiftFormData();
    const result = await apiRequest(`/shifts/${id}`);
    const shift = result.data;
    if (!shift) {
      showToast('Shift not found', 'error');
      return;
    }
    
    editingShiftId = id;
    shiftDutyBlocks = shift.duty_blocks ? shift.duty_blocks.map(b => ({
      ...b,
      lines: b.lines ? b.lines.map(l => ({...l})) : []
    })) : [];
    
    document.getElementById('shiftModalTitle').textContent = 'Edit Shift Template';
    document.getElementById('shiftCode').value = shift.code || '';
    document.getElementById('shiftName').value = shift.name || '';
    document.getElementById('shiftType').value = shift.shift_type || 'regular';
    document.getElementById('shiftNotes').value = shift.notes || '';
    
    renderShiftDutyBlocks();
    document.getElementById('shiftModalOverlay').classList.add('show');
  } catch (err) {
    showToast(err.message || 'Failed to load shift', 'error');
  }
}

function closeShiftModal() {
  document.getElementById('shiftModalOverlay').classList.remove('show');
  editingShiftId = null;
  shiftDutyBlocks = [];
}

// Add a new duty block
function addShiftDutyBlock() {
  const dutyNum = shiftDutyBlocks.length + 1;
  let startTime = 6.0;
  
  // Continue from last duty's last line
  if (shiftDutyBlocks.length > 0) {
    const lastBlock = shiftDutyBlocks[shiftDutyBlocks.length - 1];
    if (lastBlock.lines.length > 0) {
      startTime = lastBlock.lines[lastBlock.lines.length - 1].end_time || 6.0;
    }
  }
  
  shiftDutyBlocks.push({
    id: 'new_' + Date.now(),
    name: `Duty ${dutyNum}`,
    driver_id: null,
    lines: [{
      id: 'line_' + Date.now(),
      start_time: startTime,
      end_time: startTime + 1,
      duty_type: 'driving',
      description: '',
      vehicle_id: null,
      pay_type: 'STD'
    }]
  });
  
  renderShiftDutyBlocks();
}

// Remove a duty block
function removeShiftDutyBlock(blockIdx) {
  showConfirmModal(
    'Delete Duty Block',
    'Delete this entire duty and all its lines?',
    () => {
      shiftDutyBlocks.splice(blockIdx, 1);
      renderShiftDutyBlocks();
    },
    { confirmText: 'Delete', isDangerous: true }
  );
}

// Update duty block name
function updateDutyBlockName(blockIdx, name) {
  shiftDutyBlocks[blockIdx].name = name;
}

// Update duty block driver
function updateDutyBlockDriver(blockIdx, driverId) {
  shiftDutyBlocks[blockIdx].driver_id = driverId || null;
}

// Add a line to a duty block (above or below)
function addDutyLine(blockIdx, lineIdx, direction) {
  const block = shiftDutyBlocks[blockIdx];
  const refLine = block.lines[lineIdx];
  
  let startTime, endTime;
  if (direction === 'above') {
    startTime = refLine.start_time - 0.5;
    endTime = refLine.start_time;
  } else {
    startTime = refLine.end_time;
    endTime = refLine.end_time + 0.5;
  }
  
  const newLine = {
    id: 'line_' + Date.now(),
    start_time: startTime,
    end_time: endTime,
    duty_type: 'driving',
    description: '',
    vehicle_id: null,
    pay_type: 'STD'
  };
  
  const insertIdx = direction === 'above' ? lineIdx : lineIdx + 1;
  block.lines.splice(insertIdx, 0, newLine);
  renderShiftDutyBlocks();
}

// Remove a line from a duty block
function removeDutyLine(blockIdx, lineIdx) {
  const block = shiftDutyBlocks[blockIdx];
  if (block.lines.length === 1) {
    // If last line, remove the whole block
    removeShiftDutyBlock(blockIdx);
    return;
  }
  block.lines.splice(lineIdx, 1);
  renderShiftDutyBlocks();
}

// Update a line field
function updateDutyLine(blockIdx, lineIdx, field, value) {
  if (field === 'start_time' || field === 'end_time') {
    value = parseTimeInput(value);
  }
  shiftDutyBlocks[blockIdx].lines[lineIdx][field] = value;
  // Only re-render totals, not the whole thing (to avoid losing focus)
  renderShiftDutyTotals();
}

// Update location fields for shift duty line
function updateShiftDutyLocation(blockIdx, lineIdx) {
  const inputId = `shiftLoc_${blockIdx}_${lineIdx}`;
  const nameInput = document.getElementById(inputId);
  const latInput = document.getElementById(inputId + 'Lat');
  const lngInput = document.getElementById(inputId + 'Lng');
  
  if (!nameInput) return;
  
  const line = shiftDutyBlocks[blockIdx]?.lines[lineIdx];
  if (!line) return;
  
  line.location_name = nameInput.value || null;
  line.location_lat = parseFloat(latInput?.value) || null;
  line.location_lng = parseFloat(lngInput?.value) || null;
  
  renderShiftDutyTotals();
}

function calculateLineHours(line) {
  if (line.start_time === null || line.end_time === null) return 0;
  let hours = line.end_time - line.start_time;
  if (hours < 0) hours += 24;
  return hours;
}

function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

function renderShiftDutyBlocks() {
  const container = document.getElementById('shiftDutyBlocks');
  
  if (shiftDutyBlocks.length === 0) {
    container.innerHTML = '<div class="duty-editor-empty">No duties added. Click "+ Add Duty" to start.</div>';
    renderShiftDutyTotals();
    return;
  }
  
  // Build driver options
  const driverOptions = '<option value="">— No Driver —</option>' + 
    shiftEmployees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name}</option>`).join('');
  
  // Build vehicle options
  const vehicleOptions = '<option value="">—</option>' +
    shiftVehicles.map(v => `<option value="${v.id}">${v.fleet_number}</option>`).join('');
  
  container.innerHTML = shiftDutyBlocks.map((block, blockIdx) => {
    const linesHtml = block.lines.map((line, lineIdx) => {
      const hours = calculateLineHours(line);
      return `
        <div class="duty-line">
          <div class="duty-col-arrows duty-line-arrows">
            <button type="button" class="duty-line-arrow" onclick="addDutyLine(${blockIdx}, ${lineIdx}, 'above')" title="Insert above">▲</button>
            <button type="button" class="duty-line-arrow" onclick="addDutyLine(${blockIdx}, ${lineIdx}, 'below')" title="Insert below">▼</button>
          </div>
          <div class="duty-col-time">
            <input type="text" 
              value="${formatDecimalTime(line.start_time)}" 
              onchange="updateDutyLine(${blockIdx}, ${lineIdx}, 'start_time', this.value)"
              placeholder="00:00">
          </div>
          <div class="duty-col-time">
            <input type="text" 
              value="${formatDecimalTime(line.end_time)}" 
              onchange="updateDutyLine(${blockIdx}, ${lineIdx}, 'end_time', this.value)"
              placeholder="00:00">
          </div>
          <div class="duty-col-type">
            <select onchange="updateDutyLine(${blockIdx}, ${lineIdx}, 'duty_type', this.value)">
              ${SHIFT_DUTY_TYPES.map(t => `<option value="${t.code}" ${line.duty_type === t.code ? 'selected' : ''}>${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="duty-col-desc">
            <input type="text" 
              value="${line.description || ''}" 
              onchange="updateDutyLine(${blockIdx}, ${lineIdx}, 'description', this.value)"
              placeholder="Description...">
          </div>
          <div class="duty-col-location">
            <div class="location-input-wrapper">
              <input type="text" 
                id="shiftLoc_${blockIdx}_${lineIdx}"
                value="${line.location_name || ''}" 
                oninput="onLocationInput('shiftLoc_${blockIdx}_${lineIdx}')"
                onfocus="onLocationInput('shiftLoc_${blockIdx}_${lineIdx}')"
                onblur="setTimeout(() => updateShiftDutyLocation(${blockIdx}, ${lineIdx}), 200)"
                placeholder="Search location...">
              <input type="hidden" id="shiftLoc_${blockIdx}_${lineIdx}Lat" value="${line.location_lat || ''}">
              <input type="hidden" id="shiftLoc_${blockIdx}_${lineIdx}Lng" value="${line.location_lng || ''}">
            </div>
          </div>
          <div class="duty-col-vehicle">
            <select onchange="updateDutyLine(${blockIdx}, ${lineIdx}, 'vehicle_id', this.value)">
              ${vehicleOptions.replace(`value="${line.vehicle_id}"`, `value="${line.vehicle_id}" selected`)}
            </select>
          </div>
          <div class="duty-col-pay">
            <select onchange="updateDutyLine(${blockIdx}, ${lineIdx}, 'pay_type', this.value)">
              ${shiftPayTypes.map(t => `<option value="${t.code}" ${line.pay_type === t.code ? 'selected' : ''}>${t.code}</option>`).join('')}
            </select>
          </div>
          <div class="duty-col-hours">${formatHours(hours)}</div>
          <div class="duty-col-actions">
            <button type="button" class="duty-line-delete" onclick="removeDutyLine(${blockIdx}, ${lineIdx})" title="Delete line">✕</button>
          </div>
        </div>
      `;
    }).join('');
    
    // Build driver select with correct selected value
    const driverSelectHtml = driverOptions.replace(
      `value="${block.driver_id}"`, 
      `value="${block.driver_id}" selected`
    );
    
    return `
      <div class="duty-block">
        <div class="duty-block-header">
          <input type="text" class="duty-block-name" value="${block.name}" 
            onchange="updateDutyBlockName(${blockIdx}, this.value)" 
            placeholder="Duty name...">
          <div class="duty-block-driver">
            <span class="duty-block-driver-label">Driver:</span>
            <select onchange="updateDutyBlockDriver(${blockIdx}, this.value)">
              ${driverSelectHtml}
            </select>
          </div>
          <button type="button" class="duty-block-delete" onclick="removeShiftDutyBlock(${blockIdx})" title="Delete duty">✕</button>
        </div>
        <div class="duty-block-lines">
          <div class="duty-line-header">
            <span class="duty-col-arrows"></span>
            <span class="duty-col-time">Start</span>
            <span class="duty-col-time">End</span>
            <span class="duty-col-type">Type</span>
            <span class="duty-col-desc">Description</span>
            <span class="duty-col-location">Location</span>
            <span class="duty-col-vehicle">Vehicle</span>
            <span class="duty-col-pay">Pay</span>
            <span class="duty-col-hours">Hours</span>
            <span class="duty-col-actions"></span>
          </div>
          ${linesHtml}
        </div>
      </div>
    `;
  }).join('');
  
  renderShiftDutyTotals();
}

function renderShiftDutyTotals() {
  const totalsContainer = document.getElementById('shiftDutyTotals');
  
  if (shiftDutyBlocks.length === 0) {
    totalsContainer.innerHTML = '';
    return;
  }
  
  const totalsByPay = {};
  let totalHours = 0;
  
  shiftDutyBlocks.forEach(block => {
    block.lines.forEach(line => {
      const hours = calculateLineHours(line);
      totalHours += hours;
      const payType = line.pay_type || 'STD';
      totalsByPay[payType] = (totalsByPay[payType] || 0) + hours;
    });
  });
  
  let totalsHtml = Object.entries(totalsByPay).map(([pay, hours]) => 
    `<div class="duty-total-item"><span class="duty-total-label">${pay}:</span><span class="duty-total-value">${formatHours(hours)}</span></div>`
  ).join('');
  totalsHtml += `<div class="duty-total-item"><span class="duty-total-label">Total:</span><span class="duty-total-value">${formatHours(totalHours)}</span></div>`;
  
  totalsContainer.innerHTML = totalsHtml;
}

async function saveShift() {
  // Calculate shift start/end from all duty lines
  let shiftStart = null;
  let shiftEnd = null;
  
  shiftDutyBlocks.forEach(block => {
    block.lines.forEach(line => {
      if (line.start_time !== null) {
        if (shiftStart === null || line.start_time < shiftStart) shiftStart = line.start_time;
      }
      if (line.end_time !== null) {
        if (shiftEnd === null || line.end_time > shiftEnd) shiftEnd = line.end_time;
      }
    });
  });
  
  const data = {
    code: document.getElementById('shiftCode').value,
    name: document.getElementById('shiftName').value,
    shift_type: document.getElementById('shiftType').value,
    default_start: shiftStart,
    default_end: shiftEnd,
    notes: document.getElementById('shiftNotes').value || null,
    duty_blocks: shiftDutyBlocks.map((block, blockIdx) => ({
      id: block.id || null,  // Preserve existing ID for updates
      sequence: blockIdx + 1,
      name: block.name,
      driver_id: block.driver_id || null,
      lines: block.lines.map((line, lineIdx) => ({
        id: line.id || null,  // Preserve existing ID for updates
        sequence: lineIdx + 1,
        duty_type: line.duty_type,
        start_time: line.start_time,
        end_time: line.end_time,
        description: line.description || null,
        vehicle_id: line.vehicle_id || null,
        pay_type: line.pay_type || 'STD',
        location_name: line.location_name || null,
        location_lat: line.location_lat || null,
        location_lng: line.location_lng || null
      }))
    }))
  };
  
  try {
    if (editingShiftId) {
      await apiRequest(`/shifts/${editingShiftId}`, { method: 'PUT', body: data });
      showToast('Shift template updated');
    } else {
      await apiRequest('/shifts', { method: 'POST', body: data });
      showToast('Shift template added');
    }
    closeShiftModal();
    loadShifts();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

async function duplicateShift(id) {
  try {
    await apiRequest(`/shifts/${id}/duplicate`, { method: 'POST' });
    showToast('Shift template duplicated');
    loadShifts();
  } catch (err) {
    showToast(err.message || 'Failed to duplicate', 'error');
  }
}

async function deleteShift(id, name) {
  showConfirmModal(
    'Delete Shift Template',
    `Delete shift template "${name}"?`,
    async () => {
      try {
        await apiRequest(`/shifts/${id}`, { method: 'DELETE' });
        showToast('Shift template deleted');
        loadShifts();
      } catch (err) {
        showToast(err.message || 'Failed to delete', 'error');
      }
    },
    { confirmText: 'Delete', isDangerous: true }
  );
}

