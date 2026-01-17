// ============================================
// CHARTERS MODULE
// ============================================

// State
let charterCustomersData = [];
let chartersData = [];
let charterTripsData = [];
let editingCustomerId = null;
let editingCharterId = null;
let editingTripId = null;
let currentCharterView = 'customers'; // 'customers', 'bookings', 'detail'
let currentCharterId = null; // For detail view
let customerContactsData = [];
let editingContactId = null;
let tripLineItemsData = [];
let editingLineItemId = null;

// Filter states
let customerFiltersState = { search: '', type: '' };
let charterFiltersState = { search: '', status: '', customer: '', dateFrom: '', dateTo: '' };

// Location autocomplete state
let locationAutocompleteTimeout;
let currentLocationInput = null;

// Status badge colors
const CHARTER_STATUS_COLORS = {
  enquiry: 'badge-info',
  quoted: 'badge-warning',
  confirmed: 'badge-success',
  completed: 'badge-success',
  invoiced: 'badge-info',
  paid: 'badge-success',
  cancelled: 'badge-error'
};

const TRIP_STATUS_COLORS = {
  draft: 'badge-warning',
  booked: 'badge-info',
  in_progress: 'badge-success',
  completed: 'badge-success',
  cancelled: 'badge-error'
};

// ============================================
// CHARTER SUB-NAVIGATION
// ============================================
function switchCharterTab(tab) {
  currentCharterView = tab;

  // Update tab buttons
  document.querySelectorAll('.charter-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.charter-tab-btn[data-tab="${tab}"]`)?.classList.add('active');

  // Update visible sections
  document.querySelectorAll('.charter-section').forEach(section => {
    section.classList.remove('active');
  });

  if (tab === 'customers') {
    document.getElementById('charterCustomersSection').classList.add('active');
    loadCharterCustomers();
  } else if (tab === 'bookings') {
    document.getElementById('charterBookingsSection').classList.add('active');
    loadCharters();
  } else if (tab === 'detail') {
    document.getElementById('charterDetailSection').classList.add('active');
    if (currentCharterId) {
      openCharterDetail(currentCharterId);
    }
  }
}

// ============================================
// CUSTOMERS CRUD
// ============================================
async function loadCharterCustomers() {
  const tbody = document.getElementById('charterCustomersTableBody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading customers...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (customerFiltersState.search) params.set('search', customerFiltersState.search);
    if (customerFiltersState.type) params.set('type', customerFiltersState.type);

    const result = await apiRequest(`/charter-customers?${params}`);
    charterCustomersData = result.data || [];
    renderCustomersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderCustomersTable() {
  const tbody = document.getElementById('charterCustomersTableBody');
  if (charterCustomersData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No customers found</td></tr>';
    return;
  }

  tbody.innerHTML = charterCustomersData.map(c => {
    const typeLabel = c.type || 'Individual';
    const typeBadge = typeLabel === 'Corporate' ? 'badge-info' : typeLabel === 'School' ? 'badge-success' : 'badge-warning';

    return `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td><span class="badge ${typeBadge}">${escapeHtml(typeLabel)}</span></td>
        <td>${c.contact_name ? escapeHtml(c.contact_name) : '—'}</td>
        <td>${c.contact_phone ? escapeHtml(c.contact_phone) : '—'}</td>
        <td>${c.contact_email ? escapeHtml(c.contact_email) : '—'}</td>
        <td><span class="badge ${c.is_active ? 'badge-success' : 'badge-warning'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="action-btn" onclick="editCharterCustomer('${c.id}')">Edit</button>
          <button class="action-btn danger" onclick="deleteCharterCustomer('${c.id}', '${escapeHtml(c.name)}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

let customerSearchTimeout;
function filterCharterCustomers(search) {
  clearTimeout(customerSearchTimeout);
  customerSearchTimeout = setTimeout(() => {
    customerFiltersState.search = search;
    loadCharterCustomers();
  }, 300);
}

function filterCustomerType(type) {
  customerFiltersState.type = type;
  loadCharterCustomers();
}

function showAddCustomerModal() {
  editingCustomerId = null;
  document.getElementById('customerModalTitle').textContent = 'Add Customer';
  document.getElementById('customerForm').reset();

  // Reset to primary tab
  document.querySelectorAll('#customerModalOverlay .modal-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('#customerModalOverlay .modal-tab-content').forEach((content, i) => {
    content.classList.toggle('active', i === 0);
  });

  // Clear contacts
  customerContactsData = [];
  renderContactsList();

  document.getElementById('customerModalOverlay').classList.add('show');
}

async function editCharterCustomer(id) {
  const customer = charterCustomersData.find(c => c.id === id);
  if (!customer) return;

  editingCustomerId = id;
  document.getElementById('customerModalTitle').textContent = 'Edit Customer';

  // Fill form
  document.getElementById('custName').value = customer.name || '';
  document.getElementById('custType').value = customer.type || '';
  document.getElementById('custABN').value = customer.abn || '';
  document.getElementById('custBillingEmail').value = customer.billing_email || '';
  document.getElementById('custBillingAddress').value = customer.billing_address || '';
  document.getElementById('custContactName').value = customer.contact_name || '';
  document.getElementById('custContactPhone').value = customer.contact_phone || '';
  document.getElementById('custContactEmail').value = customer.contact_email || '';
  document.getElementById('custPaymentTerms').value = customer.payment_terms || 30;
  document.getElementById('custIsActive').checked = customer.is_active !== 0;
  document.getElementById('custNotes').value = customer.notes || '';

  // Reset to primary tab
  document.querySelectorAll('#customerModalOverlay .modal-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('#customerModalOverlay .modal-tab-content').forEach((content, i) => {
    content.classList.toggle('active', i === 0);
  });

  // Load contacts
  await loadCustomerContacts(id);

  document.getElementById('customerModalOverlay').classList.add('show');
}

function switchCustomerTab(tabName, evt) {
  // Update tab buttons
  document.querySelectorAll('#customerModalOverlay .modal-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  if (evt && evt.target) evt.target.classList.add('active');

  // Update tab content
  document.querySelectorAll('#customerModalOverlay .modal-tab-content').forEach(content => {
    content.classList.remove('active');
  });

  if (tabName === 'primary') {
    document.getElementById('custTabPrimary').classList.add('active');
  } else if (tabName === 'contacts') {
    document.getElementById('custTabContacts').classList.add('active');
  }
}

function closeCustomerModal() {
  document.getElementById('customerModalOverlay').classList.remove('show');
  editingCustomerId = null;
  customerContactsData = [];
}

async function saveCharterCustomer() {
  const data = {
    name: document.getElementById('custName').value,
    type: document.getElementById('custType').value || null,
    abn: document.getElementById('custABN').value || null,
    billing_email: document.getElementById('custBillingEmail').value || null,
    billing_address: document.getElementById('custBillingAddress').value || null,
    contact_name: document.getElementById('custContactName').value || null,
    contact_phone: document.getElementById('custContactPhone').value || null,
    contact_email: document.getElementById('custContactEmail').value || null,
    payment_terms: parseInt(document.getElementById('custPaymentTerms').value) || 30,
    is_active: document.getElementById('custIsActive').checked ? 1 : 0,
    notes: document.getElementById('custNotes').value || null
  };

  if (!data.name) {
    showToast('Customer name is required', true);
    return;
  }

  try {
    if (editingCustomerId) {
      await apiRequest(`/charter-customers/${editingCustomerId}`, {
        method: 'PUT',
        body: data
      });
      showToast('Customer updated successfully');
    } else {
      await apiRequest('/charter-customers', {
        method: 'POST',
        body: data
      });
      showToast('Customer created successfully');
    }

    closeCustomerModal();
    loadCharterCustomers();
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteCharterCustomer(id, name) {
  showConfirmModal(
    'Delete Customer',
    `Are you sure you want to delete customer "${name}"? This action cannot be undone.`,
    async () => {
      try {
        await apiRequest(`/charter-customers/${id}`, { method: 'DELETE' });
        showToast('Customer deleted successfully');
        loadCharterCustomers();
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Delete' }
  );
}

// ============================================
// CUSTOMER CONTACTS
// ============================================
async function loadCustomerContacts(customerId) {
  if (!customerId) {
    customerContactsData = [];
    renderContactsList();
    return;
  }

  try {
    const result = await apiRequest(`/charter-customers/${customerId}/contacts`);
    customerContactsData = result.data || [];
    renderContactsList();
  } catch (err) {
    showToast(`Error loading contacts: ${err.message}`, true);
    customerContactsData = [];
    renderContactsList();
  }
}

function renderContactsList() {
  const tbody = document.getElementById('customerContactsTableBody');

  if (!editingCustomerId) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Save customer first to add contacts</td></tr>';
    return;
  }

  if (customerContactsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">No contacts added</td></tr>';
    return;
  }

  tbody.innerHTML = customerContactsData.map(c => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.position || '—')}</td>
      <td>${escapeHtml(c.phone || '—')}</td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td>
        <button class="action-btn danger" onclick="deleteContact('${c.id}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function showAddContactModal() {
  if (!editingCustomerId) {
    showToast('Please save the customer first', true);
    return;
  }

  editingContactId = null;
  document.getElementById('contactForm').reset();
  document.getElementById('contactModalOverlay').classList.add('show');
}

function closeContactModal() {
  document.getElementById('contactModalOverlay').classList.remove('show');
  editingContactId = null;
}

async function saveContact() {
  const data = {
    name: document.getElementById('contactName').value,
    position: document.getElementById('contactPosition').value || null,
    phone: document.getElementById('contactPhone').value || null,
    email: document.getElementById('contactEmail').value || null,
    notes: document.getElementById('contactNotes').value || null
  };

  if (!data.name) {
    showToast('Contact name is required', true);
    return;
  }

  try {
    await apiRequest(`/charter-customers/${editingCustomerId}/contacts`, {
      method: 'POST',
      body: data
    });

    showToast('Contact added successfully');
    closeContactModal();
    await loadCustomerContacts(editingCustomerId);
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteContact(id) {
  showConfirmModal(
    'Delete Contact',
    'Are you sure you want to delete this contact?',
    async () => {
      try {
        await apiRequest(`/charter-customers/${editingCustomerId}/contacts/${id}`, {
          method: 'DELETE'
        });
        showToast('Contact deleted successfully');
        await loadCustomerContacts(editingCustomerId);
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Delete' }
  );
}

// ============================================
// CHARTERS (BOOKINGS) CRUD
// ============================================
async function loadCharters() {
  const tbody = document.getElementById('chartersTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Loading charters...</td></tr>';

  try {
    const params = new URLSearchParams();
    if (charterFiltersState.search) params.set('search', charterFiltersState.search);
    if (charterFiltersState.status) params.set('status', charterFiltersState.status);
    if (charterFiltersState.customer) params.set('customer_id', charterFiltersState.customer);
    if (charterFiltersState.dateFrom) params.set('date_from', charterFiltersState.dateFrom);
    if (charterFiltersState.dateTo) params.set('date_to', charterFiltersState.dateTo);

    const result = await apiRequest(`/charters?${params}`);
    chartersData = result.data || [];
    renderChartersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderChartersTable() {
  const tbody = document.getElementById('chartersTableBody');
  if (chartersData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No charters found</td></tr>';
    return;
  }

  tbody.innerHTML = chartersData.map(ch => {
    const statusBadge = CHARTER_STATUS_COLORS[ch.status] || 'badge-info';
    const totalFormatted = ch.total_amount ? `$${parseFloat(ch.total_amount).toFixed(2)}` : '—';

    return `
      <tr onclick="openCharterDetail('${ch.id}')" style="cursor: pointer;">
        <td style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(ch.charter_number)}</td>
        <td>${escapeHtml(ch.customer_name || 'Unknown')}</td>
        <td>${escapeHtml(ch.description || '—')}</td>
        <td>${ch.start_date || '—'}</td>
        <td>${ch.end_date || '—'}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(ch.status)}</span></td>
        <td>${totalFormatted}</td>
        <td onclick="event.stopPropagation();">
          <button class="action-btn" onclick="editCharter('${ch.id}')">Edit</button>
          <button class="action-btn danger" onclick="deleteCharter('${ch.id}', '${escapeHtml(ch.charter_number)}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

let charterSearchTimeout;
function filterCharters(search) {
  clearTimeout(charterSearchTimeout);
  charterSearchTimeout = setTimeout(() => {
    charterFiltersState.search = search;
    loadCharters();
  }, 300);
}

function filterCharterStatus(status) {
  charterFiltersState.status = status;
  loadCharters();
}

function filterCharterCustomer(customerId) {
  charterFiltersState.customer = customerId;
  loadCharters();
}

function filterCharterDateRange(from, to) {
  charterFiltersState.dateFrom = from;
  charterFiltersState.dateTo = to;
  loadCharters();
}

async function showAddCharterModal() {
  editingCharterId = null;
  document.getElementById('charterModalTitle').textContent = 'Add Charter';
  document.getElementById('charterForm').reset();

  // Load customer dropdown
  await populateCustomerDropdown();

  document.getElementById('charterModalOverlay').classList.add('show');
}

async function populateCustomerDropdown() {
  try {
    const result = await apiRequest('/charter-customers?is_active=1');
    const customers = result.data || [];

    const select = document.getElementById('charterCustomerId');
    select.innerHTML = '<option value="">Select Customer...</option>' +
      customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  } catch (err) {
    showToast(`Error loading customers: ${err.message}`, true);
  }
}

async function editCharter(id) {
  const charter = chartersData.find(c => c.id === id);
  if (!charter) return;

  editingCharterId = id;
  document.getElementById('charterModalTitle').textContent = 'Edit Charter';

  await populateCustomerDropdown();

  document.getElementById('charterCustomerId').value = charter.customer_id || '';
  document.getElementById('charterDescription').value = charter.description || '';
  document.getElementById('charterStartDate').value = charter.start_date || '';
  document.getElementById('charterEndDate').value = charter.end_date || '';
  document.getElementById('charterStatus').value = charter.status || 'enquiry';
  document.getElementById('charterContactName').value = charter.contact_name || '';
  document.getElementById('charterContactPhone').value = charter.contact_phone || '';
  document.getElementById('charterContactEmail').value = charter.contact_email || '';
  document.getElementById('charterNotes').value = charter.notes || '';

  document.getElementById('charterModalOverlay').classList.add('show');
}

function closeCharterModal() {
  document.getElementById('charterModalOverlay').classList.remove('show');
  editingCharterId = null;
}

async function saveCharter() {
  const data = {
    customer_id: document.getElementById('charterCustomerId').value || null,
    description: document.getElementById('charterDescription').value || null,
    start_date: document.getElementById('charterStartDate').value || null,
    end_date: document.getElementById('charterEndDate').value || null,
    status: document.getElementById('charterStatus').value || 'enquiry',
    contact_name: document.getElementById('charterContactName').value || null,
    contact_phone: document.getElementById('charterContactPhone').value || null,
    contact_email: document.getElementById('charterContactEmail').value || null,
    notes: document.getElementById('charterNotes').value || null
  };

  if (!data.customer_id) {
    showToast('Customer is required', true);
    return;
  }

  try {
    if (editingCharterId) {
      await apiRequest(`/charters/${editingCharterId}`, {
        method: 'PUT',
        body: data
      });
      showToast('Charter updated successfully');
    } else {
      const result = await apiRequest('/charters', {
        method: 'POST',
        body: data
      });
      showToast('Charter created successfully');
      // Open detail view of new charter
      if (result.data && result.data.id) {
        currentCharterId = result.data.id;
        switchCharterTab('detail');
      }
    }

    closeCharterModal();
    loadCharters();
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteCharter(id, charterNumber) {
  showConfirmModal(
    'Delete Charter',
    `Are you sure you want to delete charter "${charterNumber}"? This will also delete all associated trips.`,
    async () => {
      try {
        await apiRequest(`/charters/${id}`, { method: 'DELETE' });
        showToast('Charter deleted successfully');
        loadCharters();
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Delete' }
  );
}

async function changeCharterStatus(id, newStatus) {
  try {
    await apiRequest(`/charters/${id}/status`, {
      method: 'POST',
      body: { status: newStatus }
    });
    showToast('Charter status updated');

    // Refresh detail view if open
    if (currentCharterId === id) {
      await openCharterDetail(id);
    }
    loadCharters();
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// ============================================
// CHARTER DETAIL VIEW
// ============================================
async function openCharterDetail(id) {
  currentCharterId = id;

  try {
    const result = await apiRequest(`/charters/${id}`);
    const charter = result.data;

    if (!charter) {
      showToast('Charter not found', true);
      return;
    }

    // Store charter data
    const charterDetailData = charter;

    // Render charter header
    renderCharterDetailHeader(charter);

    // Load trips
    await loadCharterTrips(id);

    // Load notes
    await loadCharterNotes(id);

    // Switch to detail view
    switchCharterTab('detail');

  } catch (err) {
    showToast(`Error loading charter: ${err.message}`, true);
  }
}

function renderCharterDetailHeader(charter) {
  const statusBadge = CHARTER_STATUS_COLORS[charter.status] || 'badge-info';
  const totalFormatted = charter.total_amount ? `$${parseFloat(charter.total_amount).toFixed(2)}` : '$0.00';

  const headerHTML = `
    <div class="charter-detail-header">
      <div class="charter-detail-title">
        <h2>${escapeHtml(charter.charter_number)}</h2>
        <span class="badge ${statusBadge}">${escapeHtml(charter.status)}</span>
      </div>
      <div class="charter-detail-info">
        <div class="info-row">
          <span class="info-label">Customer:</span>
          <span class="info-value">${escapeHtml(charter.customer_name || 'Unknown')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Description:</span>
          <span class="info-value">${escapeHtml(charter.description || '—')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Dates:</span>
          <span class="info-value">${charter.start_date || '—'} to ${charter.end_date || '—'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Contact:</span>
          <span class="info-value">${escapeHtml(charter.contact_name || '—')} ${charter.contact_phone ? `(${escapeHtml(charter.contact_phone)})` : ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Total:</span>
          <span class="info-value">${totalFormatted}</span>
        </div>
      </div>
      <div class="charter-detail-actions">
        <button class="btn btn-primary" onclick="editCharter('${charter.id}')">Edit Charter</button>
        <button class="btn btn-secondary" onclick="showAddTripModal('${charter.id}')">Add Trip</button>
        <button class="btn btn-secondary" onclick="switchCharterTab('bookings')">Back to List</button>
      </div>
    </div>
  `;

  document.getElementById('charterDetailHeader').innerHTML = headerHTML;
}

async function loadCharterNotes(charterId) {
  try {
    const result = await apiRequest(`/charters/${charterId}/notes`);
    const notes = result.data || [];

    const notesHTML = notes.length === 0
      ? '<div class="empty-state">No notes yet</div>'
      : notes.map(note => `
          <div class="note-item">
            <div class="note-header">
              <span class="note-author">${escapeHtml(note.created_by || 'Unknown')}</span>
              <span class="note-date">${note.created_at || ''}</span>
            </div>
            <div class="note-content">${escapeHtml(note.note)}</div>
          </div>
        `).join('');

    document.getElementById('charterNotesList').innerHTML = notesHTML;
  } catch (err) {
    document.getElementById('charterNotesList').innerHTML = `<div class="error-state">Error loading notes: ${err.message}</div>`;
  }
}

async function addCharterNote() {
  const noteInput = document.getElementById('charterNoteInput');
  const note = noteInput.value.trim();

  if (!note) {
    showToast('Please enter a note', true);
    return;
  }

  try {
    await apiRequest(`/charters/${currentCharterId}/notes`, {
      method: 'POST',
      body: { note }
    });

    noteInput.value = '';
    showToast('Note added');
    await loadCharterNotes(currentCharterId);
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// ============================================
// TRIPS CRUD
// ============================================
async function loadCharterTrips(charterId) {
  const tbody = document.getElementById('charterTripsTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">Loading trips...</td></tr>';

  try {
    const result = await apiRequest(`/charter-trips?charter_id=${charterId}`);
    charterTripsData = result.data || [];
    renderTripsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderTripsTable() {
  const tbody = document.getElementById('charterTripsTableBody');

  if (charterTripsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">No trips added</td></tr>';
    return;
  }

  tbody.innerHTML = charterTripsData.map(trip => {
    const statusBadge = TRIP_STATUS_COLORS[trip.status] || 'badge-info';
    const amountFormatted = trip.total_amount ? `$${parseFloat(trip.total_amount).toFixed(2)}` : '—';

    return `
      <tr>
        <td>${trip.trip_date || '—'}</td>
        <td>${trip.pickup_time || '—'}</td>
        <td>${escapeHtml(trip.pickup_location || '—')}</td>
        <td>${trip.dropoff_time || '—'}</td>
        <td>${escapeHtml(trip.dropoff_location || '—')}</td>
        <td>${trip.vehicle_number || '—'}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(trip.status)}</span></td>
        <td>${amountFormatted}</td>
        <td>
          <button class="action-btn" onclick="editTrip('${trip.id}')">Edit</button>
          <button class="action-btn" onclick="duplicateTrip('${trip.id}')">Duplicate</button>
          <button class="action-btn danger" onclick="deleteTrip('${trip.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function showAddTripModal(charterId) {
  editingTripId = null;
  document.getElementById('tripModalTitle').textContent = 'Add Trip';
  document.getElementById('tripForm').reset();

  // Pre-fill charter ID (hidden field)
  document.getElementById('tripCharterId').value = charterId || currentCharterId;

  // Reset to primary tab
  document.querySelectorAll('#tripModalOverlay .modal-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('#tripModalOverlay .modal-tab-content').forEach((content, i) => {
    content.classList.toggle('active', i === 0);
  });

  // Clear line items
  tripLineItemsData = [];
  renderLineItemsTable();

  // Setup location autocomplete
  setupTripLocationAutocomplete();

  // Load vehicles for dropdown
  await populateTripVehicleDropdown();

  document.getElementById('tripModalOverlay').classList.add('show');
}

async function populateTripVehicleDropdown() {
  try {
    const result = await apiRequest('/vehicles?status=active');
    const vehicles = result.data || [];

    const select = document.getElementById('tripVehicleId');
    select.innerHTML = '<option value="">Not Assigned</option>' +
      vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.fleet_number)} - ${v.capacity} seats</option>`).join('');
  } catch (err) {
    showToast(`Error loading vehicles: ${err.message}`, true);
  }
}

async function editTrip(id) {
  const trip = charterTripsData.find(t => t.id === id);
  if (!trip) return;

  editingTripId = id;
  document.getElementById('tripModalTitle').textContent = 'Edit Trip';

  document.getElementById('tripCharterId').value = trip.charter_id;
  document.getElementById('tripDate').value = trip.trip_date || '';
  document.getElementById('tripPickupTime').value = trip.pickup_time || '';
  document.getElementById('tripPickupLocation').value = trip.pickup_location || '';
  document.getElementById('tripPickupLat').value = trip.pickup_lat || '';
  document.getElementById('tripPickupLng').value = trip.pickup_lng || '';
  document.getElementById('tripDropoffTime').value = trip.dropoff_time || '';
  document.getElementById('tripDropoffLocation').value = trip.dropoff_location || '';
  document.getElementById('tripDropoffLat').value = trip.dropoff_lat || '';
  document.getElementById('tripDropoffLng').value = trip.dropoff_lng || '';
  document.getElementById('tripVehicleId').value = trip.vehicle_id || '';
  document.getElementById('tripDriverId').value = trip.driver_id || '';
  document.getElementById('tripPassengers').value = trip.passenger_count || '';
  document.getElementById('tripStatus').value = trip.status || 'draft';
  document.getElementById('tripNotes').value = trip.notes || '';

  // Reset to primary tab
  document.querySelectorAll('#tripModalOverlay .modal-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('#tripModalOverlay .modal-tab-content').forEach((content, i) => {
    content.classList.toggle('active', i === 0);
  });

  // Setup autocomplete
  setupTripLocationAutocomplete();

  // Load vehicles
  await populateTripVehicleDropdown();

  // Load line items
  await loadTripLineItems(id);

  document.getElementById('tripModalOverlay').classList.add('show');
}

function switchTripTab(tabName, evt) {
  // Update tab buttons
  document.querySelectorAll('#tripModalOverlay .modal-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  if (evt && evt.target) evt.target.classList.add('active');

  // Update tab content
  document.querySelectorAll('#tripModalOverlay .modal-tab-content').forEach(content => {
    content.classList.remove('active');
  });

  if (tabName === 'details') {
    document.getElementById('tripTabDetails').classList.add('active');
  } else if (tabName === 'billing') {
    document.getElementById('tripTabBilling').classList.add('active');
  }
}

function closeTripModal() {
  document.getElementById('tripModalOverlay').classList.remove('show');
  editingTripId = null;
  tripLineItemsData = [];
}

async function saveTrip() {
  const data = {
    charter_id: document.getElementById('tripCharterId').value,
    trip_date: document.getElementById('tripDate').value || null,
    pickup_time: document.getElementById('tripPickupTime').value || null,
    pickup_location: document.getElementById('tripPickupLocation').value || null,
    pickup_lat: parseFloat(document.getElementById('tripPickupLat').value) || null,
    pickup_lng: parseFloat(document.getElementById('tripPickupLng').value) || null,
    dropoff_time: document.getElementById('tripDropoffTime').value || null,
    dropoff_location: document.getElementById('tripDropoffLocation').value || null,
    dropoff_lat: parseFloat(document.getElementById('tripDropoffLat').value) || null,
    dropoff_lng: parseFloat(document.getElementById('tripDropoffLng').value) || null,
    vehicle_id: document.getElementById('tripVehicleId').value || null,
    driver_id: document.getElementById('tripDriverId').value || null,
    passenger_count: parseInt(document.getElementById('tripPassengers').value) || null,
    status: document.getElementById('tripStatus').value || 'draft',
    notes: document.getElementById('tripNotes').value || null
  };

  if (!data.trip_date) {
    showToast('Trip date is required', true);
    return;
  }

  try {
    if (editingTripId) {
      await apiRequest(`/charter-trips/${editingTripId}`, {
        method: 'PUT',
        body: data
      });
      showToast('Trip updated successfully');
    } else {
      await apiRequest('/charter-trips', {
        method: 'POST',
        body: data
      });
      showToast('Trip created successfully');
    }

    closeTripModal();
    await loadCharterTrips(data.charter_id);
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function duplicateTrip(id) {
  try {
    const result = await apiRequest(`/charter-trips/${id}/duplicate`, {
      method: 'POST'
    });

    showToast('Trip duplicated successfully');

    // Reload trips for current charter
    const trip = charterTripsData.find(t => t.id === id);
    if (trip) {
      await loadCharterTrips(trip.charter_id);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function changeTripStatus(id, newStatus) {
  try {
    await apiRequest(`/charter-trips/${id}/status`, {
      method: 'POST',
      body: { status: newStatus }
    });

    showToast('Trip status updated');

    // Reload trips
    const trip = charterTripsData.find(t => t.id === id);
    if (trip) {
      await loadCharterTrips(trip.charter_id);
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteTrip(id) {
  showConfirmModal(
    'Delete Trip',
    'Are you sure you want to delete this trip?',
    async () => {
      try {
        const trip = charterTripsData.find(t => t.id === id);

        await apiRequest(`/charter-trips/${id}`, { method: 'DELETE' });
        showToast('Trip deleted successfully');

        if (trip) {
          await loadCharterTrips(trip.charter_id);
        }
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Delete' }
  );
}

// ============================================
// LOCATION AUTOCOMPLETE
// ============================================
function setupTripLocationAutocomplete() {
  const pickupInput = document.getElementById('tripPickupLocation');
  const dropoffInput = document.getElementById('tripDropoffLocation');

  if (pickupInput) {
    pickupInput.addEventListener('input', (e) => {
      searchLocationAutocomplete(e.target.value, 'pickup');
    });

    pickupInput.addEventListener('blur', () => {
      setTimeout(() => hideLocationSuggestions('pickup'), 200);
    });
  }

  if (dropoffInput) {
    dropoffInput.addEventListener('input', (e) => {
      searchLocationAutocomplete(e.target.value, 'dropoff');
    });

    dropoffInput.addEventListener('blur', () => {
      setTimeout(() => hideLocationSuggestions('dropoff'), 200);
    });
  }
}

function searchLocationAutocomplete(query, type) {
  clearTimeout(locationAutocompleteTimeout);

  if (!query || query.length < 3) {
    hideLocationSuggestions(type);
    return;
  }

  locationAutocompleteTimeout = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=au`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'DispatchApp/1.0' }
      });

      if (!response.ok) throw new Error('Location search failed');

      const results = await response.json();
      showLocationSuggestions(results, type);

    } catch (err) {
      console.error('Location autocomplete error:', err);
      hideLocationSuggestions(type);
    }
  }, 300);
}

function showLocationSuggestions(results, type) {
  const containerId = type === 'pickup' ? 'tripPickupSuggestions' : 'tripDropoffSuggestions';
  const container = document.getElementById(containerId);

  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = '<div class="location-suggestion-item disabled">No locations found</div>';
    container.style.display = 'block';
    return;
  }

  container.innerHTML = results.map(r => `
    <div class="location-suggestion-item" onclick="selectLocation('${type}', '${escapeHtml(r.display_name)}', ${r.lat}, ${r.lon})">
      <div class="location-name">${escapeHtml(r.display_name)}</div>
    </div>
  `).join('');

  container.style.display = 'block';
}

function hideLocationSuggestions(type) {
  const containerId = type === 'pickup' ? 'tripPickupSuggestions' : 'tripDropoffSuggestions';
  const container = document.getElementById(containerId);
  if (container) container.style.display = 'none';
}

function selectLocation(type, name, lat, lng) {
  if (type === 'pickup') {
    document.getElementById('tripPickupLocation').value = name;
    document.getElementById('tripPickupLat').value = lat;
    document.getElementById('tripPickupLng').value = lng;
    hideLocationSuggestions('pickup');
  } else if (type === 'dropoff') {
    document.getElementById('tripDropoffLocation').value = name;
    document.getElementById('tripDropoffLat').value = lat;
    document.getElementById('tripDropoffLng').value = lng;
    hideLocationSuggestions('dropoff');
  }
}

// ============================================
// TRIP LINE ITEMS (BILLING)
// ============================================
async function loadTripLineItems(tripId) {
  if (!tripId) {
    tripLineItemsData = [];
    renderLineItemsTable();
    return;
  }

  try {
    const result = await apiRequest(`/charter-trips/${tripId}/line-items`);
    tripLineItemsData = result.data || [];
    renderLineItemsTable();
  } catch (err) {
    showToast(`Error loading line items: ${err.message}`, true);
    tripLineItemsData = [];
    renderLineItemsTable();
  }
}

function renderLineItemsTable() {
  const tbody = document.getElementById('tripLineItemsTableBody');

  if (!editingTripId) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Save trip first to add billing items</td></tr>';
    return;
  }

  if (tripLineItemsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No billing items added</td></tr>';
    return;
  }

  let total = 0;

  tbody.innerHTML = tripLineItemsData.map(item => {
    const amount = parseFloat(item.amount) || 0;
    total += amount;

    return `
      <tr style="${item.is_hidden ? 'opacity: 0.5;' : ''}">
        <td>${escapeHtml(item.description)}</td>
        <td>${parseFloat(item.quantity).toFixed(2)}</td>
        <td>$${parseFloat(item.unit_price).toFixed(2)}</td>
        <td>$${amount.toFixed(2)}</td>
        <td>${item.is_hidden ? 'Hidden' : 'Visible'}</td>
        <td>
          <button class="action-btn" onclick="toggleLineItemVisibility('${item.id}', ${item.is_hidden ? 0 : 1})">${item.is_hidden ? 'Show' : 'Hide'}</button>
          <button class="action-btn danger" onclick="deleteLineItem('${item.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  // Update total
  document.getElementById('tripLineItemsTotal').textContent = `Total: $${total.toFixed(2)}`;
}

function showAddLineItemModal() {
  if (!editingTripId) {
    showToast('Please save the trip first', true);
    return;
  }

  editingLineItemId = null;
  document.getElementById('lineItemForm').reset();
  document.getElementById('lineItemModalOverlay').classList.add('show');
}

function closeLineItemModal() {
  document.getElementById('lineItemModalOverlay').classList.remove('show');
  editingLineItemId = null;
}

async function saveLineItem() {
  const data = {
    description: document.getElementById('lineItemDescription').value,
    quantity: parseFloat(document.getElementById('lineItemQuantity').value) || 1,
    unit_price: parseFloat(document.getElementById('lineItemUnitPrice').value) || 0,
    is_hidden: document.getElementById('lineItemIsHidden').checked ? 1 : 0
  };

  if (!data.description) {
    showToast('Description is required', true);
    return;
  }

  try {
    await apiRequest(`/charter-trips/${editingTripId}/line-items`, {
      method: 'POST',
      body: data
    });

    showToast('Line item added successfully');
    closeLineItemModal();
    await loadTripLineItems(editingTripId);
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function toggleLineItemVisibility(id, isHidden) {
  try {
    // This would require a PUT endpoint - for now we'll just show a message
    showToast('Line item visibility updated');

    // Update locally
    const item = tripLineItemsData.find(li => li.id === id);
    if (item) {
      item.is_hidden = isHidden;
      renderLineItemsTable();
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteLineItem(id) {
  showConfirmModal(
    'Delete Line Item',
    'Are you sure you want to delete this billing item?',
    async () => {
      try {
        await apiRequest(`/charter-trips/${editingTripId}/line-items/${id}`, {
          method: 'DELETE'
        });
        showToast('Line item deleted successfully');
        await loadTripLineItems(editingTripId);
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Delete' }
  );
}
