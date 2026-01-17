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
let currentCharterId = null;
let customerContactsData = [];
let editingContactId = null;
let tripLineItemsData = [];
let editingLineItemId = null;

// Location autocomplete state
let locationAutocompleteTimeout = null;

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
// CHARTER TAB NAVIGATION
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
  const detailView = document.getElementById('charterDetailView');

  if (customersTab) customersTab.style.display = 'none';
  if (bookingsTab) bookingsTab.style.display = 'none';
  if (detailView) detailView.style.display = 'none';

  // Show target tab/view
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
  } else if (tab === 'detail') {
    if (detailView) {
      detailView.style.display = 'block';
    }
    if (currentCharterId) {
      loadCharterDetail(currentCharterId);
    }
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
  // Simple client-side filter
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

  // Reset form
  const form = document.getElementById('customerForm');
  if (form) form.reset();

  // Reset to details tab
  switchCustomerModalTab('details');

  // Clear contacts
  customerContactsData = [];
  renderContactsList();

  // Show modal
  const modal = document.getElementById('charterCustomerModalOverlay');
  if (modal) modal.classList.add('show');
}

async function editCharterCustomer(id) {
  const customer = charterCustomersData.find(c => c.id === id);
  if (!customer) return;

  editingCustomerId = id;
  const title = document.getElementById('customerModalTitle');
  if (title) title.textContent = 'Edit Customer';

  // Fill form fields - map to actual HTML IDs
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

  // Reset to details tab
  switchCustomerModalTab('details');

  // Load contacts
  await loadCustomerContacts(id);

  // Show modal
  const modal = document.getElementById('charterCustomerModalOverlay');
  if (modal) modal.classList.add('show');
}

function switchCustomerModalTab(tabName, evt) {
  // Update tab buttons
  document.querySelectorAll('#charterCustomerModalOverlay .modal-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  if (evt && evt.target) {
    evt.target.classList.add('active');
  } else {
    // Find the correct tab button
    document.querySelectorAll('#charterCustomerModalOverlay .modal-tab').forEach(tab => {
      if ((tabName === 'details' && tab.textContent === 'Details') ||
          (tabName === 'contacts' && tab.textContent === 'Contacts')) {
        tab.classList.add('active');
      }
    });
  }

  // Update tab content
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
    await apiRequest(`/charter-customers/${editingCustomerId}/contacts`, {
      method: 'POST',
      body: data
    });
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
        await apiRequest(`/charter-customers/${editingCustomerId}/contacts/${id}`, {
          method: 'DELETE'
        });
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
// CHARTERS (BOOKINGS) CRUD
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
    // API uses booking_date
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
          <button class="action-btn" onclick="editCharter('${ch.id}')">Edit</button>
          <button class="action-btn danger" onclick="deleteCharter('${ch.id}', '${escapeHtml(ch.charter_number || '')}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterCharters(filters) {
  // This function handles the inline filter inputs
  // Filters can contain: search, status
  loadCharters(); // For now, just reload - could enhance with client-side filtering
}

