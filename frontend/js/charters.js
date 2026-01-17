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
let currentCharterView = 'customers'; // 'customers', 'bookings'
let currentCharterId = null;
let currentCharterData = null;
let customerContactsData = [];
let editingContactId = null;
let tripLineItemsData = [];
let editingLineItemId = null;
let charterDetailTab = 'charter'; // 'charter', 'trips', 'billing', 'history'

// Journey editor state (like duty lines in shifts)
let tripJourneys = [];

// Location autocomplete state
let journeyAutocompleteTimeout = null;
let activeLocationInput = null;

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
// CHARTER TAB NAVIGATION (Main screen tabs)
// ============================================
function switchCharterTab(tab) {
  currentCharterView = tab;

  // Update tab buttons
  document.querySelectorAll('#screen-charters .hrm-tab').forEach(btn => {
    btn.classList.remove('active');
  });

  // Find and activate the correct tab button
  const tabBtns = document.querySelectorAll('#screen-charters .hrm-tab');
  tabBtns.forEach(btn => {
    const btnText = btn.textContent.toLowerCase();
    if ((tab === 'customers' && btnText === 'customers') ||
        (tab === 'bookings' && btnText === 'bookings')) {
      btn.classList.add('active');
    }
  });

  // Hide all tab content
  const customersTab = document.getElementById('charterTabCustomers');
  const bookingsTab = document.getElementById('charterTabBookings');

  if (customersTab) customersTab.style.display = 'none';
  if (bookingsTab) bookingsTab.style.display = 'none';

  // Show target tab
  if (tab === 'customers') {
    if (customersTab) {
      customersTab.style.display = 'block';
      customersTab.classList.add('active');
    }
    loadCharterCustomers();
  } else if (tab === 'bookings') {
    if (bookingsTab) {
      bookingsTab.style.display = 'block';
      bookingsTab.classList.add('active');
    }
    loadCharters();
  }
}

