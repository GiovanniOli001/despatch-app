const DUTY_TYPES = {
  driving: { label: 'D', name: 'Driving' },
  oov: { label: 'OOV', name: 'Out of Vehicle' },
  break: { label: 'BRK', name: 'Meal Break' },
  waiting: { label: 'WAIT', name: 'Waiting' },
  charter: { label: 'CHT', name: 'Charter' },
  dead: { label: 'DEAD', name: 'Dead Running' }
};

const VEHICLE_REQUIRED_TYPES = ['driving', 'charter', 'dead'];
const DRIVER_REQUIRED_TYPES = ['driving', 'charter', 'dead'];

// Pay types (will be configurable via HRM in future)
const PAY_TYPES = {
  standard: { label: 'Standard', code: 'STD' },
  overtime: { label: 'Overtime', code: 'OT' },
  doubleTime: { label: 'Double Time', code: 'DT' },
  penalty: { label: 'Penalty Rate', code: 'PEN' },
  allowance: { label: 'Allowance', code: 'ALW' },
  unpaid: { label: 'Unpaid', code: 'UNP' }
};

const ROUTES = ['Route 101', 'Route 102', 'Route 203', 'Route 305', 'Express A', 'Metro Loop'];

// Real Brisbane locations with coordinates for distance/time calculations
const LOCATIONS = [
  { id: 'cbd', name: 'Brisbane CBD', lat: -27.4698, lng: 153.0251, type: 'urban' },
  { id: 'airport', name: 'Brisbane Airport', lat: -27.3942, lng: 153.1218, type: 'transport' },
  { id: 'southbank', name: 'South Bank', lat: -27.4806, lng: 153.0231, type: 'beach' },
  { id: 'gabba', name: 'The Gabba', lat: -27.4858, lng: 153.0381, type: 'venue' },
  { id: 'convention', name: 'Convention Centre', lat: -27.4773, lng: 153.0197, type: 'venue' },
  { id: 'fortvalley', name: 'Fortitude Valley', lat: -27.4568, lng: 153.0325, type: 'urban' },
  { id: 'garden_city', name: 'Westfield Garden City', lat: -27.5568, lng: 153.0628, type: 'shopping' },
  { id: 'chermside', name: 'Westfield Chermside', lat: -27.3855, lng: 153.0303, type: 'shopping' },
  { id: 'capalaba', name: 'Capalaba', lat: -27.5253, lng: 153.1917, type: 'urban' },
  { id: 'logan', name: 'Logan Central', lat: -27.6389, lng: 153.1089, type: 'urban' },
  { id: 'mtgravatt', name: 'Mount Gravatt', lat: -27.5422, lng: 153.0789, type: 'hills' },
  { id: 'goldcoast', name: 'Gold Coast', lat: -28.0167, lng: 153.4000, type: 'coastal' },
  { id: 'sunshinecoast', name: 'Sunshine Coast', lat: -26.6500, lng: 153.0667, type: 'coastal' },
  { id: 'ipswich', name: 'Ipswich', lat: -27.6167, lng: 152.7667, type: 'urban' },
  { id: 'toowong', name: 'Toowong', lat: -27.4839, lng: 152.9833, type: 'hills' },
  { id: 'redcliffe', name: 'Redcliffe', lat: -27.2306, lng: 153.1014, type: 'beach' },
  { id: 'sandgate', name: 'Sandgate', lat: -27.3231, lng: 153.0681, type: 'beach' },
  { id: 'paddington', name: 'Paddington', lat: -27.4619, lng: 153.0056, type: 'urban' },
  { id: 'indooroopilly', name: 'Indooroopilly', lat: -27.4989, lng: 152.9753, type: 'shopping' },
  { id: 'uq', name: 'University of Queensland', lat: -27.4975, lng: 153.0137, type: 'education' },
  { id: 'qut', name: 'QUT Gardens Point', lat: -27.4769, lng: 153.0278, type: 'education' },
  { id: 'rbwh', name: 'Royal Brisbane Hospital', lat: -27.4489, lng: 153.0278, type: 'medical' },
  { id: 'pahospital', name: 'Princess Alexandra Hospital', lat: -27.5036, lng: 153.0336, type: 'medical' },
  { id: 'lonepine', name: 'Lone Pine Koala Sanctuary', lat: -27.5333, lng: 152.9694, type: 'attraction' },
  { id: 'mountcootha', name: 'Mt Coot-tha Lookout', lat: -27.4758, lng: 152.9583, type: 'tourist' }
];