async function showAddCharterModal() {
  editingCharterId = null;
  const title = document.getElementById('charterModalTitle');
  if (title) title.textContent = 'New Charter';

  const form = document.getElementById('charterForm');
  if (form) form.reset();

  // Load customers for dropdown
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

async function editCharter(id) {
  const charter = chartersData.find(c => c.id === id);
  if (!charter) {
    // Try to fetch it
    try {
      const result = await apiRequest(`/charters/${id}`);
      if (result.data) {
        await editCharterWithData(result.data);
      }
    } catch (err) {
      showToast(`Error loading charter: ${err.message}`, true);
    }
    return;
  }

  await editCharterWithData(charter);
}

async function editCharterWithData(charter) {
  editingCharterId = charter.id;
  const title = document.getElementById('charterModalTitle');
  if (title) title.textContent = 'Edit Charter';

  await populateCustomerDropdown();

  setInputValue('charterCustomerId', charter.customer_id);
  setInputValue('charterName', charter.name || charter.description);
  // API uses booking_date, but also check event_date for backwards compat
  setInputValue('charterEventDate', charter.booking_date || charter.event_date || charter.start_date);
  setInputValue('charterDescription', charter.description);

  const modal = document.getElementById('charterModalOverlay');
  if (modal) modal.classList.add('show');
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
    event_date: getInputValue('charterEventDate') || null,
    status: 'enquiry'
  };

  if (!data.customer_id) {
    showToast('Please select a customer', true);
    return;
  }

  try {
    if (editingCharterId) {
      await apiRequest(`/charters/${editingCharterId}`, {
        method: 'PUT',
        body: data
      });
      showToast('Charter updated');
    } else {
      const result = await apiRequest('/charters', {
        method: 'POST',
        body: data
      });
      showToast('Charter created');

      // Open the detail view for the new charter
      if (result.data && result.data.id) {
        currentCharterId = result.data.id;
        closeCharterModal();
        switchCharterTab('detail');
        return;
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
// CHARTER DETAIL VIEW
// ============================================
async function openCharterDetail(id) {
  currentCharterId = id;
  switchCharterTab('detail');
}

async function loadCharterDetail(id) {
  const detailView = document.getElementById('charterDetailView');
  if (!detailView) return;

  detailView.innerHTML = '<div style="padding: 40px; text-align: center;">Loading charter details...</div>';

  try {
    const result = await apiRequest(`/charters/${id}`);
    const charter = result.data;

    if (!charter) {
      detailView.innerHTML = '<div style="padding: 40px; text-align: center;">Charter not found</div>';
      return;
    }

    // Load trips for this charter
    const tripsResult = await apiRequest(`/charter-trips?charter_id=${id}`);
    charterTripsData = tripsResult.data || [];

    renderCharterDetailView(charter);
  } catch (err) {
    detailView.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--accent-red);">Error: ${err.message}</div>`;
  }
}

function renderCharterDetailView(charter) {
  const detailView = document.getElementById('charterDetailView');
  if (!detailView) return;

  const statusBadge = CHARTER_STATUS_COLORS[charter.status] || 'badge-info';

  detailView.innerHTML = `
    <div class="charter-detail">
      <div class="charter-detail-header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
        <div>
          <h2 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 12px;">
            <span style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(charter.charter_number || 'NEW')}</span>
            <span class="badge ${statusBadge}">${escapeHtml(charter.status || 'enquiry')}</span>
          </h2>
          <p style="margin: 0; color: var(--text-secondary);">
            <strong>${escapeHtml(charter.customer_name || '')}</strong>
            ${charter.name ? ` - ${escapeHtml(charter.name)}` : ''}
          </p>
          ${charter.booking_date || charter.event_date ? `<p style="margin: 4px 0 0 0; color: var(--text-muted);">Event Date: ${charter.booking_date || charter.event_date}</p>` : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-secondary" onclick="editCharter('${charter.id}')">Edit Charter</button>
          <button class="btn-primary" onclick="showAddTripModal('${charter.id}')">+ Add Trip</button>
          <button class="btn-secondary" onclick="switchCharterTab('bookings')">Back to List</button>
        </div>
      </div>

      <div class="charter-trips-section" style="margin-top: 24px;">
        <h3 style="margin: 0 0 16px 0;">Trips</h3>
        <div class="screen-table-container">
          <table class="screen-table">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Date</th>
                <th>Pickup</th>
                <th>Dropoff</th>
                <th>Passengers</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="charterDetailTripsBody">
              ${renderDetailTripsRows()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderDetailTripsRows() {
  if (charterTripsData.length === 0) {
    return '<tr><td colspan="7" class="loading-cell">No trips yet. Click "+ Add Trip" to create one.</td></tr>';
  }

  return charterTripsData.map(trip => {
    // API uses operational_status, fallback to status
    const tripStatus = trip.operational_status || trip.status || 'draft';
    const statusBadge = TRIP_STATUS_COLORS[tripStatus] || 'badge-info';

    return `
      <tr>
        <td>${escapeHtml(trip.name || trip.trip_name || `Trip ${trip.trip_number || ''}`)}</td>
        <td>${trip.trip_date || '—'}</td>
        <td>
          <div>${escapeHtml(trip.pickup_name || trip.pickup_location || '—')}</div>
          ${trip.pickup_time ? `<small style="color: var(--text-muted);">${trip.pickup_time}</small>` : ''}
        </td>
        <td>${escapeHtml(trip.dropoff_name || trip.dropoff_location || '—')}</td>
        <td>${trip.passenger_count || '—'}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(tripStatus)}</span></td>
        <td>
          <button class="action-btn" onclick="editTrip('${trip.id}')">Edit</button>
          <button class="action-btn danger" onclick="deleteTrip('${trip.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================
// TRIPS CRUD
// ============================================
function showAddTripModal(charterId) {
  editingTripId = null;
  const title = document.getElementById('tripModalTitle');
  if (title) title.textContent = 'Add Trip';

  const form = document.getElementById('tripForm');
  if (form) form.reset();

  // Store charter ID for saving
  currentCharterId = charterId || currentCharterId;

  // Setup location autocomplete
  setupLocationAutocomplete();

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

  await editTripWithData(trip);
}

async function editTripWithData(trip) {
  editingTripId = trip.id;
  currentCharterId = trip.charter_id;

  const title = document.getElementById('tripModalTitle');
  if (title) title.textContent = 'Edit Trip';

  setInputValue('tripName', trip.name || trip.trip_name);
  setInputValue('tripDate', trip.trip_date);
  setInputValue('tripPickupTime', trip.pickup_time);
  setInputValue('tripPickupName', trip.pickup_name || trip.pickup_location);
  setInputValue('tripPickupAddress', trip.pickup_address);
  setInputValue('tripDropoffName', trip.dropoff_name || trip.dropoff_location);
  setInputValue('tripDropoffAddress', trip.dropoff_address);
  setInputValue('tripPassengerCount', trip.passenger_count);
  setInputValue('tripVehicleCapacity', trip.vehicle_capacity);
  setInputValue('tripPassengerNotes', trip.passenger_notes);
  setInputValue('tripInstructions', trip.instructions || trip.notes);

  // Set coordinates
  if (trip.pickup_lat && trip.pickup_lng) {
    setInputValue('tripPickupCoords', `${trip.pickup_lat}, ${trip.pickup_lng}`);
  }
  if (trip.dropoff_lat && trip.dropoff_lng) {
    setInputValue('tripDropoffCoords', `${trip.dropoff_lat}, ${trip.dropoff_lng}`);
  }

  // Set checkboxes for vehicle requirements
  if (trip.vehicle_requirements) {
    try {
      const reqs = typeof trip.vehicle_requirements === 'string' ?
        JSON.parse(trip.vehicle_requirements) : trip.vehicle_requirements;
      setCheckbox('tripReqWheelchair', reqs.wheelchair);
      setCheckbox('tripReqAc', reqs.ac);
      setCheckbox('tripReqToilet', reqs.toilet);
      setCheckbox('tripReqLuggage', reqs.luggage);
      setCheckbox('tripReqWifi', reqs.wifi);
      setCheckbox('tripReqSeatbelts', reqs.seatbelts);
    } catch (e) {
      console.error('Error parsing vehicle requirements:', e);
    }
  }

  setupLocationAutocomplete();

  const modal = document.getElementById('charterTripModalOverlay');
  if (modal) modal.classList.add('show');
}

function closeTripModal() {
  const modal = document.getElementById('charterTripModalOverlay');
  if (modal) modal.classList.remove('show');
  editingTripId = null;
}

async function saveTrip() {
  // Parse coordinates
  const pickupCoords = parseCoords(getInputValue('tripPickupCoords'));
  const dropoffCoords = parseCoords(getInputValue('tripDropoffCoords'));

  // Build vehicle requirements
  const vehicleRequirements = {
    wheelchair: document.getElementById('tripReqWheelchair')?.checked || false,
    ac: document.getElementById('tripReqAc')?.checked || false,
    toilet: document.getElementById('tripReqToilet')?.checked || false,
    luggage: document.getElementById('tripReqLuggage')?.checked || false,
    wifi: document.getElementById('tripReqWifi')?.checked || false,
    seatbelts: document.getElementById('tripReqSeatbelts')?.checked || false
  };

  const data = {
    charter_id: currentCharterId,
    name: getInputValue('tripName') || null,
    trip_name: getInputValue('tripName') || null,
    trip_date: getInputValue('tripDate') || null,
    pickup_time: getInputValue('tripPickupTime') || null,
    pickup_name: getInputValue('tripPickupName') || null,
    pickup_location: getInputValue('tripPickupName') || null,
    pickup_address: getInputValue('tripPickupAddress') || null,
    pickup_lat: pickupCoords.lat,
    pickup_lng: pickupCoords.lng,
    dropoff_name: getInputValue('tripDropoffName') || null,
    dropoff_location: getInputValue('tripDropoffName') || null,
    dropoff_address: getInputValue('tripDropoffAddress') || null,
    dropoff_lat: dropoffCoords.lat,
    dropoff_lng: dropoffCoords.lng,
    passenger_count: parseInt(getInputValue('tripPassengerCount')) || 1,
    vehicle_capacity: parseInt(getInputValue('tripVehicleCapacity')) || null,
    vehicle_requirements: JSON.stringify(vehicleRequirements),
    passenger_notes: getInputValue('tripPassengerNotes') || null,
    special_instructions: getInputValue('tripInstructions') || null,
    notes: getInputValue('tripInstructions') || null,
    operational_status: editingTripId ? undefined : 'draft', // Only set on create
    status: 'draft'
  };

  if (!data.trip_date) {
    showToast('Trip date is required', true);
    return;
  }
  if (!data.pickup_time) {
    showToast('Pickup time is required', true);
    return;
  }
  if (!data.pickup_name) {
    showToast('Pickup location is required', true);
    return;
  }
  if (!data.dropoff_name) {
    showToast('Dropoff location is required', true);
    return;
  }

  try {
    if (editingTripId) {
      await apiRequest(`/charter-trips/${editingTripId}`, {
        method: 'PUT',
        body: data
      });
      showToast('Trip updated');
    } else {
      await apiRequest('/charter-trips', {
        method: 'POST',
        body: data
      });
      showToast('Trip created');
    }

    closeTripModal();

    // Reload the charter detail view
    if (currentCharterId) {
      await loadCharterDetail(currentCharterId);
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
        await apiRequest(`/charter-trips/${id}`, { method: 'DELETE' });
        showToast('Trip deleted');
        if (currentCharterId) {
          await loadCharterDetail(currentCharterId);
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
function setupLocationAutocomplete() {
  const pickupInput = document.getElementById('tripPickupName');
  const dropoffInput = document.getElementById('tripDropoffName');

  if (pickupInput) {
    // Remove any existing listeners
    pickupInput.removeEventListener('input', handlePickupInput);
    pickupInput.addEventListener('input', handlePickupInput);
  }

  if (dropoffInput) {
    // Remove any existing listeners
    dropoffInput.removeEventListener('input', handleDropoffInput);
    dropoffInput.addEventListener('input', handleDropoffInput);
  }
}

function handlePickupInput(e) {
  searchLocation(e.target.value, 'pickup');
}

function handleDropoffInput(e) {
  searchLocation(e.target.value, 'dropoff');
}

function searchLocation(query, type) {
  clearTimeout(locationAutocompleteTimeout);

  const suggestionsId = type === 'pickup' ? 'tripPickupSuggestions' : 'tripDropoffSuggestions';
  const suggestions = document.getElementById(suggestionsId);

  if (!query || query.length < 3) {
    if (suggestions) suggestions.style.display = 'none';
    return;
  }

  locationAutocompleteTimeout = setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=au`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'DispatchApp/1.0' }
      });

      if (!response.ok) throw new Error('Search failed');

      const results = await response.json();
      showLocationSuggestions(results, type);
    } catch (err) {
      console.error('Location search error:', err);
      if (suggestions) suggestions.style.display = 'none';
    }
  }, 300);
}

function showLocationSuggestions(results, type) {
  const suggestionsId = type === 'pickup' ? 'tripPickupSuggestions' : 'tripDropoffSuggestions';
  const suggestions = document.getElementById(suggestionsId);

  if (!suggestions) return;

  if (results.length === 0) {
    suggestions.innerHTML = '<div class="location-suggestion-item" style="color: var(--text-muted);">No results found</div>';
    suggestions.style.display = 'block';
    return;
  }

  suggestions.innerHTML = results.map(r => `
    <div class="location-suggestion-item" style="padding: 8px; cursor: pointer; border-bottom: 1px solid var(--border);"
         onclick="selectLocationResult('${type}', '${escapeHtml(r.display_name)}', ${r.lat}, ${r.lon})"
         onmouseover="this.style.background='var(--bg-secondary)'"
         onmouseout="this.style.background='transparent'">
      ${escapeHtml(r.display_name)}
    </div>
  `).join('');

  suggestions.style.display = 'block';
}

function selectLocationResult(type, name, lat, lng) {
  if (type === 'pickup') {
    setInputValue('tripPickupName', name);
    setInputValue('tripPickupCoords', `${lat}, ${lng}`);
    const suggestions = document.getElementById('tripPickupSuggestions');
    if (suggestions) suggestions.style.display = 'none';
  } else {
    setInputValue('tripDropoffName', name);
    setInputValue('tripDropoffCoords', `${lat}, ${lng}`);
    const suggestions = document.getElementById('tripDropoffSuggestions');
    if (suggestions) suggestions.style.display = 'none';
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
    await apiRequest(`/charter-trips/${editingTripId}/line-items`, {
      method: 'POST',
      body: data
    });
    showToast('Line item added');
    closeLineItemModal();
    // Could reload line items here if we had a display for them
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

function parseCoords(coordString) {
  if (!coordString) return { lat: null, lng: null };
  const parts = coordString.split(',').map(s => s.trim());
  if (parts.length !== 2) return { lat: null, lng: null };
  return {
    lat: parseFloat(parts[0]) || null,
    lng: parseFloat(parts[1]) || null
  };
}

// Initialize when charters screen is shown
function initChartersModule() {
  // This will be called when navigating to the charters screen
  switchCharterTab('customers');
}