// ============================================
// CUSTOMERS CRUD
// ============================================
async function loadCharterCustomers() {
  const tbody = document.getElementById('charterCustomersTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Loading customers...</td></tr>';

  try {
    const result = await apiRequest('/charter-customers');
    charterCustomersData = result.data || [];
    renderCustomersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderCustomersTable() {
  const tbody = document.getElementById('charterCustomersTableBody');
  if (!tbody) return;

  if (charterCustomersData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No customers found. Click "+ Add Customer" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = charterCustomersData.map(c => {
    const statusBadge = c.account_status === 'active' ? 'badge-success' :
                        c.account_status === 'on_hold' ? 'badge-warning' : 'badge-error';

    return `
      <tr>
        <td>${escapeHtml(c.name || c.company_name || '')}</td>
        <td>${escapeHtml(c.primary_contact_name || c.contact_name || '—')}</td>
        <td>${escapeHtml(c.primary_phone || c.contact_phone || '—')}</td>
        <td>${escapeHtml(c.primary_email || c.contact_email || '—')}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(c.account_status || 'active')}</span></td>
        <td>
          <button class="action-btn" onclick="editCharterCustomer('${c.id}')">Edit</button>
          <button class="action-btn danger" onclick="deleteCharterCustomer('${c.id}', '${escapeHtml(c.name || c.company_name || '')}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterCharterCustomers(searchValue) {
  const search = searchValue.toLowerCase();
  const tbody = document.getElementById('charterCustomersTableBody');
  if (!tbody) return;

  const filtered = charterCustomersData.filter(c => {
    const name = (c.name || c.company_name || '').toLowerCase();
    const contact = (c.primary_contact_name || c.contact_name || '').toLowerCase();
    const email = (c.primary_email || c.contact_email || '').toLowerCase();
    return name.includes(search) || contact.includes(search) || email.includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No customers match your search</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const statusBadge = c.account_status === 'active' ? 'badge-success' :
                        c.account_status === 'on_hold' ? 'badge-warning' : 'badge-error';

    return `
      <tr>
        <td>${escapeHtml(c.name || c.company_name || '')}</td>
        <td>${escapeHtml(c.primary_contact_name || c.contact_name || '—')}</td>
        <td>${escapeHtml(c.primary_phone || c.contact_phone || '—')}</td>
        <td>${escapeHtml(c.primary_email || c.contact_email || '—')}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(c.account_status || 'active')}</span></td>
        <td>
          <button class="action-btn" onclick="editCharterCustomer('${c.id}')">Edit</button>
          <button class="action-btn danger" onclick="deleteCharterCustomer('${c.id}', '${escapeHtml(c.name || c.company_name || '')}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterCustomerStatus(status) {
  if (!status) {
    renderCustomersTable();
    return;
  }

  const tbody = document.getElementById('charterCustomersTableBody');
  if (!tbody) return;

  const filtered = charterCustomersData.filter(c => c.account_status === status);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">No ${status} customers found</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const statusBadge = c.account_status === 'active' ? 'badge-success' :
                        c.account_status === 'on_hold' ? 'badge-warning' : 'badge-error';

    return `
      <tr>
        <td>${escapeHtml(c.name || c.company_name || '')}</td>
        <td>${escapeHtml(c.primary_contact_name || c.contact_name || '—')}</td>
        <td>${escapeHtml(c.primary_phone || c.contact_phone || '—')}</td>
        <td>${escapeHtml(c.primary_email || c.contact_email || '—')}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(c.account_status || 'active')}</span></td>
        <td>
          <button class="action-btn" onclick="editCharterCustomer('${c.id}')">Edit</button>
          <button class="action-btn danger" onclick="deleteCharterCustomer('${c.id}', '${escapeHtml(c.name || c.company_name || '')}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function showAddCustomerModal() {
  editingCustomerId = null;
  const title = document.getElementById('customerModalTitle');
  if (title) title.textContent = 'Add Customer';

  const form = document.getElementById('customerForm');
  if (form) form.reset();

  switchCustomerModalTab('details');
  customerContactsData = [];
  renderContactsList();

  const modal = document.getElementById('charterCustomerModalOverlay');
  if (modal) modal.classList.add('show');
}

async function editCharterCustomer(id) {
  const customer = charterCustomersData.find(c => c.id === id);
  if (!customer) return;

  editingCustomerId = id;
  const title = document.getElementById('customerModalTitle');
  if (title) title.textContent = 'Edit Customer';

  setInputValue('custCompanyName', customer.name || customer.company_name);
  setInputValue('custTradingName', customer.trading_name);
  setInputValue('custAbn', customer.abn);
  setInputValue('custWebsite', customer.website);
  setInputValue('custBillingAddress', customer.billing_address);
  setInputValue('custBillingSuburb', customer.billing_suburb);
  setInputValue('custBillingState', customer.billing_state);
  setInputValue('custBillingPostcode', customer.billing_postcode);
  setInputValue('custPrimaryEmail', customer.primary_email || customer.billing_email || customer.contact_email);
  setInputValue('custPrimaryPhone', customer.primary_phone || customer.contact_phone);
  setInputValue('custPaymentTerms', customer.payment_terms || 14);
  setInputValue('custCreditLimit', customer.credit_limit || 0);
  setInputValue('custAccountStatus', customer.account_status || 'active');
  setInputValue('custNotes', customer.notes);

  switchCustomerModalTab('details');
  await loadCustomerContacts(id);

  const modal = document.getElementById('charterCustomerModalOverlay');
  if (modal) modal.classList.add('show');
}

function switchCustomerModalTab(tabName, evt) {
  document.querySelectorAll('#charterCustomerModalOverlay .modal-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  if (evt && evt.target) {
    evt.target.classList.add('active');
  } else {
    document.querySelectorAll('#charterCustomerModalOverlay .modal-tab').forEach(tab => {
      if ((tabName === 'details' && tab.textContent === 'Details') ||
          (tabName === 'contacts' && tab.textContent === 'Contacts')) {
        tab.classList.add('active');
      }
    });
  }

  const detailsTab = document.getElementById('customerTabDetails');
  const contactsTab = document.getElementById('customerTabContacts');

  if (detailsTab) detailsTab.style.display = tabName === 'details' ? 'block' : 'none';
  if (contactsTab) contactsTab.style.display = tabName === 'contacts' ? 'block' : 'none';
}

function closeCustomerModal() {
  const modal = document.getElementById('charterCustomerModalOverlay');
  if (modal) modal.classList.remove('show');
  editingCustomerId = null;
  customerContactsData = [];
}

async function saveCharterCustomer() {
  const data = {
    name: getInputValue('custCompanyName'),
    company_name: getInputValue('custCompanyName'),
    trading_name: getInputValue('custTradingName') || null,
    abn: getInputValue('custAbn') || null,
    website: getInputValue('custWebsite') || null,
    billing_address: getInputValue('custBillingAddress') || null,
    billing_suburb: getInputValue('custBillingSuburb') || null,
    billing_state: getInputValue('custBillingState') || null,
    billing_postcode: getInputValue('custBillingPostcode') || null,
    primary_email: getInputValue('custPrimaryEmail') || null,
    billing_email: getInputValue('custPrimaryEmail') || null,
    primary_phone: getInputValue('custPrimaryPhone') || null,
    contact_phone: getInputValue('custPrimaryPhone') || null,
    payment_terms: parseInt(getInputValue('custPaymentTerms')) || 14,
    credit_limit: parseFloat(getInputValue('custCreditLimit')) || 0,
    account_status: getInputValue('custAccountStatus') || 'active',
    is_active: getInputValue('custAccountStatus') === 'active' ? 1 : 0,
    notes: getInputValue('custNotes') || null
  };

  if (!data.name) {
    showToast('Company name is required', true);
    return;
  }

  try {
    if (editingCustomerId) {
      await apiRequest(`/charter-customers/${editingCustomerId}`, { method: 'PUT', body: data });
      showToast('Customer updated successfully');
    } else {
      await apiRequest('/charter-customers', { method: 'POST', body: data });
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
    `Are you sure you want to delete "${name}"? This cannot be undone.`,
    async () => {
      try {
        await apiRequest(`/charter-customers/${id}`, { method: 'DELETE' });
        showToast('Customer deleted');
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
    console.error('Error loading contacts:', err);
    customerContactsData = [];
    renderContactsList();
  }
}

function renderContactsList() {
  const container = document.getElementById('customerContactsList');
  if (!container) return;

  if (!editingCustomerId) {
    container.innerHTML = '<p style="color: var(--text-muted);">Save the customer first to add contacts.</p>';
    return;
  }

  if (customerContactsData.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">No contacts added yet.</p>';
    return;
  }

  container.innerHTML = customerContactsData.map(c => `
    <div class="contact-card" style="border: 1px solid var(--border); padding: 12px; margin-bottom: 8px; border-radius: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div>
          <strong>${escapeHtml(c.first_name || '')} ${escapeHtml(c.last_name || c.name || '')}</strong>
          ${c.role ? `<span style="color: var(--text-muted);"> - ${escapeHtml(c.role)}</span>` : ''}
          ${c.is_primary ? '<span class="badge badge-info" style="margin-left: 8px;">Primary</span>' : ''}
        </div>
        <button class="action-btn danger" onclick="deleteContact('${c.id}')">Remove</button>
      </div>
      <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
        ${c.email ? `<span>${escapeHtml(c.email)}</span>` : ''}
        ${c.phone ? `<span style="margin-left: 12px;">${escapeHtml(c.phone)}</span>` : ''}
        ${c.mobile ? `<span style="margin-left: 12px;">${escapeHtml(c.mobile)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function showAddContactModal() {
  if (!editingCustomerId) {
    showToast('Save the customer first', true);
    return;
  }

  editingContactId = null;
  const title = document.getElementById('contactModalTitle');
  if (title) title.textContent = 'Add Contact';

  const form = document.getElementById('contactForm');
  if (form) form.reset();

  const modal = document.getElementById('contactModalOverlay');
  if (modal) modal.classList.add('show');
}

function closeContactModal() {
  const modal = document.getElementById('contactModalOverlay');
  if (modal) modal.classList.remove('show');
  editingContactId = null;
}

async function saveContact() {
  const data = {
    first_name: getInputValue('contactFirstName'),
    last_name: getInputValue('contactLastName'),
    name: `${getInputValue('contactFirstName')} ${getInputValue('contactLastName')}`.trim(),
    role: getInputValue('contactRole') || null,
    position: getInputValue('contactRole') || null,
    email: getInputValue('contactEmail') || null,
    phone: getInputValue('contactPhone') || null,
    mobile: getInputValue('contactMobile') || null,
    is_primary: document.getElementById('contactIsPrimary')?.checked ? 1 : 0,
    receives_invoices: document.getElementById('contactReceivesInvoices')?.checked ? 1 : 0,
    receives_quotes: document.getElementById('contactReceivesQuotes')?.checked ? 1 : 0
  };

  if (!data.first_name || !data.last_name) {
    showToast('First and last name are required', true);
    return;
  }

  try {
    await apiRequest(`/charter-customers/${editingCustomerId}/contacts`, { method: 'POST', body: data });
    showToast('Contact added');
    closeContactModal();
    await loadCustomerContacts(editingCustomerId);
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteContact(id) {
  showConfirmModal(
    'Remove Contact',
    'Are you sure you want to remove this contact?',
    async () => {
      try {
        await apiRequest(`/charter-customers/${editingCustomerId}/contacts/${id}`, { method: 'DELETE' });
        showToast('Contact removed');
        await loadCustomerContacts(editingCustomerId);
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Remove' }
  );
}

// ============================================
// CHARTERS (BOOKINGS) LIST
// ============================================
async function loadCharters() {
  const tbody = document.getElementById('chartersTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading charters...</td></tr>';

  try {
    const result = await apiRequest('/charters');
    chartersData = result.data || [];
    renderChartersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Error: ${err.message}</td></tr>`;
  }
}

function renderChartersTable() {
  const tbody = document.getElementById('chartersTableBody');
  if (!tbody) return;

  if (chartersData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No charters found. Click "+ New Charter" to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = chartersData.map(ch => {
    const statusBadge = CHARTER_STATUS_COLORS[ch.status] || 'badge-info';
    const displayDate = ch.booking_date || ch.event_date || ch.start_date || '—';

    return `
      <tr style="cursor: pointer;" onclick="openCharterDetail('${ch.id}')">
        <td style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(ch.charter_number || '')}</td>
        <td>${escapeHtml(ch.customer_name || '—')}</td>
        <td>${escapeHtml(ch.name || ch.description || '—')}</td>
        <td>${displayDate}</td>
        <td>${ch.trip_count || 0}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(ch.status || 'enquiry')}</span></td>
        <td onclick="event.stopPropagation();">
          <button class="action-btn" onclick="openCharterDetail('${ch.id}')">Open</button>
          <button class="action-btn danger" onclick="deleteCharter('${ch.id}', '${escapeHtml(ch.charter_number || '')}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterCharters() {
  const searchInput = document.querySelector('#charterTabBookings .filter-input');
  const statusSelect = document.querySelector('#charterTabBookings .filter-select');

  const search = (searchInput?.value || '').toLowerCase();
  const status = statusSelect?.value || '';

  const tbody = document.getElementById('chartersTableBody');
  if (!tbody) return;

  let filtered = chartersData;

  // Apply search filter
  if (search) {
    filtered = filtered.filter(ch => {
      const charterNum = (ch.charter_number || '').toLowerCase();
      const customerName = (ch.customer_name || '').toLowerCase();
      const name = (ch.name || ch.description || '').toLowerCase();
      return charterNum.includes(search) || customerName.includes(search) || name.includes(search);
    });
  }

  // Apply status filter
  if (status) {
    filtered = filtered.filter(ch => ch.status === status);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No charters match your filters</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(ch => {
    const statusBadge = CHARTER_STATUS_COLORS[ch.status] || 'badge-info';
    const displayDate = ch.booking_date || ch.event_date || ch.start_date || '—';

    return `
      <tr style="cursor: pointer;" onclick="openCharterDetail('${ch.id}')">
        <td style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(ch.charter_number || '')}</td>
        <td>${escapeHtml(ch.customer_name || '—')}</td>
        <td>${escapeHtml(ch.name || ch.description || '—')}</td>
        <td>${displayDate}</td>
        <td>${ch.trip_count || 0}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(ch.status || 'enquiry')}</span></td>
        <td onclick="event.stopPropagation();">
          <button class="action-btn" onclick="openCharterDetail('${ch.id}')">Open</button>
          <button class="action-btn danger" onclick="deleteCharter('${ch.id}', '${escapeHtml(ch.charter_number || '')}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================
// CHARTER DETAIL MODAL (Large Tabbed Modal)
// ============================================
async function openCharterDetail(id) {
  currentCharterId = id;
  charterDetailTab = 'charter';

  // Create or get the modal
  let modal = document.getElementById('charterDetailModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'charterDetailModalOverlay';
    modal.className = 'crud-modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="crud-modal charter-detail-modal">
      <div class="crud-modal-header">
        <span class="crud-modal-title" id="charterDetailTitle">Loading...</span>
        <button type="button" class="crud-modal-close" onclick="closeCharterDetailModal()">&times;</button>
      </div>
      <div class="crud-modal-body">
        <div class="charter-placeholder">Loading charter details...</div>
      </div>
    </div>
  `;

  modal.classList.add('show');

  // Load the charter data
  try {
    const result = await apiRequest(`/charters/${id}`);
    currentCharterData = result.data;

    if (!currentCharterData) {
      showToast('Charter not found', true);
      closeCharterDetailModal();
      return;
    }

    // Load trips
    const tripsResult = await apiRequest(`/charter-trips?charter_id=${id}`);
    charterTripsData = tripsResult.data || [];

    renderCharterDetailModal();
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
    closeCharterDetailModal();
  }
}

function closeCharterDetailModal() {
  const modal = document.getElementById('charterDetailModalOverlay');
  if (modal) modal.classList.remove('show');
  currentCharterId = null;
  currentCharterData = null;
}

function switchCharterDetailTab(tab) {
  charterDetailTab = tab;
  renderCharterDetailModalContent();
}

function renderCharterDetailModal() {
  const modal = document.getElementById('charterDetailModalOverlay');
  if (!modal || !currentCharterData) return;

  const charter = currentCharterData;
  const statusBadge = CHARTER_STATUS_COLORS[charter.status] || 'badge-info';

  const modalContent = modal.querySelector('.crud-modal');
  modalContent.innerHTML = `
    <div class="crud-modal-header">
      <div style="display: flex; align-items: center; gap: 16px;">
        <span class="crud-modal-title" style="font-family: 'JetBrains Mono', monospace; font-size: 18px;">
          ${escapeHtml(charter.charter_number || 'NEW')}
        </span>
        <span class="badge ${statusBadge}">${escapeHtml(charter.status || 'enquiry')}</span>
        <span style="color: var(--text-secondary); font-size: 13px;">
          ${escapeHtml(charter.customer_name || '')}
          ${charter.name ? ` - ${escapeHtml(charter.name)}` : ''}
        </span>
      </div>
      <button type="button" class="crud-modal-close" onclick="closeCharterDetailModal()">&times;</button>
    </div>

    <!-- Tab Navigation -->
    <div class="modal-tabs">
      <button type="button" class="modal-tab ${charterDetailTab === 'charter' ? 'active' : ''}" onclick="switchCharterDetailTab('charter')">Charter</button>
      <button type="button" class="modal-tab ${charterDetailTab === 'trips' ? 'active' : ''}" onclick="switchCharterDetailTab('trips')">Trips</button>
      <button type="button" class="modal-tab ${charterDetailTab === 'billing' ? 'active' : ''}" onclick="switchCharterDetailTab('billing')">Billing</button>
      <button type="button" class="modal-tab ${charterDetailTab === 'history' ? 'active' : ''}" onclick="switchCharterDetailTab('history')">History</button>
    </div>

    <div class="charter-detail-content" id="charterDetailContent">
      <!-- Tab content rendered here -->
    </div>
  `;

  renderCharterDetailModalContent();
}

function renderCharterDetailModalContent() {
  const container = document.getElementById('charterDetailContent');
  if (!container || !currentCharterData) return;

  const charter = currentCharterData;

  switch (charterDetailTab) {
    case 'charter':
      container.innerHTML = renderCharterTabContent(charter);
      break;
    case 'trips':
      container.innerHTML = renderTripsTabContent();
      break;
    case 'billing':
      container.innerHTML = renderBillingTabContent(charter);
      break;
    case 'history':
      container.innerHTML = renderHistoryTabContent(charter);
      break;
  }
}

function renderCharterTabContent(charter) {
  return `
    <div class="charter-detail-grid">
      <div class="charter-detail-section">
        <h4 class="charter-section-title">Charter Details</h4>
        <div class="charter-form-group">
          <label class="charter-form-label">Charter Name</label>
          <input type="text" id="charterDetailName" class="charter-form-input" value="${escapeHtml(charter.name || '')}"
            onchange="updateCharterField('name', this.value)">
        </div>
        <div class="charter-form-group">
          <label class="charter-form-label">Description</label>
          <textarea id="charterDetailDesc" class="charter-form-input" rows="3"
            onchange="updateCharterField('description', this.value)">${escapeHtml(charter.description || '')}</textarea>
        </div>
        <div class="charter-form-group">
          <label class="charter-form-label">Event Date</label>
          <input type="date" id="charterDetailDate" class="charter-form-input" value="${charter.booking_date || charter.event_date || ''}"
            onchange="updateCharterField('booking_date', this.value)">
        </div>
        <div class="charter-form-group">
          <label class="charter-form-label">Status</label>
          <select id="charterDetailStatus" class="charter-form-input" onchange="updateCharterField('status', this.value)">
            <option value="enquiry" ${charter.status === 'enquiry' ? 'selected' : ''}>Enquiry</option>
            <option value="quoted" ${charter.status === 'quoted' ? 'selected' : ''}>Quoted</option>
            <option value="confirmed" ${charter.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="completed" ${charter.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="invoiced" ${charter.status === 'invoiced' ? 'selected' : ''}>Invoiced</option>
            <option value="paid" ${charter.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="cancelled" ${charter.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>
      <div class="charter-detail-section">
        <h4 class="charter-section-title">Customer Information</h4>
        <div class="charter-info-card">
          <p style="margin: 0 0 6px 0; font-weight: 600;">${escapeHtml(charter.customer_name || '')}</p>
          <p style="margin: 0; color: var(--text-muted); font-size: 12px;">
            ${charter.customer_email ? `Email: ${escapeHtml(charter.customer_email)}<br>` : ''}
            ${charter.customer_phone ? `Phone: ${escapeHtml(charter.customer_phone)}` : ''}
          </p>
        </div>

        <h4 class="charter-section-title" style="margin-top: 20px;">Summary</h4>
        <div class="charter-summary-grid">
          <div class="charter-summary-card">
            <div class="charter-summary-value">${charterTripsData.length}</div>
            <div class="charter-summary-label">Total Trips</div>
          </div>
          <div class="charter-summary-card">
            <div class="charter-summary-value">${charterTripsData.reduce((sum, t) => sum + (t.passenger_count || 0), 0)}</div>
            <div class="charter-summary-label">Total Passengers</div>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px;">
      <button type="button" class="btn-secondary" onclick="closeCharterDetailModal()">Close</button>
      <button type="button" class="btn-primary" onclick="saveCharterDetails()">Save Changes</button>
    </div>
  `;
}

function renderTripsTabContent() {
  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h4 style="margin: 0; color: var(--text-secondary);">Trips</h4>
      <button type="button" class="btn-primary" onclick="showAddTripModal()">+ Add Trip</button>
    </div>

    <div class="screen-table-container" style="max-height: calc(100% - 60px); overflow-y: auto;">
      <table class="screen-table">
        <thead>
          <tr>
            <th>Trip</th>
            <th>Date</th>
            <th style="text-align: center;">Journeys</th>
            <th style="text-align: center;">Passengers</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${charterTripsData.length === 0
            ? '<tr><td colspan="6" class="loading-cell">No trips yet. Click "+ Add Trip" to create one.</td></tr>'
            : charterTripsData.map(trip => {
                const tripStatus = trip.operational_status || trip.status || 'draft';
                const statusBadge = TRIP_STATUS_COLORS[tripStatus] || 'badge-info';
                const journeyCount = trip.journey_count !== undefined ? trip.journey_count : '—';

                return `
                  <tr style="cursor: pointer;" onclick="editTrip('${trip.id}')">
                    <td>${escapeHtml(trip.name || trip.trip_name || `Trip ${trip.trip_number || ''}`)}</td>
                    <td>${trip.trip_date || '—'}</td>
                    <td style="text-align: center; font-family: 'JetBrains Mono', monospace;">${journeyCount}</td>
                    <td style="text-align: center;">${trip.passenger_count || '—'}</td>
                    <td><span class="badge ${statusBadge}">${escapeHtml(tripStatus)}</span></td>
                    <td onclick="event.stopPropagation();">
                      <button class="action-btn" onclick="editTrip('${trip.id}')">Edit</button>
                      <button class="action-btn danger" onclick="deleteTrip('${trip.id}')">Delete</button>
                    </td>
                  </tr>
                `;
              }).join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderBillingTabContent(charter) {
  return `
    <div class="charter-placeholder">
      <h4>Billing</h4>
      <p>Billing functionality coming soon.</p>
      <p>This will include invoices, payments, and billing line items.</p>
    </div>
  `;
}

function renderHistoryTabContent(charter) {
  return `
    <div class="charter-placeholder">
      <h4>History</h4>
      <p>Audit history coming soon.</p>
      <p>This will show all changes made to this charter.</p>
    </div>
  `;
}

async function updateCharterField(field, value) {
  if (currentCharterData) {
    currentCharterData[field] = value;
  }
}

async function saveCharterDetails() {
  if (!currentCharterId || !currentCharterData) return;

  const data = {
    name: currentCharterData.name,
    description: currentCharterData.description,
    booking_date: currentCharterData.booking_date,
    status: currentCharterData.status
  };

  try {
    await apiRequest(`/charters/${currentCharterId}`, { method: 'PUT', body: data });
    showToast('Charter saved');
    renderCharterDetailModal();
    loadCharters(); // Refresh the list in background
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// ============================================
// QUICK ADD CHARTER MODAL (Small Modal)
// ============================================
async function showAddCharterModal() {
  editingCharterId = null;
  const title = document.getElementById('charterModalTitle');
  if (title) title.textContent = 'New Charter';

  const form = document.getElementById('charterForm');
  if (form) form.reset();

  await populateCustomerDropdown();

  const modal = document.getElementById('charterModalOverlay');
  if (modal) modal.classList.add('show');
}

async function populateCustomerDropdown() {
  try {
    const result = await apiRequest('/charter-customers');
    const customers = result.data || [];

    const select = document.getElementById('charterCustomerId');
    if (select) {
      select.innerHTML = '<option value="">-- Select Customer --</option>' +
        customers.map(c => `<option value="${c.id}">${escapeHtml(c.name || c.company_name || '')}</option>`).join('');
    }
  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function closeCharterModal() {
  const modal = document.getElementById('charterModalOverlay');
  if (modal) modal.classList.remove('show');
  editingCharterId = null;
}

async function saveCharter() {
  const data = {
    customer_id: getInputValue('charterCustomerId') || null,
    name: getInputValue('charterName') || null,
    description: getInputValue('charterDescription') || null,
    booking_date: getInputValue('charterEventDate') || null,
    status: 'enquiry'
  };

  if (!data.customer_id) {
    showToast('Please select a customer', true);
    return;
  }

  try {
    const result = await apiRequest('/charters', { method: 'POST', body: data });
    showToast('Charter created');
    closeCharterModal();

    // Open the detail modal for the new charter
    if (result.data && result.data.id) {
      await openCharterDetail(result.data.id);
    }

    loadCharters();
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteCharter(id, charterNumber) {
  showConfirmModal(
    'Delete Charter',
    `Delete charter "${charterNumber}"? All trips will also be deleted.`,
    async () => {
      try {
        await apiRequest(`/charters/${id}`, { method: 'DELETE' });
        showToast('Charter deleted');
        loadCharters();
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Delete' }
  );
}

// ============================================
// TRIPS CRUD
// ============================================
function showAddTripModal(charterId) {
  editingTripId = null;
  tripJourneys = [];

  const title = document.getElementById('tripModalTitle');
  if (title) title.textContent = 'Add Trip';

  const form = document.getElementById('tripForm');
  if (form) form.reset();

  currentCharterId = charterId || currentCharterId;

  addJourney();
  renderTripJourneys();

  const modal = document.getElementById('charterTripModalOverlay');
  if (modal) modal.classList.add('show');
}

async function editTrip(id) {
  const trip = charterTripsData.find(t => t.id === id);
  if (!trip) {
    try {
      const result = await apiRequest(`/charter-trips/${id}`);
      if (result.data) {
        await editTripWithData(result.data);
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, true);
    }
    return;
  }

  // Fetch full trip data with journeys
  try {
    const result = await apiRequest(`/charter-trips/${id}`);
    if (result.data) {
      await editTripWithData(result.data);
    }
  } catch (err) {
    await editTripWithData(trip);
  }
}

async function editTripWithData(trip) {
  editingTripId = trip.id;
  currentCharterId = trip.charter_id;

  const title = document.getElementById('tripModalTitle');
  if (title) title.textContent = 'Edit Trip';

  setInputValue('tripName', trip.name || trip.trip_name);
  setInputValue('tripDate', trip.trip_date);
  setInputValue('tripPassengerCount', trip.passenger_count);
  setInputValue('tripVehicleCapacity', trip.vehicle_capacity_required || trip.vehicle_capacity);
  setInputValue('tripPassengerNotes', trip.passenger_notes);

  const reqs = parseVehicleRequirements(trip.vehicle_features_required || trip.vehicle_requirements);
  setCheckbox('tripReqWheelchair', reqs.wheelchair);
  setCheckbox('tripReqAc', reqs.ac);
  setCheckbox('tripReqToilet', reqs.toilet);
  setCheckbox('tripReqLuggage', reqs.luggage);
  setCheckbox('tripReqWifi', reqs.wifi);
  setCheckbox('tripReqSeatbelts', reqs.seatbelts);

  // Load journeys
  let journeysData = trip.journeys || [];

  if (journeysData.length === 0) {
    try {
      const journeysResult = await apiRequest(`/charter-journeys?trip_id=${trip.id}`);
      journeysData = journeysResult.data || [];
    } catch (err) {
      console.error('Error loading journeys:', err);
    }
  }

  tripJourneys = journeysData.map(j => ({
    id: j.id,
    sequence: j.sequence,
    pickup_time: j.pickup_time || '',
    pickup_name: j.pickup_name || '',
    pickup_address: j.pickup_address || '',
    pickup_lat: j.pickup_lat,
    pickup_lng: j.pickup_lng,
    dropoff_time: j.dropoff_time || '',
    dropoff_name: j.dropoff_name || '',
    dropoff_address: j.dropoff_address || '',
    dropoff_lat: j.dropoff_lat,
    dropoff_lng: j.dropoff_lng,
    distance_km: j.distance_km,
    journey_time_mins: j.journey_time_mins,
    notes: j.notes || ''
  }));

  if (tripJourneys.length === 0) {
    addJourney();
  }

  renderTripJourneys();

  const modal = document.getElementById('charterTripModalOverlay');
  if (modal) modal.classList.add('show');
}

function parseVehicleRequirements(reqs) {
  if (!reqs) return {};
  try {
    return typeof reqs === 'string' ? JSON.parse(reqs) : reqs;
  } catch (e) {
    return {};
  }
}

function closeTripModal() {
  const modal = document.getElementById('charterTripModalOverlay');
  if (modal) modal.classList.remove('show');
  editingTripId = null;
  tripJourneys = [];
}

async function saveTrip() {
  const vehicleRequirements = {
    wheelchair: document.getElementById('tripReqWheelchair')?.checked || false,
    ac: document.getElementById('tripReqAc')?.checked || false,
    toilet: document.getElementById('tripReqToilet')?.checked || false,
    luggage: document.getElementById('tripReqLuggage')?.checked || false,
    wifi: document.getElementById('tripReqWifi')?.checked || false,
    seatbelts: document.getElementById('tripReqSeatbelts')?.checked || false
  };

  const tripData = {
    charter_id: currentCharterId,
    name: getInputValue('tripName') || null,
    trip_date: getInputValue('tripDate') || null,
    passenger_count: parseInt(getInputValue('tripPassengerCount')) || 1,
    vehicle_capacity_required: parseInt(getInputValue('tripVehicleCapacity')) || null,
    vehicle_features_required: JSON.stringify(vehicleRequirements),
    passenger_notes: getInputValue('tripPassengerNotes') || null,
    operational_status: editingTripId ? undefined : 'draft'
  };

  if (!tripData.trip_date) {
    showToast('Trip date is required', true);
    return;
  }

  if (tripJourneys.length === 0) {
    showToast('At least one journey is required', true);
    return;
  }

  for (let i = 0; i < tripJourneys.length; i++) {
    const j = tripJourneys[i];
    if (!j.pickup_name) {
      showToast(`Journey ${i + 1}: Pickup location is required`, true);
      return;
    }
    if (!j.dropoff_name) {
      showToast(`Journey ${i + 1}: Dropoff location is required`, true);
      return;
    }
    if (!j.pickup_time) {
      showToast(`Journey ${i + 1}: Pickup time is required`, true);
      return;
    }
  }

  try {
    let tripId = editingTripId;

    if (editingTripId) {
      await apiRequest(`/charter-trips/${editingTripId}`, { method: 'PUT', body: tripData });
    } else {
      const result = await apiRequest('/charter-trips', { method: 'POST', body: tripData });
      tripId = result.data.id;
    }

    // Save journeys
    for (let i = 0; i < tripJourneys.length; i++) {
      const j = tripJourneys[i];
      const journeyData = {
        trip_id: tripId,
        sequence: i + 1,
        pickup_time: j.pickup_time,
        pickup_name: j.pickup_name,
        pickup_address: j.pickup_address || null,
        pickup_lat: j.pickup_lat || null,
        pickup_lng: j.pickup_lng || null,
        dropoff_time: j.dropoff_time || null,
        dropoff_name: j.dropoff_name,
        dropoff_address: j.dropoff_address || null,
        dropoff_lat: j.dropoff_lat || null,
        dropoff_lng: j.dropoff_lng || null,
        distance_km: j.distance_km || null,
        journey_time_mins: j.journey_time_mins || null,
        notes: j.notes || null
      };

      if (j.id && !j.id.startsWith('new_')) {
        await apiRequest(`/charter-journeys/${j.id}`, { method: 'PUT', body: journeyData });
      } else {
        await apiRequest('/charter-journeys', { method: 'POST', body: journeyData });
      }
    }

    showToast(editingTripId ? 'Trip updated' : 'Trip created');
    closeTripModal();

    // Reload trips in the charter detail modal
    if (currentCharterId) {
      const tripsResult = await apiRequest(`/charter-trips?charter_id=${currentCharterId}`);
      charterTripsData = tripsResult.data || [];
      renderCharterDetailModalContent();
      loadCharters();
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

async function deleteTrip(id) {
  showConfirmModal(
    'Delete Trip',
    'Are you sure you want to delete this trip and all its journeys?',
    async () => {
      try {
        await apiRequest(`/charter-trips/${id}`, { method: 'DELETE' });
        showToast('Trip deleted');

        // Reload trips
        if (currentCharterId) {
          const tripsResult = await apiRequest(`/charter-trips?charter_id=${currentCharterId}`);
          charterTripsData = tripsResult.data || [];
          renderCharterDetailModalContent();
          loadCharters();
        }
      } catch (err) {
        showToast(`Error: ${err.message}`, true);
      }
    },
    { isDangerous: true, confirmText: 'Delete' }
  );
}

// ============================================
// JOURNEY EDITOR (New Structure)
// ============================================
function addJourney() {
  const newJourney = {
    id: 'new_' + Date.now(),
    sequence: tripJourneys.length + 1,
    pickup_time: '',
    pickup_name: '',
    pickup_address: '',
    pickup_lat: null,
    pickup_lng: null,
    dropoff_time: '',
    dropoff_name: '',
    dropoff_address: '',
    dropoff_lat: null,
    dropoff_lng: null,
    distance_km: null,
    journey_time_mins: null,
    notes: ''
  };
  tripJourneys.push(newJourney);
  renderTripJourneys();
}

function removeJourney(index) {
  if (tripJourneys.length === 1) {
    showToast('At least one journey is required', true);
    return;
  }

  const journey = tripJourneys[index];

  if (journey.id && !journey.id.startsWith('new_')) {
    apiRequest(`/charter-journeys/${journey.id}`, { method: 'DELETE' })
      .catch(err => console.error('Error deleting journey:', err));
  }

  tripJourneys.splice(index, 1);
  tripJourneys.forEach((j, i) => j.sequence = i + 1);
  renderTripJourneys();
}

function moveJourney(index, direction) {
  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= tripJourneys.length) return;

  const temp = tripJourneys[index];
  tripJourneys[index] = tripJourneys[newIndex];
  tripJourneys[newIndex] = temp;

  tripJourneys.forEach((j, i) => j.sequence = i + 1);
  renderTripJourneys();
}

function updateJourney(index, field, value) {
  if (tripJourneys[index]) {
    tripJourneys[index][field] = value;
  }
}

function renderTripJourneys() {
  const container = document.getElementById('tripJourneysContainer');
  if (!container) return;

  if (tripJourneys.length === 0) {
    container.innerHTML = `
      <div class="journey-editor-empty">
        No journeys added. Click "+ Add Journey" to start.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="journey-editor">
      <div class="journey-header">
        <span>#</span>
        <span>Pickup</span>
        <span>Pickup Location</span>
        <span>Dropoff</span>
        <span>Dropoff Location</span>
        <span>Dist</span>
        <span>Mins</span>
        <span>Notes</span>
        <span></span>
      </div>
      ${tripJourneys.map((j, idx) => renderJourneyRow(j, idx)).join('')}
    </div>
    <button type="button" class="journey-add-btn" onclick="addJourney()">+ Add Journey</button>
  `;
}

function renderJourneyRow(journey, index) {
  const distanceDisplay = journey.distance_km ? journey.distance_km.toFixed(1) : '';
  const timeDisplay = journey.journey_time_mins ? journey.journey_time_mins : '';

  return `
    <div class="journey-row">
      <div class="journey-seq-controls">
        <button type="button" class="journey-seq-btn" onclick="moveJourney(${index}, 'up')" ${index === 0 ? 'disabled' : ''}>▲</button>
        <span class="journey-seq-num">${index + 1}</span>
        <button type="button" class="journey-seq-btn" onclick="moveJourney(${index}, 'down')" ${index === tripJourneys.length - 1 ? 'disabled' : ''}>▼</button>
      </div>

      <div>
        <input type="time" class="journey-input journey-input-time" value="${journey.pickup_time || ''}"
          onchange="updateJourney(${index}, 'pickup_time', this.value)">
      </div>

      <div class="journey-location-wrapper">
        <input type="text" class="journey-input" id="journeyPickup_${index}" value="${escapeHtml(journey.pickup_name || '')}"
          oninput="onJourneyLocationInput(${index}, 'pickup', this.value)"
          placeholder="Search location...">
        <div id="journeyPickupSuggestions_${index}" class="journey-location-suggestions" style="display: none;"></div>
      </div>

      <div>
        <input type="time" class="journey-input journey-input-time" value="${journey.dropoff_time || ''}"
          onchange="updateJourney(${index}, 'dropoff_time', this.value); calculateJourneyTime(${index});">
      </div>

      <div class="journey-location-wrapper">
        <input type="text" class="journey-input" id="journeyDropoff_${index}" value="${escapeHtml(journey.dropoff_name || '')}"
          oninput="onJourneyLocationInput(${index}, 'dropoff', this.value)"
          placeholder="Search location...">
        <div id="journeyDropoffSuggestions_${index}" class="journey-location-suggestions" style="display: none;"></div>
      </div>

      <div>
        <input type="number" class="journey-input journey-input-number" step="0.1" value="${distanceDisplay}"
          onchange="updateJourney(${index}, 'distance_km', parseFloat(this.value) || null)"
          placeholder="—">
      </div>

      <div>
        <input type="number" class="journey-input journey-input-number" value="${timeDisplay}"
          onchange="updateJourney(${index}, 'journey_time_mins', parseInt(this.value) || null)"
          placeholder="—">
      </div>

      <div>
        <input type="text" class="journey-input" value="${escapeHtml(journey.notes || '')}"
          onchange="updateJourney(${index}, 'notes', this.value)"
          placeholder="Notes...">
      </div>

      <div style="text-align: center;">
        <button type="button" class="journey-remove-btn" onclick="removeJourney(${index})" title="Remove journey">&times;</button>
      </div>
    </div>
  `;
}

// Calculate journey time from pickup and dropoff times
function calculateJourneyTime(index) {
  const j = tripJourneys[index];
  if (j.pickup_time && j.dropoff_time) {
    const [pickupH, pickupM] = j.pickup_time.split(':').map(Number);
    const [dropoffH, dropoffM] = j.dropoff_time.split(':').map(Number);
    const pickupMins = pickupH * 60 + pickupM;
    const dropoffMins = dropoffH * 60 + dropoffM;
    let diff = dropoffMins - pickupMins;
    if (diff < 0) diff += 24 * 60; // Handle overnight

    // Only update if not already set
    if (!j.journey_time_mins) {
      updateJourney(index, 'journey_time_mins', diff);
      renderTripJourneys();
    }
  }
}

// ============================================
// JOURNEY LOCATION AUTOCOMPLETE + ROUTE CALC
// ============================================
function onJourneyLocationInput(index, type, value) {
  clearTimeout(journeyAutocompleteTimeout);

  const suggestionsId = `journey${type.charAt(0).toUpperCase() + type.slice(1)}Suggestions_${index}`;
  const suggestions = document.getElementById(suggestionsId);

  updateJourney(index, `${type}_name`, value);

  if (!value || value.length < 3) {
    if (suggestions) suggestions.style.display = 'none';
    return;
  }

  activeLocationInput = { index, type };

  journeyAutocompleteTimeout = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&addressdetails=1&limit=5&countrycodes=au`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'DispatchApp/1.0' }
      });

      if (!response.ok) throw new Error('Search failed');

      const results = await response.json();
      showJourneySuggestions(index, type, results);
    } catch (err) {
      console.error('Location search error:', err);
      if (suggestions) suggestions.style.display = 'none';
    }
  }, 300);
}

function showJourneySuggestions(index, type, results) {
  const suggestionsId = `journey${type.charAt(0).toUpperCase() + type.slice(1)}Suggestions_${index}`;
  const suggestions = document.getElementById(suggestionsId);

  if (!suggestions) return;

  if (results.length === 0) {
    suggestions.innerHTML = '<div class="journey-location-item" style="color: var(--text-muted);">No results found</div>';
    suggestions.style.display = 'block';
    return;
  }

  suggestions.innerHTML = results.map(r => `
    <div class="journey-location-item"
         onclick="selectJourneyLocation(${index}, '${type}', '${escapeHtml(r.display_name).replace(/'/g, "\\'")}', ${r.lat}, ${r.lon})">
      ${escapeHtml(r.display_name)}
    </div>
  `).join('');

  suggestions.style.display = 'block';
}

async function selectJourneyLocation(index, type, name, lat, lng) {
  tripJourneys[index][`${type}_name`] = name;
  tripJourneys[index][`${type}_lat`] = lat;
  tripJourneys[index][`${type}_lng`] = lng;

  const inputId = `journey${type.charAt(0).toUpperCase() + type.slice(1)}_${index}`;
  const input = document.getElementById(inputId);
  if (input) input.value = name;

  const suggestionsId = `journey${type.charAt(0).toUpperCase() + type.slice(1)}Suggestions_${index}`;
  const suggestions = document.getElementById(suggestionsId);
  if (suggestions) suggestions.style.display = 'none';

  // If both pickup and dropoff have coords, calculate route
  const j = tripJourneys[index];
  if (j.pickup_lat && j.pickup_lng && j.dropoff_lat && j.dropoff_lng) {
    await calculateJourneyRoute(index);
    // Re-render to show updated distance/time without losing focus
    const distInput = document.querySelector(`.journey-row:nth-child(${index + 2}) input[type="number"][step="0.1"]`);
    const timeInput = document.querySelector(`.journey-row:nth-child(${index + 2}) input[type="number"]:not([step])`);
    if (distInput) distInput.value = tripJourneys[index].distance_km?.toFixed(1) || '';
    if (timeInput) timeInput.value = tripJourneys[index].journey_time_mins || '';

    // Update dropoff time if calculated
    const dropoffTimeInput = document.querySelector(`.journey-row:nth-child(${index + 2}) input[type="time"]:last-of-type`);
    if (dropoffTimeInput && tripJourneys[index].dropoff_time) {
      dropoffTimeInput.value = tripJourneys[index].dropoff_time;
    }
  }
}

async function calculateJourneyRoute(index) {
  const j = tripJourneys[index];
  if (!j.pickup_lat || !j.dropoff_lat) return;

  try {
    // Use OSRM for route calculation (same as app.js fetchOSRMRoute)
    const url = `https://router.project-osrm.org/route/v1/driving/${j.pickup_lng},${j.pickup_lat};${j.dropoff_lng},${j.dropoff_lat}?overview=false`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Route calculation failed');

    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
      throw new Error('No route found');
    }

    const route = data.routes[0];
    const distanceKm = route.distance / 1000; // meters to km
    const durationMins = Math.round(route.duration / 60); // seconds to mins

    // Update journey with calculated values
    tripJourneys[index].distance_km = Math.round(distanceKm * 10) / 10; // 1 decimal
    tripJourneys[index].journey_time_mins = durationMins;

    // Calculate dropoff time if pickup time is set
    if (j.pickup_time && !j.dropoff_time) {
      const [h, m] = j.pickup_time.split(':').map(Number);
      const pickupMins = h * 60 + m;
      const dropoffMins = pickupMins + durationMins;
      const dropoffH = Math.floor(dropoffMins / 60) % 24;
      const dropoffM = dropoffMins % 60;
      tripJourneys[index].dropoff_time = `${String(dropoffH).padStart(2, '0')}:${String(dropoffM).padStart(2, '0')}`;
    }

    console.log(`Route calculated: ${distanceKm.toFixed(1)} km, ${durationMins} mins`);
  } catch (err) {
    console.error('Route calculation error:', err);
    // Don't show error to user - they can enter manually
  }
}

// ============================================
// LINE ITEMS (BILLING)
// ============================================
function showAddLineItemModal() {
  if (!editingTripId) {
    showToast('Save the trip first', true);
    return;
  }

  editingLineItemId = null;
  const form = document.getElementById('lineItemForm');
  if (form) form.reset();

  const modal = document.getElementById('lineItemModalOverlay');
  if (modal) modal.classList.add('show');
}

function closeLineItemModal() {
  const modal = document.getElementById('lineItemModalOverlay');
  if (modal) modal.classList.remove('show');
  editingLineItemId = null;
}

async function saveLineItem() {
  const data = {
    item_type: getInputValue('lineItemType'),
    description: getInputValue('lineItemDescription'),
    quantity: parseFloat(getInputValue('lineItemQty')) || 1,
    unit_price: parseFloat(getInputValue('lineItemPrice')) || 0,
    is_taxable: document.getElementById('lineItemTaxable')?.checked ? 1 : 0,
    is_hidden: document.getElementById('lineItemHidden')?.checked ? 1 : 0
  };

  if (!data.description) {
    showToast('Description is required', true);
    return;
  }

  try {
    await apiRequest(`/charter-trips/${editingTripId}/line-items`, { method: 'POST', body: data });
    showToast('Line item added');
    closeLineItemModal();
  } catch (err) {
    showToast(`Error: ${err.message}`, true);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

function setCheckbox(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = !!checked;
}

// Initialize when charters screen is shown
function initChartersModule() {
  switchCharterTab('customers');
}