// Get location by id or name
function getLocation(idOrName) {
  return LOCATIONS.find(l => l.id === idOrName || l.name === idOrName) || LOCATIONS[0];
}

// Route cache in localStorage to avoid repeated API calls
const ROUTE_CACHE_KEY = 'despatch_route_cache';
const ROUTE_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

function getRouteCache() {
  try {
    const cached = localStorage.getItem(ROUTE_CACHE_KEY);
    if (!cached) return {};
    const data = JSON.parse(cached);
    // Clean expired entries
    const now = Date.now();
    Object.keys(data).forEach(key => {
      if (data[key].timestamp + ROUTE_CACHE_EXPIRY < now) {
        delete data[key];
      }
    });
    return data;
  } catch (e) {
    return {};
  }
}

function setRouteCache(cache) {
  try {
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to save route cache:', e);
  }
}

function getRouteCacheKey(loc1, loc2) {
  // Sort by ID to ensure A→B and B→A use same cache (distance is same both ways usually)
  const ids = [loc1.id, loc2.id].sort();
  return `${ids[0]}_${ids[1]}`;
}

// Calculate distance using Haversine formula (fallback, returns km)
function calculateDistanceHaversine(loc1, loc2) {
  const R = 6371; // Earth's radius in km
  const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
  const dLng = (loc2.lng - loc1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Estimate travel time using Haversine (fallback)
function estimateTravelTimeHaversine(loc1, loc2) {
  const distance = calculateDistanceHaversine(loc1, loc2);
  const isUrban = loc1.type === 'urban' || loc2.type === 'urban' || 
                  loc1.type === 'shopping' || loc2.type === 'shopping';
  const avgSpeed = isUrban ? 35 : 55;
  return (distance / avgSpeed) + (10/60); // Add 10 min buffer
}

// Fetch route from OSRM (free, no API key needed)
async function fetchOSRMRoute(loc1, loc2) {
  const url = `https://router.project-osrm.org/route/v1/driving/${loc1.lng},${loc1.lat};${loc2.lng},${loc2.lat}?overview=false`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error('OSRM request failed');
  
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
    throw new Error('No route found');
  }
  
  const route = data.routes[0];
  return {
    distance: route.distance / 1000, // Convert meters to km
    duration: route.duration / 3600   // Convert seconds to hours
  };
}


// ============================================
// NAVIGATION
// ============================================
let currentScreen = 'dispatch';

function toggleNavSidebar() {
  const sidebar = document.getElementById('navSidebar');
  sidebar.classList.toggle('collapsed');
  document.body.classList.toggle('nav-collapsed', sidebar.classList.contains('collapsed'));
  
  // Save preference
  localStorage.setItem('navSidebarCollapsed', sidebar.classList.contains('collapsed'));
}

function navigateTo(screen) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = 'none';
  });
  
  // Show target screen
  const targetScreen = document.getElementById(`screen-${screen}`);
  if (targetScreen) {
    targetScreen.style.display = screen === 'dispatch' ? 'contents' : 'flex';
    targetScreen.style.flexDirection = 'column';
    targetScreen.style.flex = '1';
  }
  
  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.screen === screen) {
      item.classList.add('active');
    }
  });
  
  currentScreen = screen;
  
  // Update header title based on screen
  updateHeaderForScreen(screen);
  
  // Load screen data
  if (screen === 'calendar') {
    loadOpsCalendar();
  }
  if (screen === 'roster') {
    loadRosters();
  }
  if (screen === 'charters') {
    // Load customers by default (first tab)
    if (typeof loadCharterCustomers === 'function') {
      loadCharterCustomers();
    }
  }
}

function updateHeaderForScreen(screen) {
  const headerControls = document.querySelector('.header-left');
  const styleToggles = headerControls.querySelectorAll('.style-toggle');
  const dateNav = headerControls.querySelector('.date-nav');
  
  // Show/hide dispatch-specific controls
  if (screen === 'dispatch') {
    styleToggles.forEach(t => t.style.display = '');
    if (dateNav) dateNav.style.display = '';
  } else {
    styleToggles.forEach(t => t.style.display = 'none');
    if (dateNav) dateNav.style.display = 'none';
  }
}

