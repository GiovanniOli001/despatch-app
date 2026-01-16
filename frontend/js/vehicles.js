// ============================================
// VEHICLES CRUD
// ============================================
let vehiclesData = [];
let vehicleFiltersState = { search: '', status: '' };
let editingVehicleId = null;

async function loadVehiclesData() {
  const tbody = document.getElementById('vehiclesTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading vehicles...</td></tr>';
  
  try {
    const params = new URLSearchParams();
    if (vehicleFiltersState.search) params.set('search', vehicleFiltersState.search);
    if (vehicleFiltersState.status) params.set('status', vehicleFiltersState.status);
    
    const result = await apiRequest(`/vehicles?${params}`);
    vehiclesData = result.data || [];
    renderVehiclesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderVehiclesTable() {
  const tbody = document.getElementById('vehiclesTableBody');
  if (vehiclesData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No vehicles found</td></tr>';
    return;
  }
  
  tbody.innerHTML = vehiclesData.map(v => `
    <tr>
      <td style="font-family: 'JetBrains Mono', monospace;">${v.fleet_number}</td>
      <td style="font-family: 'JetBrains Mono', monospace;">${v.rego}</td>
      <td>${v.capacity} seats</td>
      <td>${v.make || ''} ${v.model || ''}</td>
      <td>${v.year || '—'}</td>
      <td><span class="badge ${v.status === 'active' ? 'badge-success' : v.status === 'sold' ? 'badge-error' : 'badge-warning'}">${v.status}</span></td>
      <td>
        <button class="action-btn" onclick="editVehicleItem('${v.id}')">Edit</button>
        <button class="action-btn danger" onclick="deleteVehicle('${v.id}', '${v.fleet_number}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

let vehicleSearchTimeout;
function filterVehicles(search) {
  clearTimeout(vehicleSearchTimeout);
  vehicleSearchTimeout = setTimeout(() => {
    vehicleFiltersState.search = search;
    loadVehiclesData();
  }, 300);
}

function filterVehicleStatus(status) {
  vehicleFiltersState.status = status;
  loadVehiclesData();
}

function showAddVehicleModal() {
  editingVehicleId = null;
  document.getElementById('vehicleModalTitle').textContent = 'Add Vehicle';
  document.getElementById('vehicleForm').reset();
  document.getElementById('vehicleModalOverlay').classList.add('show');
}

function editVehicleItem(id) {
  const veh = vehiclesData.find(v => v.id === id);
  if (!veh) return;
  
  editingVehicleId = id;
  document.getElementById('vehicleModalTitle').textContent = 'Edit Vehicle';
  document.getElementById('vehFleet').value = veh.fleet_number || '';
  document.getElementById('vehRego').value = veh.rego || '';
  document.getElementById('vehCapacity').value = veh.capacity || '';
  document.getElementById('vehMake').value = veh.make || '';
  document.getElementById('vehModel').value = veh.model || '';
  document.getElementById('vehYear').value = veh.year || '';
  document.getElementById('vehStatus').value = veh.status || 'active';
  document.getElementById('vehicleModalOverlay').classList.add('show');
}

function closeVehicleModal() {
  document.getElementById('vehicleModalOverlay').classList.remove('show');
  editingVehicleId = null;
}

async function saveVehicle() {
  const data = {
    fleet_number: document.getElementById('vehFleet').value,
    rego: document.getElementById('vehRego').value,
    capacity: parseInt(document.getElementById('vehCapacity').value),
    make: document.getElementById('vehMake').value || null,
    model: document.getElementById('vehModel').value || null,
    year: document.getElementById('vehYear').value ? parseInt(document.getElementById('vehYear').value) : null,
    status: document.getElementById('vehStatus').value,
  };
  
  try {
    if (editingVehicleId) {
      await apiRequest(`/vehicles/${editingVehicleId}`, { method: 'PUT', body: data });
      showToast('Vehicle updated');
    } else {
      await apiRequest('/vehicles', { method: 'POST', body: data });
      showToast('Vehicle added');
    }
    closeVehicleModal();
    loadVehiclesData();
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
}

async function deleteVehicle(id, name) {
  if (!confirm(`Delete vehicle ${name}?`)) return;
  try {
    await apiRequest(`/vehicles/${id}`, { method: 'DELETE' });
    showToast('Vehicle deleted');
    loadVehiclesData();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