function initNavigation() {
  // Restore sidebar state
  const isCollapsed = localStorage.getItem('navSidebarCollapsed') === 'true';
  if (isCollapsed) {
    document.getElementById('navSidebar').classList.add('collapsed');
    document.body.classList.add('nav-collapsed');
  }
}

function init() {
  // Ensure body class matches current style (preserve other classes)
  document.body.classList.add(currentStyle);
  
  // Initialize navigation
  initNavigation();
  
  // Load dispatch data from API
  loadDispatchData();
  
  // Set initial date display
  document.getElementById('currentDate').textContent = formatDate(currentDate);
  renderTimelineHeader('driverTimelineHeader');
  renderTimelineHeader('vehicleTimelineHeader');
  renderTimelineHeader('unassignedTimelineHeader');
  initResizeHandles();
  initPanelResize();
  
  // Sync all vehicle assignments from driver duties to vehicle schedules
  syncAllVehicleAssignments();
  
  renderAll();
  
  // Prefetch common routes in background (doesn't block UI)
  setTimeout(() => {
    prefetchCommonRoutes().catch(e => console.warn('Route prefetch failed:', e));
  }, 1000);
}

// ============================================
// DATE HELPERS
// ============================================

function formatDateShort(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatDateISO(date) {
  return date.toISOString().split('T')[0];
}


// ============================================
// SHARED UTILITIES
// ============================================

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function timeToPercent(hour) {
  return ((hour - 5) / 19) * 100;
}

function toMinutes(decimalHours) {
  return Math.round(decimalHours * 60);
}

// ============================================
// CONFIRM MODAL (replaces browser confirm())
// ============================================

let confirmModalCallback = null;

function showConfirmModal(title, message, onConfirm, options = {}) {
  const {
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmClass = 'btn-primary',
    isDangerous = false
  } = options;
  
  // Store callback
  confirmModalCallback = onConfirm;
  
  // Create modal if doesn't exist
  let modal = document.getElementById('confirmModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'confirmModalOverlay';
    modal.className = 'crud-modal-overlay';
    modal.innerHTML = `
      <div class="crud-modal confirm-modal">
        <div class="crud-modal-header">
          <span class="crud-modal-title" id="confirmModalTitle">Confirm</span>
          <button type="button" class="crud-modal-close" onclick="closeConfirmModal()">&times;</button>
        </div>
        <div class="crud-modal-body">
          <p id="confirmModalMessage"></p>
        </div>
        <div class="crud-modal-footer">
          <button type="button" class="btn-secondary" id="confirmModalCancel" onclick="closeConfirmModal()">Cancel</button>
          <button type="button" id="confirmModalConfirm" onclick="executeConfirmModal()">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  // Update content
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalMessage').innerHTML = message.replace(/\n/g, '<br>');
  document.getElementById('confirmModalCancel').textContent = cancelText;
  
  const confirmBtn = document.getElementById('confirmModalConfirm');
  confirmBtn.textContent = confirmText;
  confirmBtn.className = isDangerous ? 'btn-danger' : confirmClass;
  
  // Show modal
  modal.classList.add('show');
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmModalOverlay');
  if (modal) modal.classList.remove('show');
  confirmModalCallback = null;
}

function executeConfirmModal() {
  const callback = confirmModalCallback;
  closeConfirmModal();
  if (callback) callback();
}

// ============================================
// NAVIGATION HOOKS (extends navigateTo)
// ============================================

function setupNavigationHooks() {
  const originalNavigateTo = navigateTo;
  navigateTo = function(screen) {
    originalNavigateTo(screen);
    
    // Load data for the screen - use typeof checks since screen-specific JS may not be loaded
    if (screen === 'dispatch') {
      if (typeof loadDispatchData === 'function') {
        loadDispatchData();
      }
    } else if (screen === 'hrm') {
      if (typeof loadEmployees === 'function') {
        loadEmployees();
      }
    } else if (screen === 'vehicles') {
      if (typeof loadVehiclesData === 'function') {
        loadVehiclesData();
      }
    } else if (screen === 'shifts') {
      if (typeof loadShifts === 'function') {
        loadShifts();
      }
    } else if (screen === 'roster') {
      if (typeof loadRoster === 'function') {
        loadRoster();
      }
    }
  };
}

// Call init and setup hooks when DOM ready
document.addEventListener('DOMContentLoaded', function() {
  setupNavigationHooks();
  init();
});
