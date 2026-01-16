// ============================================
// NOMINATIM LOCATION AUTOCOMPLETE
// ============================================

let locationSearchTimeout = null;
let currentLocationInput = null;

// Search for locations using Nominatim (OpenStreetMap free geocoding)
async function searchLocations(query, inputId) {
  if (!query || query.length < 3) {
    hideLocationSuggestions(inputId);
    return;
  }
  
  currentLocationInput = inputId;
  showLocationLoading(inputId);
  
  try {
    // Bias search towards Australia
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=au`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DispatchApp/1.0'  // Required by Nominatim
      }
    });
    
    if (!response.ok) throw new Error('Nominatim request failed');
    
    const results = await response.json();
    
    if (currentLocationInput === inputId) {
      showLocationSuggestions(inputId, results);
    }
  } catch (error) {
    console.warn('Location search failed:', error);
    hideLocationSuggestions(inputId);
  }
}

// Debounced location search
function onLocationInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const query = input.value;
  
  // Clear any existing location coords when typing new text
  const latInput = document.getElementById(inputId + 'Lat');
  const lngInput = document.getElementById(inputId + 'Lng');
  if (latInput) latInput.value = '';
  if (lngInput) lngInput.value = '';
  
  // Debounce the search
  if (locationSearchTimeout) {
    clearTimeout(locationSearchTimeout);
  }
  
  locationSearchTimeout = setTimeout(() => {
    searchLocations(query, inputId);
  }, 300);
}

function showLocationLoading(inputId) {
  const wrapper = document.getElementById(inputId)?.parentElement;
  if (!wrapper) return;
  
  let dropdown = wrapper.querySelector('.location-autocomplete');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'location-autocomplete';
    wrapper.appendChild(dropdown);
  }
  
  dropdown.innerHTML = '<div class="location-loading">🔍 Searching...</div>';
  dropdown.style.display = 'block';
}

function showLocationSuggestions(inputId, results) {
  const wrapper = document.getElementById(inputId)?.parentElement;
  if (!wrapper) return;
  
  let dropdown = wrapper.querySelector('.location-autocomplete');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.className = 'location-autocomplete';
    wrapper.appendChild(dropdown);
  }
  
  if (results.length === 0) {
    dropdown.innerHTML = '<div class="location-loading">No locations found</div>';
    return;
  }
  
  dropdown.innerHTML = results.map((r, idx) => {
    const name = r.name || r.display_name.split(',')[0];
    const address = r.display_name;
    return `
      <div class="location-suggestion" onclick="selectLocation('${inputId}', ${idx}, '${name.replace(/'/g, "\\'")}', ${r.lat}, ${r.lon})">
        <div class="location-suggestion-name">${name}</div>
        <div class="location-suggestion-address">${address}</div>
      </div>
    `;
  }).join('');
  
  dropdown.style.display = 'block';
}

function hideLocationSuggestions(inputId) {
  const wrapper = document.getElementById(inputId)?.parentElement;
  if (!wrapper) return;
  
  const dropdown = wrapper.querySelector('.location-autocomplete');
  if (dropdown) {
    dropdown.style.display = 'none';
  }
}

function selectLocation(inputId, idx, name, lat, lng) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = name;
  }
  
  // Store lat/lng in hidden fields
  const latInput = document.getElementById(inputId + 'Lat');
  const lngInput = document.getElementById(inputId + 'Lng');
  if (latInput) latInput.value = lat;
  if (lngInput) lngInput.value = lng;
  
  hideLocationSuggestions(inputId);
  
  // Trigger form change if applicable
  if (typeof onFormChange === 'function') {
    onFormChange();
  }
}

// Close suggestions when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.location-input-wrapper')) {
    document.querySelectorAll('.location-autocomplete').forEach(d => d.style.display = 'none');
  }
});

// Get route with caching and fallback
async function getRoute(loc1, loc2) {
  // Same location check
  if (loc1.id === loc2.id) {
    return { distance: 0, duration: 0, source: 'same' };
  }
  
  const cacheKey = getRouteCacheKey(loc1, loc2);
  const cache = getRouteCache();
  
  // Check cache first
  if (cache[cacheKey]) {
    return { ...cache[cacheKey].data, source: 'cache' };
  }
  
  // Try OSRM
  try {
    const result = await fetchOSRMRoute(loc1, loc2);
    // Save to cache
    cache[cacheKey] = { data: result, timestamp: Date.now() };
    setRouteCache(cache);
    return { ...result, source: 'osrm' };
  } catch (error) {
    console.warn('OSRM failed, using Haversine fallback:', error.message);
    // Fallback to Haversine
    return {
      distance: calculateDistanceHaversine(loc1, loc2),
      duration: estimateTravelTimeHaversine(loc1, loc2),
      source: 'haversine'
    };
  }
}

// Synchronous versions using cache or fallback (for non-async contexts)
function calculateDistance(loc1, loc2) {
  if (loc1.id === loc2.id) return 0;
  const cacheKey = getRouteCacheKey(loc1, loc2);
  const cache = getRouteCache();
  if (cache[cacheKey]) {
    return cache[cacheKey].data.distance;
  }
  return calculateDistanceHaversine(loc1, loc2);
}

function estimateTravelTime(loc1, loc2) {
  if (loc1.id === loc2.id) return 0;
  const cacheKey = getRouteCacheKey(loc1, loc2);
  const cache = getRouteCache();
  if (cache[cacheKey]) {
    return cache[cacheKey].data.duration;
  }
  return estimateTravelTimeHaversine(loc1, loc2);
}

// Pre-fetch common routes to populate cache
async function prefetchCommonRoutes() {
  const cache = getRouteCache();
  const routesToFetch = [];
  
  // Depot to major locations
  const depotLoc = { id: DEPOT.id, lat: DEPOT.lat, lng: DEPOT.lng, type: 'depot' };
  for (const loc of LOCATIONS.slice(0, 10)) { // Top 10 locations
    const cacheKey = getRouteCacheKey(depotLoc, loc);
    if (!cache[cacheKey]) {
      routesToFetch.push({ from: depotLoc, to: loc, key: cacheKey });
    }
  }
  
  // Fetch in batches to avoid overwhelming OSRM
  console.log(`Prefetching ${routesToFetch.length} routes...`);
  for (let i = 0; i < routesToFetch.length; i++) {
    const route = routesToFetch[i];
    try {
      await getRoute(route.from, route.to);
      // Small delay between requests to be nice to the free API
      if (i < routesToFetch.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) {
      console.warn(`Failed to prefetch route ${route.key}:`, e);
    }
  }
  console.log('Route prefetch complete');
}

// Format travel time for display
function formatTravelTime(hours) {
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Format distance for display
function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

// Find best next jobs for a driver/vehicle finishing at a location (async version)
async function findBestNextJobsAsync(currentLocation, finishTime, availableJobs, limit = 5) {
  const suggestions = [];
  
  for (const job of availableJobs) {
    // Try to get location from:
    // 1. First duty's actual location coords (from API)
    // 2. job.pickupLocation (if set)
    // 3. Parse from description (legacy)
    // 4. Default to first LOCATION
    let pickupLoc = null;
    
    const firstDuty = job.duties?.[0];
    if (firstDuty?.locationLat && firstDuty?.locationLng) {
      // Use real coordinates from duty
      pickupLoc = {
        id: 'duty-loc',
        name: firstDuty.locationName || 'Duty Location',
        lat: firstDuty.locationLat,
        lng: firstDuty.locationLng
      };
    } else if (job.pickupLocation) {
      pickupLoc = job.pickupLocation;
    } else {
      // Try to parse from description (legacy fake data)
      pickupLoc = getLocation(firstDuty?.description?.split('→')[0]?.trim()) || LOCATIONS[0];
    }
    
    // Use async route fetching
    const route = await getRoute(currentLocation, pickupLoc);
    const arrivalTime = finishTime + route.duration;
    const jobStartTime = job.start;
    
    const canMakeIt = arrivalTime <= jobStartTime - 0.25;
    const waitTime = Math.max(0, jobStartTime - arrivalTime);
    
    // Jobs without coordinates get a penalty in scoring
    const hasCoords = !!(firstDuty?.locationLat && firstDuty?.locationLng);
    const score = canMakeIt 
      ? (route.distance * 0.5) + (waitTime * 10) + (hasCoords ? 0 : 100)
      : 9999;
    
    suggestions.push({
      job,
      pickupLocation: pickupLoc,
      distance: route.distance,
      travelTime: route.duration,
      arrivalTime,
      waitTime,
      canMakeIt,
      score,
      routeSource: route.source,
      hasRealLocation: hasCoords
    });
  }
  
  return suggestions
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

// Synchronous version using cached data (for immediate display)
function findBestNextJobs(currentLocation, finishTime, availableJobs, limit = 5) {
  const suggestions = [];
  
  for (const job of availableJobs) {
    // Try to get location from:
    // 1. First duty's actual location coords (from API)
    // 2. job.pickupLocation (if set)
    // 3. Parse from description (legacy)
    // 4. Default to first LOCATION
    let pickupLoc = null;
    
    const firstDuty = job.duties?.[0];
    if (firstDuty?.locationLat && firstDuty?.locationLng) {
      // Use real coordinates from duty
      pickupLoc = {
        id: 'duty-loc',
        name: firstDuty.locationName || 'Duty Location',
        lat: firstDuty.locationLat,
        lng: firstDuty.locationLng
      };
    } else if (job.pickupLocation) {
      pickupLoc = job.pickupLocation;
    } else {
      // Try to parse from description (legacy fake data)
      pickupLoc = getLocation(firstDuty?.description?.split('→')[0]?.trim()) || LOCATIONS[0];
    }
    
    const distance = calculateDistance(currentLocation, pickupLoc);
    const travelTime = estimateTravelTime(currentLocation, pickupLoc);
    const arrivalTime = finishTime + travelTime;
    const jobStartTime = job.start;
    
    const canMakeIt = arrivalTime <= jobStartTime - 0.25;
    const waitTime = Math.max(0, jobStartTime - arrivalTime);
    
    // Jobs without coordinates get a penalty in scoring
    const hasCoords = !!(firstDuty?.locationLat && firstDuty?.locationLng);
    const score = canMakeIt 
      ? (distance * 0.5) + (waitTime * 10) + (hasCoords ? 0 : 100)
      : 9999;
    
    suggestions.push({
      job,
      pickupLocation: pickupLoc,
      distance,
      travelTime,
      arrivalTime,
      waitTime,
      canMakeIt,
      score,
      hasRealLocation: hasCoords
    });
  }
  
  return suggestions
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

const FIRST_NAMES = ['James', 'John', 'Michael', 'David', 'Robert', 'William', 'Sarah', 'Emma', 'Lisa', 'Maria'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson'];

// Adelaide-area depots
// Single depot for now (multi-depot support planned for future)
const DEPOT = { id: 'mile_end', name: 'Mile End', lat: -34.9219, lng: 138.5697 };

let drivers = [];
let vehicles = [];
let unassignedJobs = [];
let selectedItem = null;
let currentDate = new Date();  // Start with today for real data
let expandedSection = null;
let editingDuty = null;
let formErrors = {};
let currentStyle = 'style-b';
let allocationMode = 'driver'; // 'driver' or 'vehicle'
let viewMode = 'horizontal'; // 'horizontal' or 'vertical'
let dataSource = 'fake'; // 'fake' or 'real'
let dispatchMeta = null; // Metadata from real API
let showCancelledDuties = false; // Toggle to show cancelled duties on Gantt

// Filter state
let driverFilters = { search: '', status: 'all', sort: 'status' };
let vehicleFilters = { search: '', status: 'all', sort: 'status' };
let assignmentSearch = '';

function changeStyle() {
  // Remove old style class
  document.body.classList.remove('style-a', 'style-b', 'style-c', 'style-d', 'style-e');
  currentStyle = document.getElementById('styleSelect').value;
  document.body.classList.add(currentStyle);
  renderAll();
}

function changeAllocationMode() {
  allocationMode = document.getElementById('allocationMode').value;
  selectedItem = null;
  editingDuty = null;
  formErrors = {};
  updateSectionOrder();
  renderAll();
}

function changeViewMode() {
  viewMode = document.getElementById('viewMode').value;
  
  const sections = ['driversSection', 'vehiclesSection', 'unassignedSection'];
  sections.forEach(id => {
    const section = document.getElementById(id);
    if (viewMode === 'vertical') {
      section.classList.add('vertical-view');
    } else {
      section.classList.remove('vertical-view');
    }
  });
  
  renderAll();
}

// ============================================
// DATA SOURCE MANAGEMENT
// ============================================

async function changeDataSource() {
  dataSource = document.getElementById('dataSourceSelect').value;
  selectedItem = null;
  editingDuty = null;
  formErrors = {};
  
  if (dataSource === 'real') {
    // Reset to today when switching to real data
    currentDate = new Date();
    await loadDispatchData();
  } else {
    // Generate fake data
    currentDate = new Date(2025, 6, 14); // Reset to fake date
    loadFakeData();
    syncAllVehicleAssignments();
    renderAll();
  }
  
  document.getElementById('currentDate').textContent = formatDate(currentDate);
}

async function loadDispatchData() {
  if (dataSource === 'fake') {
    loadFakeData();
    syncAllVehicleAssignments();
    renderAll();
    return;
  }
  
  // Show loading state
  const driverRows = document.getElementById('driverRows');
  const vehicleRows = document.getElementById('vehicleRows');
  const unassignedRows = document.getElementById('unassignedRows');
  
  if (driverRows) driverRows.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">Loading dispatch data...</div>';
  if (vehicleRows) vehicleRows.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">Loading...</div>';
  if (unassignedRows) unassignedRows.innerHTML = '<div style="padding: 20px; color: var(--text-secondary);">Loading...</div>';
  
  try {
    const dateStr = formatDateISO(currentDate);
    const result = await apiRequest(`/dispatch/${dateStr}`);
    
    if (result.data) {
      const data = result.data;
      
      // Map API response to frontend format
      // Ensure each driver has a shifts array, and each shift has duties
      drivers = (data.drivers || []).map(d => ({
        ...d,
        shifts: (d.shifts || []).map(s => ({
          ...s,
          duties: s.duties || []
        }))
      }));
      
      // Ensure each vehicle has a shifts array, and each shift has duties
      vehicles = (data.vehicles || []).map(v => ({
        ...v,
        shifts: (v.shifts || []).map(s => ({
          ...s,
          duties: s.duties || []
        }))
      }));
      
      // Ensure each unassigned job has a duties array
      unassignedJobs = (data.unassigned || []).map(j => ({
        ...j,
        duties: j.duties || []
      }));
      
      dispatchMeta = data._meta || null;
      
      // Update stats
      if (data.stats) {
        updateDispatchStats(data.stats);
      }
      
      // Show TODOs/warnings if any
      if (dispatchMeta && dispatchMeta.todos && dispatchMeta.todos.length > 0) {
        console.warn('Dispatch TODOs:', dispatchMeta.todos);
      }
      
      // Sync vehicle assignments (with defensive checks already in place)
      syncAllVehicleAssignments();
      
      // Set commit status from response
      if (data.commitStatus) {
        currentCommitStatus = data.commitStatus;
        updateCommitUI();
      }
      
      renderAll();
      
      // Show success toast with source info
      const rosterInfo = dispatchMeta?.publishedRosters?.length 
        ? `from ${dispatchMeta.publishedRosters.length} published roster(s)` 
        : 'no published rosters';
      showToast(`Loaded real data - ${rosterInfo}`, 'success');
    }
  } catch (err) {
    console.error('Failed to load dispatch data:', err);
    showToast(`Failed to load: ${err.message}`, 'error');
    
    // Show error in UI
    if (driverRows) driverRows.innerHTML = `<div style="padding: 20px; color: var(--accent-red);">Error: ${err.message}</div>`;
  }
}

function updateDispatchStats(stats) {
  const statElements = {
    'statDriversAvail': stats.drivers_available,
    'statDriversWork': stats.drivers_working,
    'statDriversLeave': stats.drivers_leave,
    'statVehiclesAvail': stats.vehicles_available,
    'statVehiclesMaint': stats.vehicles_maintenance,
    'statUnassigned': stats.unassigned_count,
    'driverAvail': stats.drivers_available,
    'driverLeave': stats.drivers_leave,
    'vehicleAvail': stats.vehicles_available,
    'vehicleMaint': stats.vehicles_maintenance,
    'driverCount': stats.drivers_working + stats.drivers_available + stats.drivers_leave,
    'vehicleCount': stats.vehicles_in_use + stats.vehicles_available + stats.vehicles_maintenance,
    'unassignedCount': stats.unassigned_count
  };
  
  for (const [id, value] of Object.entries(statElements)) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
}

function loadFakeData() {
  vehicleBookings.clear();
  vehicles = generateVehicles(80);
  drivers = generateDrivers(104);
  unassignedJobs = generateUnassignedJobs(12);
  
  // Add test charters
  const testCharters = [
    { pickup: 'glenelg', dropoff: 'oval', start: 10, customer: 'Beach Wedding' },
    { pickup: 'airport', dropoff: 'convention', start: 11, customer: 'Conference Group' },
    { pickup: 'barossa', dropoff: 'cbd', start: 12, customer: 'Wine Tour' },
    { pickup: 'hahndorf', dropoff: 'marion', start: 13, customer: 'German Club' },
    { pickup: 'victor', dropoff: 'fmc', start: 14, customer: 'Medical Transfer' },
    { pickup: 'zoo', dropoff: 'flinders', start: 15, customer: 'School Excursion' },
    { pickup: 'henley', dropoff: 'modbury', start: 16, customer: 'Sports Team' },
    { pickup: 'norwood', dropoff: 'airport', start: 17, customer: 'Airport Shuttle' },
  ];
  
  testCharters.forEach((tc, i) => {
    const pickupLoc = LOCATIONS.find(l => l.id === tc.pickup);
    const dropoffLoc = LOCATIONS.find(l => l.id === tc.dropoff);
    const duration = 2 + Math.floor(Math.random() * 2);
    const end = tc.start + duration;
    
    unassignedJobs.push({
      id: `CHT-T${String(i + 1).padStart(2, '0')}`,
      name: `Charter #${200 + i}`,
      type: 'charter',
      start: tc.start,
      end: end,
      depot: DEPOT,
      customer: tc.customer,
      pickupLocation: pickupLoc,
      dropoffLocation: dropoffLoc,
      duties: generateJobDuties(tc.start, end, true, pickupLoc, dropoffLoc)
    });
  });
  
  drivers.sort((a, b) => ({ leave: 0, working: 1, available: 2 }[a.status] - { leave: 0, working: 1, available: 2 }[b.status]));
  dispatchMeta = null;
}

// Vertical view rendering
const VERTICAL_START_HOUR = 5;  // 05:00
const VERTICAL_END_HOUR = 24;   // 24:00 (midnight)
const VERTICAL_SLOT_HEIGHT = 30; // pixels per 30-min slot
const VERTICAL_SLOTS = (VERTICAL_END_HOUR - VERTICAL_START_HOUR) * 2; // 38 slots

function timeToVerticalPosition(hour) {
  const slotsFromStart = (hour - VERTICAL_START_HOUR) * 2;
  return slotsFromStart * VERTICAL_SLOT_HEIGHT;
}

function renderVerticalTimeColumn() {
  let html = '';
  for (let h = VERTICAL_START_HOUR; h < VERTICAL_END_HOUR; h++) {
    html += `<div class="vertical-time-slot hour-mark">${String(h).padStart(2, '0')}:00</div>`;
    html += `<div class="vertical-time-slot">${String(h).padStart(2, '0')}:30</div>`;
  }
  return html;
}

function renderVerticalGridLines() {
  let html = '';
  for (let i = 0; i < VERTICAL_SLOTS; i++) {
    const isHour = i % 2 === 0;
    html += `<div class="vertical-grid-line ${isHour ? 'hour-mark' : ''}" style="top: ${i * VERTICAL_SLOT_HEIGHT}px;"></div>`;
  }
  return html;
}

function renderDriverVertical() {
  const container = document.getElementById('driverVertical');
  if (!container || viewMode !== 'vertical') return;
  
  const filteredDrivers = getFilteredDrivers();
  
  // Build headers
  let headersHtml = '';
  filteredDrivers.forEach((driver, idx) => {
    const isSelected = selectedItem?.type === 'driver' && selectedItem?.index === drivers.indexOf(driver);
    const globalIdx = drivers.indexOf(driver);
    headersHtml += `
      <div class="vertical-column-header ${isSelected ? 'selected' : ''}" onclick="selectItem('driver', ${globalIdx})">
        <div class="vertical-column-name">${driver.name}</div>
        <div class="vertical-column-subtitle">${driver.id} • ${driver.status}</div>
      </div>
    `;
  });
  
  // Build body columns
  let columnsHtml = '';
  filteredDrivers.forEach((driver, idx) => {
    const isSelected = selectedItem?.type === 'driver' && selectedItem?.index === drivers.indexOf(driver);
    const globalIdx = drivers.indexOf(driver);
    
    let blocksHtml = '';
    if (driver.status === 'leave') {
      blocksHtml = `
        <div class="vertical-block leave" style="top: 0; height: ${VERTICAL_SLOTS * VERTICAL_SLOT_HEIGHT}px;">
          <div class="vertical-block-title">ON LEAVE</div>
        </div>
      `;
    } else {
      (driver.shifts || []).forEach((shift) => {
        const top = timeToVerticalPosition(shift.start);
        const height = (shift.end - shift.start) * 2 * VERTICAL_SLOT_HEIGHT;
        const isCharter = shift.type === 'charter';
        
        let vehicleInfo = '';
        if (shift.duties && shift.duties.length > 0) {
          const vehicleIds = [...new Set(shift.duties.filter(d => d.vehicle).map(d => d.vehicle))];
          const vehicleRegos = vehicleIds.map(vid => {
            const v = vehicles.find(veh => veh.id === vid);
            return v ? v.rego : vid;
          });
          vehicleInfo = vehicleRegos.join(', ');
        }
        
        blocksHtml += `
          <div class="vertical-block ${isCharter ? 'charter' : ''}" 
               style="top: ${top}px; height: ${Math.max(height, 30)}px;"
               onclick="event.stopPropagation(); selectItem('driver', ${globalIdx})"
               title="${shift.name}: ${formatTime(shift.start)} - ${formatTime(shift.end)}">
            <div class="vertical-block-title">${shift.name}</div>
            <div class="vertical-block-time">${formatTime(shift.start)} - ${formatTime(shift.end)}</div>
            ${vehicleInfo ? `<div class="vertical-block-details">${vehicleInfo}</div>` : ''}
          </div>
        `;
      });
    }
    
    columnsHtml += `
      <div class="vertical-column ${isSelected ? 'selected' : ''}" onclick="selectItem('driver', ${globalIdx})">
        <div class="vertical-column-body">
          ${renderVerticalGridLines()}
          ${blocksHtml}
        </div>
      </div>
    `;
  });
  
  const html = `
    <div class="vertical-wrapper">
      <div class="vertical-header-row">
        <div class="vertical-time-header">Time</div>
        <div class="vertical-headers-scroll" id="driverHeadersScroll">${headersHtml}</div>
      </div>
      <div class="vertical-body-row">
        <div class="vertical-time-column" id="driverTimeColumn">
          <div class="vertical-time-body">${renderVerticalTimeColumn()}</div>
        </div>
        <div class="vertical-columns-scroll" id="driverColumnsScroll">${columnsHtml}</div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Sync scrolling
  const columnsScroll = document.getElementById('driverColumnsScroll');
  const headersScroll = document.getElementById('driverHeadersScroll');
  const timeColumn = document.getElementById('driverTimeColumn');
  
  if (columnsScroll) {
    columnsScroll.addEventListener('scroll', () => {
      if (headersScroll) headersScroll.scrollLeft = columnsScroll.scrollLeft;
      if (timeColumn) timeColumn.scrollTop = columnsScroll.scrollTop;
    });
  }
}

function renderVehicleVertical() {
  const container = document.getElementById('vehicleVertical');
  if (!container || viewMode !== 'vertical') return;
  
  const filteredVehicles = getFilteredVehicles();
  
  // Build headers
  let headersHtml = '';
  filteredVehicles.forEach((vehicle, idx) => {
    const isSelected = selectedItem?.type === 'vehicle' && selectedItem?.index === vehicles.indexOf(vehicle);
    const globalIdx = vehicles.indexOf(vehicle);
    headersHtml += `
      <div class="vertical-column-header ${isSelected ? 'selected' : ''}" onclick="selectItem('vehicle', ${globalIdx})">
        <div class="vertical-column-name">${vehicle.rego}</div>
        <div class="vertical-column-subtitle">${vehicle.capacity} seats • ${vehicle.status}</div>
      </div>
    `;
  });
  
  // Build body columns
  let columnsHtml = '';
  filteredVehicles.forEach((vehicle, idx) => {
    const isSelected = selectedItem?.type === 'vehicle' && selectedItem?.index === vehicles.indexOf(vehicle);
    const globalIdx = vehicles.indexOf(vehicle);
    
    let blocksHtml = '';
    if (vehicle.status === 'maintenance') {
      const maintShift = (vehicle.shifts || []).find(s => s.type === 'maintenance');
      if (maintShift) {
        const top = timeToVerticalPosition(maintShift.start);
        const height = (maintShift.end - maintShift.start) * 2 * VERTICAL_SLOT_HEIGHT;
        blocksHtml = `
          <div class="vertical-block maintenance" style="top: ${top}px; height: ${Math.max(height, 30)}px;">
            <div class="vertical-block-title">MAINTENANCE</div>
            <div class="vertical-block-time">${formatTime(maintShift.start)} - ${formatTime(maintShift.end)}</div>
          </div>
        `;
      }
    } else {
      (vehicle.shifts || []).filter(s => s.type !== 'maintenance').forEach((shift) => {
        const top = timeToVerticalPosition(shift.start);
        const height = (shift.end - shift.start) * 2 * VERTICAL_SLOT_HEIGHT;
        const isCharter = shift.type === 'charter';
        
        let driverInfo = '';
        if (shift.duties && shift.duties.length > 0) {
          const driverNames = [...new Set(shift.duties.filter(d => d.driver).map(d => d.driver))];
          driverInfo = driverNames.join(', ');
        }
        
        blocksHtml += `
          <div class="vertical-block ${isCharter ? 'charter' : ''}" 
               style="top: ${top}px; height: ${Math.max(height, 30)}px;"
               onclick="event.stopPropagation(); selectItem('vehicle', ${globalIdx})"
               title="${shift.name}: ${formatTime(shift.start)} - ${formatTime(shift.end)}">
            <div class="vertical-block-title">${shift.name}</div>
            <div class="vertical-block-time">${formatTime(shift.start)} - ${formatTime(shift.end)}</div>
            ${driverInfo ? `<div class="vertical-block-details">${driverInfo}</div>` : ''}
          </div>
        `;
      });
    }
    
    columnsHtml += `
      <div class="vertical-column ${isSelected ? 'selected' : ''}" onclick="selectItem('vehicle', ${globalIdx})">
        <div class="vertical-column-body">
          ${renderVerticalGridLines()}
          ${blocksHtml}
        </div>
      </div>
    `;
  });
  
  const html = `
    <div class="vertical-wrapper">
      <div class="vertical-header-row">
        <div class="vertical-time-header">Time</div>
        <div class="vertical-headers-scroll" id="vehicleHeadersScroll">${headersHtml}</div>
      </div>
      <div class="vertical-body-row">
        <div class="vertical-time-column" id="vehicleTimeColumn">
          <div class="vertical-time-body">${renderVerticalTimeColumn()}</div>
        </div>
        <div class="vertical-columns-scroll" id="vehicleColumnsScroll">${columnsHtml}</div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Sync scrolling
  const columnsScroll = document.getElementById('vehicleColumnsScroll');
  const headersScroll = document.getElementById('vehicleHeadersScroll');
  const timeColumn = document.getElementById('vehicleTimeColumn');
  
  if (columnsScroll) {
    columnsScroll.addEventListener('scroll', () => {
      if (headersScroll) headersScroll.scrollLeft = columnsScroll.scrollLeft;
      if (timeColumn) timeColumn.scrollTop = columnsScroll.scrollTop;
    });
  }
}

function renderUnassignedVertical() {
  const container = document.getElementById('unassignedVertical');
  if (!container || viewMode !== 'vertical') return;
  
  const filteredJobs = getFilteredJobs();
  
  // Build headers
  let headersHtml = '';
  filteredJobs.forEach((job, idx) => {
    const isSelected = selectedItem?.type === 'job' && selectedItem?.index === unassignedJobs.indexOf(job);
    const globalIdx = unassignedJobs.indexOf(job);
    headersHtml += `
      <div class="vertical-column-header ${isSelected ? 'selected' : ''}" onclick="selectItem('job', ${globalIdx})">
        <div class="vertical-column-name">${job.name}</div>
        <div class="vertical-column-subtitle">${job.id}</div>
      </div>
    `;
  });
  
  // Build body columns
  let columnsHtml = '';
  filteredJobs.forEach((job, idx) => {
    const isSelected = selectedItem?.type === 'job' && selectedItem?.index === unassignedJobs.indexOf(job);
    const globalIdx = unassignedJobs.indexOf(job);
    
    const top = timeToVerticalPosition(job.start);
    const height = (job.end - job.start) * 2 * VERTICAL_SLOT_HEIGHT;
    const isCharter = job.type === 'charter';
    
    const blockHtml = `
      <div class="vertical-block unassigned ${isCharter ? 'charter' : ''}" 
           style="top: ${top}px; height: ${Math.max(height, 30)}px;"
           onclick="event.stopPropagation(); selectItem('job', ${globalIdx})"
           title="${job.name}: ${formatTime(job.start)} - ${formatTime(job.end)}">
        <div class="vertical-block-title">${job.name}</div>
        <div class="vertical-block-time">${formatTime(job.start)} - ${formatTime(job.end)}</div>
        ${job.customer ? `<div class="vertical-block-details">${job.customer}</div>` : ''}
      </div>
    `;
    
    columnsHtml += `
      <div class="vertical-column ${isSelected ? 'selected' : ''}" onclick="selectItem('job', ${globalIdx})">
        <div class="vertical-column-body">
          ${renderVerticalGridLines()}
          ${blockHtml}
        </div>
      </div>
    `;
  });
  
  const html = `
    <div class="vertical-wrapper">
      <div class="vertical-header-row">
        <div class="vertical-time-header">Time</div>
        <div class="vertical-headers-scroll" id="unassignedHeadersScroll">${headersHtml}</div>
      </div>
      <div class="vertical-body-row">
        <div class="vertical-time-column" id="unassignedTimeColumn">
          <div class="vertical-time-body">${renderVerticalTimeColumn()}</div>
        </div>
        <div class="vertical-columns-scroll" id="unassignedColumnsScroll">${columnsHtml}</div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Sync scrolling
  const columnsScroll = document.getElementById('unassignedColumnsScroll');
  const headersScroll = document.getElementById('unassignedHeadersScroll');
  const timeColumn = document.getElementById('unassignedTimeColumn');
  
  if (columnsScroll) {
    columnsScroll.addEventListener('scroll', () => {
      if (headersScroll) headersScroll.scrollLeft = columnsScroll.scrollLeft;
      if (timeColumn) timeColumn.scrollTop = columnsScroll.scrollTop;
    });
  }
}

function updateSectionOrder() {
  const container = document.querySelector('.heatmap-left');
  const driversSection = document.getElementById('driversSection');
  const vehiclesSection = document.getElementById('vehiclesSection');
  const unassignedSection = document.getElementById('unassignedSection');
  const resizeHandle1 = document.getElementById('resizeDriverVehicle');
  const resizeHandle2 = document.getElementById('resizeVehicleUnassigned');
  
  // Reset any collapsed/expanded states
  [driversSection, vehiclesSection, unassignedSection].forEach(s => {
    s.classList.remove('expanded');
    s.style.flex = '';
    s.style.height = '';
  });
  expandedSection = null;
  
  if (allocationMode === 'vehicle') {
    // Vehicle first, then drivers, then unassigned
    // Clear and rebuild
    container.innerHTML = '';
    container.appendChild(vehiclesSection);
    container.appendChild(resizeHandle1);
    container.appendChild(driversSection);
    container.appendChild(resizeHandle2);
    container.appendChild(unassignedSection);
    
    // Update resize handle data attributes
    resizeHandle1.dataset.above = 'vehiclesSection';
    resizeHandle1.dataset.below = 'driversSection';
    resizeHandle2.dataset.above = 'driversSection';
    resizeHandle2.dataset.below = 'unassignedSection';
    
    // Adjust flex values
    vehiclesSection.style.flex = '1.2';
    driversSection.style.flex = '1';
    unassignedSection.style.flex = '0.6';
  } else {
    // Driver first (default)
    container.innerHTML = '';
    container.appendChild(driversSection);
    container.appendChild(resizeHandle1);
    container.appendChild(vehiclesSection);
    container.appendChild(resizeHandle2);
    container.appendChild(unassignedSection);
    
    // Update resize handle data attributes
    resizeHandle1.dataset.above = 'driversSection';
    resizeHandle1.dataset.below = 'vehiclesSection';
    resizeHandle2.dataset.above = 'vehiclesSection';
    resizeHandle2.dataset.below = 'unassignedSection';
    
    // Reset flex values
    driversSection.style.flex = '1.2';
    vehiclesSection.style.flex = '1';
    unassignedSection.style.flex = '0.6';
  }
}

// Track vehicle bookings during data generation to prevent conflicts
const vehicleBookings = new Map(); // vehicleId -> [{start, end}]

function isVehicleAvailable(vehicleId, start, end) {
  if (!vehicleId) return true;
  const bookings = vehicleBookings.get(vehicleId) || [];
  for (const booking of bookings) {
    // Check for overlap
    if (start < booking.end && end > booking.start) {
      return false;
    }
  }
  return true;
}

function bookVehicle(vehicleId, start, end) {
  if (!vehicleId) return;
  if (!vehicleBookings.has(vehicleId)) {
    vehicleBookings.set(vehicleId, []);
  }
  vehicleBookings.get(vehicleId).push({ start, end });
}

function findAvailableVehicle(start, end) {
  const availableVehicles = vehicles.filter(v => v.status !== 'maintenance');
  // Shuffle to distribute assignments
  const shuffled = availableVehicles.sort(() => Math.random() - 0.5);
  
  for (const vehicle of shuffled) {
    if (isVehicleAvailable(vehicle.id, start, end)) {
      return vehicle.id;
    }
  }
  return null; // No vehicle available
}

function generateDuties(shiftStart, shiftEnd, isCharter = false, pickupLoc = null, destLoc = null) {
  const duties = [];
  let currentTime = shiftStart;
  
  // Find a vehicle that's actually available for this entire shift
  const vehicleId = findAvailableVehicle(shiftStart, shiftEnd);
  
  // Book the vehicle for this shift if found
  if (vehicleId) {
    bookVehicle(vehicleId, shiftStart, shiftEnd);
  }
  
  if (isCharter) {
    // Use provided locations or pick random ones
    if (!pickupLoc) pickupLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    if (!destLoc) {
      do {
        destLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
      } while (destLoc.id === pickupLoc.id && LOCATIONS.length > 1);
    }
    
    const travelTime = estimateTravelTime(pickupLoc, destLoc);
    
    duties.push({ id: `d-${Date.now()}-1`, type: 'dead', start: currentTime, end: currentTime + 0.5, description: `Dead run to ${pickupLoc.name}`, vehicle: vehicleId, locationId: pickupLoc.id });
    currentTime += 0.5;
    duties.push({ id: `d-${Date.now()}-2`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: `Charter pickup at ${pickupLoc.name}`, vehicle: null, locationId: pickupLoc.id });
    currentTime += 0.25;
    duties.push({ id: `d-${Date.now()}-3`, type: 'charter', start: currentTime, end: currentTime + travelTime, description: `${pickupLoc.name} → ${destLoc.name}`, vehicle: vehicleId, fromLocationId: pickupLoc.id, toLocationId: destLoc.id });
    currentTime += travelTime;
    
    const remainingTime = shiftEnd - currentTime - travelTime - 0.5;
    if (remainingTime > 0.5) {
      duties.push({ id: `d-${Date.now()}-4`, type: 'waiting', start: currentTime, end: currentTime + remainingTime, description: `Waiting at ${destLoc.name}`, vehicle: null, locationId: destLoc.id });
      currentTime += remainingTime;
    }
    
    duties.push({ id: `d-${Date.now()}-5`, type: 'charter', start: currentTime, end: currentTime + travelTime, description: `${destLoc.name} → ${pickupLoc.name}`, vehicle: vehicleId, fromLocationId: destLoc.id, toLocationId: pickupLoc.id });
    currentTime += travelTime;
    duties.push({ id: `d-${Date.now()}-6`, type: 'dead', start: currentTime, end: shiftEnd, description: `Dead run to depot`, vehicle: vehicleId, locationId: null });
  } else {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    const totalDuration = shiftEnd - shiftStart;
    
    duties.push({ id: `d-${Date.now()}-1`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Sign on, pre-trip', vehicle: null });
    currentTime += 0.25;
    
    const firstDriveEnd = currentTime + Math.min(2 + Math.random(), (shiftEnd - currentTime) / 2);
    duties.push({ id: `d-${Date.now()}-2`, type: 'driving', start: currentTime, end: firstDriveEnd, description: `${route} - Outbound`, vehicle: vehicleId });
    currentTime = firstDriveEnd;
    
    duties.push({ id: `d-${Date.now()}-3`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Turnaround', vehicle: null });
    currentTime += 0.25;
    
    const secondDriveEnd = currentTime + Math.min(2, shiftEnd - currentTime - 1.5);
    if (secondDriveEnd > currentTime + 0.5) {
      duties.push({ id: `d-${Date.now()}-4`, type: 'driving', start: currentTime, end: secondDriveEnd, description: `${route} - Inbound`, vehicle: vehicleId });
      currentTime = secondDriveEnd;
    }
    
    if (totalDuration > 4 && currentTime < shiftEnd - 1.5) {
      duties.push({ id: `d-${Date.now()}-5`, type: 'break', start: currentTime, end: currentTime + 0.5, description: 'Meal break', vehicle: null });
      currentTime += 0.5;
      
      if (currentTime < shiftEnd - 0.5) {
        duties.push({ id: `d-${Date.now()}-6`, type: 'driving', start: currentTime, end: shiftEnd - 0.25, description: `${route} - Final`, vehicle: vehicleId });
        currentTime = shiftEnd - 0.25;
      }
    }
    
    if (currentTime < shiftEnd) {
      duties.push({ id: `d-${Date.now()}-7`, type: 'oov', start: currentTime, end: shiftEnd, description: 'Sign off', vehicle: null });
    }
  }
  
  return { duties, pickupLocation: pickupLoc, dropoffLocation: destLoc };
}

function generateDrivers(count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    
    const rand = Math.random();
    let status, shifts = [];
    
    if (rand < 0.12) {
      status = 'leave';
    } else if (rand < 0.28) {
      status = 'available';
    } else {
      status = 'working';
      const numShifts = Math.random() < 0.85 ? 1 : 2;
      let lastEnd = 5;
      
      for (let s = 0; s < numShifts; s++) {
        const start = lastEnd + Math.floor(Math.random() * 2);
        const duration = 3 + Math.floor(Math.random() * 5);
        const end = Math.min(start + duration, 22);
        
        if (start < 21 && end - start >= 2) {
          const isCharter = Math.random() < 0.2;
          const dutyResult = generateDuties(start, end, isCharter);
          shifts.push({
            id: `shift-${i}-${s}`,
            name: isCharter ? `Charter #${Math.floor(Math.random() * 100)}` : `SHIFT ${Math.floor(Math.random() * 400) + 100}`,
            type: isCharter ? 'charter' : 'shift',
            start, end,
            duties: dutyResult.duties,
            pickupLocation: dutyResult.pickupLocation,
            dropoffLocation: dutyResult.dropoffLocation
          });
        }
        lastEnd = end + 1;
      }
      if (shifts.length === 0) status = 'available';
    }
    
    result.push({
      id: `D${String(i + 1).padStart(3, '0')}`,
      name: `${lastName}, ${firstName.charAt(0)}`,
      fullName: `${firstName} ${lastName}`,
      phone: `04${Math.floor(Math.random() * 90000000 + 10000000)}`,
      licence: `DL${Math.floor(Math.random() * 900000 + 100000)}`,
      depot: DEPOT, status, shifts
    });
  }
  return result;
}

function generateVehicles(count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const prefix = ['BUS', 'MB', 'VH'][Math.floor(Math.random() * 3)];
    const number = String(Math.floor(Math.random() * 900) + 100);
    
    const rand = Math.random();
    let status, shifts = [];
    
    if (rand < 0.12) {
      // Only maintenance vehicles get pre-generated shifts
      status = 'maintenance';
      shifts.push({
        id: `vshift-maint-${i}`,
        name: 'MAINTENANCE',
        type: 'maintenance',
        start: 5,
        end: 23,
        duties: [{
          id: `vd-maint-${i}`,
          type: 'maintenance',
          start: 5,
          end: 23,
          description: 'Scheduled maintenance',
          driver: null
        }]
      });
    } else {
      // All other vehicles start empty - their schedules come from driver duty assignments
      status = 'available';
    }
    
    result.push({
      id: `${prefix}-${number}`,
      rego: `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(Math.random() * 900) + 100}`,
      capacity: [45, 50, 55, 60, 70][Math.floor(Math.random() * 5)],
      depot: DEPOT, status, shifts
    });
  }
  return result;
}

// Generate duties for vehicle-centric view (driver assignment instead of vehicle)
// Same structure as driver duties - sign on, driving, turnaround, break, sign off
function generateVehicleDuties(shiftStart, shiftEnd, isCharter, assignedDriver, driverId) {
  const duties = [];
  let currentTime = shiftStart;
  
  if (isCharter) {
    const pickupLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const destLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'dead', start: currentTime, end: currentTime + 0.5, description: `Dead run to ${pickupLoc}`, driver: assignedDriver, driverId: driverId });
    currentTime += 0.5;
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: `Charter pickup`, driver: null, driverId: null });
    currentTime += 0.25;
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: currentTime + 1, description: `${pickupLoc} → ${destLoc}`, driver: assignedDriver, driverId: driverId });
    currentTime += 1;
    
    if (shiftEnd - currentTime > 2) {
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'waiting', start: currentTime, end: shiftEnd - 1.25, description: `Waiting at ${destLoc}`, driver: null, driverId: null });
      currentTime = shiftEnd - 1.25;
    }
    
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: currentTime + 0.75, description: `Return to ${pickupLoc}`, driver: assignedDriver, driverId: driverId });
    currentTime += 0.75;
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'dead', start: currentTime, end: shiftEnd, description: `Dead run to depot`, driver: assignedDriver, driverId: driverId });
  } else {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    const totalDuration = shiftEnd - shiftStart;
    
    // Sign on, pre-trip
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Sign on, pre-trip', driver: null, driverId: null });
    currentTime += 0.25;
    
    // First drive
    const firstDriveEnd = currentTime + Math.min(2 + Math.random(), (shiftEnd - currentTime) / 2);
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: firstDriveEnd, description: `${route} - Outbound`, driver: assignedDriver, driverId: driverId });
    currentTime = firstDriveEnd;
    
    // Turnaround
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Turnaround', driver: null, driverId: null });
    currentTime += 0.25;
    
    // Second drive
    const secondDriveEnd = currentTime + Math.min(2, shiftEnd - currentTime - 1.5);
    if (secondDriveEnd > currentTime + 0.5) {
      // Randomly unassign some drivers for this leg
      const hasDriver = assignedDriver && Math.random() > 0.15;
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: secondDriveEnd, description: `${route} - Inbound`, driver: hasDriver ? assignedDriver : null, driverId: hasDriver ? driverId : null });
      currentTime = secondDriveEnd;
    }
    
    // Meal break if shift is long enough
    if (totalDuration > 4 && currentTime < shiftEnd - 1.5) {
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'break', start: currentTime, end: currentTime + 0.5, description: 'Meal break', driver: null, driverId: null });
      currentTime += 0.5;
      
      // Final drive after break
      if (currentTime < shiftEnd - 0.5) {
        duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: shiftEnd - 0.25, description: `${route} - Final`, driver: assignedDriver, driverId: driverId });
        currentTime = shiftEnd - 0.25;
      }
    }
    
    // Sign off
    if (currentTime < shiftEnd) {
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: shiftEnd, description: 'Sign off', driver: null, driverId: null });
    }
  }
  
  return duties;
}

function generateUnassignedJobs(count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const start = 6 + Math.floor(Math.random() * 12);
    const duration = 2 + Math.floor(Math.random() * 4);
    const end = Math.min(start + duration, 23);
    const isCharter = Math.random() < 0.5;
    
    // For charters, pick random pickup and dropoff locations
    const pickupLocation = isCharter ? LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)] : null;
    let dropoffLocation = null;
    if (isCharter) {
      // Ensure dropoff is different from pickup
      do {
        dropoffLocation = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
      } while (dropoffLocation.id === pickupLocation.id && LOCATIONS.length > 1);
    }
    
    const duties = generateJobDuties(start, end, isCharter, pickupLocation, dropoffLocation);
    
    result.push({
      id: isCharter ? `CHT-${String(i + 1).padStart(3, '0')}` : `JOB-${String(i + 1).padStart(3, '0')}`,
      name: isCharter ? `Charter #${Math.floor(Math.random() * 100) + 1}` : `SHIFT ${Math.floor(Math.random() * 400) + 100}`,
      type: isCharter ? 'charter' : 'shift',
      start, end,
      depot: DEPOT,
      customer: isCharter ? ['ABC Tours', 'School Group', 'Sports Club', 'Corporate', 'Wedding'][Math.floor(Math.random() * 5)] : null,
      pickupLocation,
      dropoffLocation,
      duties
    });
  }
  return result;
}

// Generate duties for an unassigned job (no driver or vehicle assigned yet)
function generateJobDuties(shiftStart, shiftEnd, isCharter = false, pickupLoc = null, destLoc = null) {
  const duties = [];
  let currentTime = shiftStart;
  
  if (isCharter) {
    // Use provided locations or pick random ones
    if (!pickupLoc) pickupLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    if (!destLoc) destLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    
    // Calculate realistic travel times
    const deadRunTime = 0.5; // Fixed for now, could calculate from depot
    const travelTime = estimateTravelTime(pickupLoc, destLoc);
    const returnTime = travelTime; // Same for return
    
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'dead', start: currentTime, end: currentTime + deadRunTime, description: `Dead run to ${pickupLoc.name}`, locationId: pickupLoc.id });
    currentTime += deadRunTime;
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: `Charter pickup at ${pickupLoc.name}`, locationId: pickupLoc.id });
    currentTime += 0.25;
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'charter', start: currentTime, end: currentTime + travelTime, description: `${pickupLoc.name} → ${destLoc.name}`, fromLocationId: pickupLoc.id, toLocationId: destLoc.id });
    currentTime += travelTime;
    
    // Waiting time at destination if there's time
    const remainingTime = shiftEnd - currentTime - returnTime - 0.5;
    if (remainingTime > 0.5) {
      duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'waiting', start: currentTime, end: currentTime + remainingTime, description: `Waiting at ${destLoc.name}`, locationId: destLoc.id });
      currentTime += remainingTime;
    }
    
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'charter', start: currentTime, end: currentTime + returnTime, description: `${destLoc.name} → ${pickupLoc.name}`, fromLocationId: destLoc.id, toLocationId: pickupLoc.id });
    currentTime += returnTime;
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'dead', start: currentTime, end: shiftEnd, description: `Dead run to depot`, locationId: null });
  } else {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    const totalDuration = shiftEnd - shiftStart;
    
    // Sign on, pre-trip
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Sign on, pre-trip' });
    currentTime += 0.25;
    
    // First drive
    const firstDriveEnd = currentTime + Math.min(2 + Math.random(), (shiftEnd - currentTime) / 2);
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: firstDriveEnd, description: `${route} - Outbound` });
    currentTime = firstDriveEnd;
    
    // Turnaround
    duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Turnaround' });
    currentTime += 0.25;
    
    // Second drive
    const secondDriveEnd = currentTime + Math.min(2, shiftEnd - currentTime - 1.5);
    if (secondDriveEnd > currentTime + 0.5) {
      duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: secondDriveEnd, description: `${route} - Inbound` });
      currentTime = secondDriveEnd;
    }
    
    // Meal break if shift is long enough
    if (totalDuration > 4 && currentTime < shiftEnd - 1.5) {
      duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'break', start: currentTime, end: currentTime + 0.5, description: 'Meal break' });
      currentTime += 0.5;
      
      // Final drive after break
      if (currentTime < shiftEnd - 0.5) {
        duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: shiftEnd - 0.25, description: `${route} - Final` });
        currentTime = shiftEnd - 0.25;
      }
    }
    
    // Sign off
    if (currentTime < shiftEnd) {
      duties.push({ id: `jd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: shiftEnd, description: 'Sign off' });
    }
  }
  
  return duties;
}

// Sync all existing vehicle assignments from driver duties to vehicle schedules
function syncAllVehicleAssignments() {
  // First, clear all non-maintenance shifts from vehicles
  // This removes both 'synced' type and any other work shifts from API
  vehicles.forEach(vehicle => {
    if (vehicle.shifts) {
      vehicle.shifts = vehicle.shifts.filter(s => s.type === 'maintenance');
    }
  });
  
  // Then rebuild synced shifts from driver duties (skip cancelled)
  drivers.forEach(driver => {
    if (!driver.shifts) return;
    driver.shifts.forEach(shift => {
      if (!shift.duties) return;
      shift.duties.forEach(duty => {
        if (duty.cancelled) return; // Skip cancelled duties
        if (duty.vehicle) {
          syncVehicleSchedule(duty.vehicle, duty, driver, shift);
        }
      });
    });
  });
}

// Check if a vehicle is available for a given time slot (runtime check)
function isVehicleAvailableForDuty(vehicleId, start, end, excludeDutyId = null) {
  if (!vehicleId) return true;
  
  // Check all driver duties for conflicts
  for (const driver of drivers) {
    for (const shift of driver.shifts) {
      for (const duty of shift.duties) {
        if (excludeDutyId && duty.id === excludeDutyId) continue;
        if (duty.cancelled) continue; // Skip cancelled duties
        if (duty.vehicle === vehicleId) {
          // Check for overlap
          if (start < duty.end && end > duty.start) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

// Initial data load will happen in init() - calling loadFakeData()

function formatDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

async function changeDate(delta) {
  currentDate.setDate(currentDate.getDate() + delta);
  document.getElementById('currentDate').textContent = formatDate(currentDate);
  selectedItem = null;  // Clear selection when changing date
  
  // Reload data when changing date
  if (dataSource === 'real') {
    await loadDispatchData();
  } else {
    // For fake data, just re-render (data doesn't change by date in fake mode)
    renderAll();
  }
}

// Generate tooltip HTML for duty blocks
function renderDutyTooltip(duty, shiftName = '') {
  const dt = DUTY_TYPES[duty.type] || DUTY_TYPES.driving;
  const hours = (duty.end - duty.start).toFixed(2);
  const desc = duty.description || shiftName || dt.label;
  const locationText = duty.locationName || duty.location || '';
  const vehicleText = duty.vehicle || '';
  
  return `
    <div class="timeline-duty-tooltip">
      <div class="tooltip-title">${desc}</div>
      <div class="tooltip-row"><span class="tooltip-label">Time</span><span class="tooltip-value">${formatTime(duty.start)} - ${formatTime(duty.end)}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Type</span><span class="tooltip-value">${dt.label}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Hours</span><span class="tooltip-value">${hours}h</span></div>
      ${vehicleText ? `<div class="tooltip-row"><span class="tooltip-label">Vehicle</span><span class="tooltip-value">${vehicleText}</span></div>` : ''}
      ${locationText ? `<div class="tooltip-row"><span class="tooltip-label">Location</span><span class="tooltip-value">${locationText}</span></div>` : ''}
    </div>
  `;
}

// Get short label for duty block (abbreviated when narrow)
function getDutyShortLabel(duty, width) {
  const dt = DUTY_TYPES[duty.type] || DUTY_TYPES.driving;
  // If very narrow (< 3%), show nothing or just type code
  if (width < 3) return '';
  // If narrow (< 6%), show just type
  if (width < 6) return dt.code || dt.label.charAt(0);
  // Otherwise show description truncated
  const desc = duty.description || dt.label;
  return desc.length > 12 ? desc.substring(0, 10) + '…' : desc;
}

// Generate tooltip HTML for shift bars (styles B/C/D/E)
function renderShiftTooltip(shift) {
  const totalHours = (shift.end - shift.start).toFixed(2);
  const duties = shift.duties || [];
  
  let dutiesHTML = '';
  if (duties.length > 0) {
    dutiesHTML = `<div class="tooltip-duties">`;
    duties.slice(0, 5).forEach(duty => {
      const dt = DUTY_TYPES[duty.type] || DUTY_TYPES.driving;
      const desc = duty.description || dt.label;
      dutiesHTML += `
        <div class="tooltip-duty">
          <div class="tooltip-duty-type ${duty.type}"></div>
          <span>${formatTime(duty.start)}-${formatTime(duty.end)}</span>
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${desc}</span>
        </div>
      `;
    });
    if (duties.length > 5) {
      dutiesHTML += `<div style="color: var(--text-muted); font-style: italic;">+${duties.length - 5} more...</div>`;
    }
    dutiesHTML += `</div>`;
  }
  
  return `
    <div class="shift-tooltip">
      <div class="tooltip-title">${shift.name}</div>
      <div class="tooltip-row"><span class="tooltip-label">Time</span><span class="tooltip-value">${formatTime(shift.start)} - ${formatTime(shift.end)}</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Hours</span><span class="tooltip-value">${totalHours}h</span></div>
      <div class="tooltip-row"><span class="tooltip-label">Duties</span><span class="tooltip-value">${duties.length}</span></div>
      ${dutiesHTML}
    </div>
  `;
}

function formatTime(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTime(timeStr) {
  if (!timeStr) return 0;
  
  // Remove any spaces and convert to string
  const str = String(timeStr).trim().replace(/\s/g, '');
  
  // If it contains a colon, parse as HH:MM or H:MM
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    return h + (m || 0) / 60;
  }
  
  // Handle pure numeric input (e.g., "0730", "730", "1430")
  const num = str.replace(/\D/g, ''); // Remove any non-digits
  
  if (num.length === 0) return 0;
  
  if (num.length <= 2) {
    // Just hours: "7" → 7:00, "14" → 14:00
    return parseInt(num, 10);
  } else if (num.length === 3) {
    // H:MM format: "730" → 7:30
    const h = parseInt(num.charAt(0), 10);
    const m = parseInt(num.slice(1), 10);
    return h + m / 60;
  } else {
    // HHMM format: "0730" → 07:30, "1430" → 14:30
    const h = parseInt(num.slice(0, 2), 10);
    const m = parseInt(num.slice(2, 4), 10);
    return h + m / 60;
  }
}

// Format time input as user types (auto-insert colon)
function formatTimeInput(input) {
  let val = input.value.replace(/[^\d:]/g, ''); // Keep only digits and colon
  
  // If they've typed 3-4 digits without a colon, auto-format
  if (!val.includes(':') && val.length >= 3) {
    if (val.length === 3) {
      val = val.charAt(0) + ':' + val.slice(1);
    } else if (val.length >= 4) {
      val = val.slice(0, 2) + ':' + val.slice(2, 4);
    }
  }
  
  input.value = val;
}

function isVehicleAvailableForPeriod(vehicle, start, end) {
  if (vehicle.status === 'maintenance') return false;
  const startMins = toMinutes(start);
  const endMins = toMinutes(end);
  for (const shift of vehicle.shifts || []) {
    if (shift.type === 'maintenance') continue;
    const shiftStartMins = toMinutes(shift.start);
    const shiftEndMins = toMinutes(shift.end);
    if (shiftStartMins < endMins && shiftEndMins > startMins) {
      return false;
    }
  }
  return true;
}

function getAvailableVehiclesForPeriod(start, end) {
  return vehicles.filter(v => isVehicleAvailableForPeriod(v, start, end));
}

function getShiftVehicleStatus(shift) {
  // Only consider active (non-cancelled) duties
  const activeDuties = shift.duties.filter(d => !d.cancelled);
  const drivingDuties = activeDuties.filter(d => VEHICLE_REQUIRED_TYPES.includes(d.type));
  if (drivingDuties.length === 0) return { status: 'complete', label: 'N/A', assigned: 0, total: 0 };
  
  const withVehicle = drivingDuties.filter(d => d.vehicle);
  if (withVehicle.length === drivingDuties.length) return { status: 'complete', label: 'All assigned', assigned: withVehicle.length, total: drivingDuties.length };
  if (withVehicle.length === 0) return { status: 'none', label: 'No vehicles', assigned: 0, total: drivingDuties.length };
  return { status: 'partial', label: `${withVehicle.length}/${drivingDuties.length} assigned`, assigned: withVehicle.length, total: drivingDuties.length };
}

function findOverlappingDuty(duties, start, end, excludeId = null) {
  const startMins = toMinutes(start);
  const endMins = toMinutes(end);
  return duties.find(d => {
    if (d.id === excludeId) return false;
    if (d.cancelled) return false; // Skip cancelled duties
    const dStartMins = toMinutes(d.start);
    const dEndMins = toMinutes(d.end);
    return (startMins < dEndMins && endMins > dStartMins);
  });
}

function findAvailableSlots(duties, shiftStart, shiftEnd, minDuration = 0.25) {
  const slots = [];
  // Only consider active (non-cancelled) duties
  const activeDuties = duties.filter(d => !d.cancelled);
  const sortedDuties = [...activeDuties].sort((a, b) => a.start - b.start);
  let currentTime = shiftStart;
  const minDurationMins = toMinutes(minDuration);
  
  for (const duty of sortedDuties) {
    const gapMins = toMinutes(duty.start) - toMinutes(currentTime);
    if (gapMins >= minDurationMins) {
      slots.push({ start: currentTime, end: duty.start });
    }
    currentTime = Math.max(currentTime, duty.end);
  }
  
  const endGapMins = toMinutes(shiftEnd) - toMinutes(currentTime);
  if (endGapMins >= minDurationMins) {
    slots.push({ start: currentTime, end: shiftEnd });
  }
  
  return slots;
}

function validateDutyForm(data, duties, shiftStart, shiftEnd, excludeId = null, driver = null, currentShiftId = null) {
  const errors = {};
  
  if (isNaN(data.start) || isNaN(data.end)) {
    errors.time = 'Invalid time format (use HH:MM or HHMM, e.g., 07:30 or 0730)';
    return errors;
  }
  
  if (data.start < 0 || data.start > 24 || data.end < 0 || data.end > 24) {
    errors.time = 'Time must be between 00:00 and 24:00';
    return errors;
  }
  
  const startMins = toMinutes(data.start);
  const endMins = toMinutes(data.end);
  
  if (startMins >= endMins) {
    errors.time = 'End time must be after start time';
    return errors;
  }
  
  // Check for overlaps with other duties in this shift
  const overlap = findOverlappingDuty(duties, data.start, data.end, excludeId);
  if (overlap) {
    errors.overlap = `Overlaps with duty at ${formatTime(overlap.start)}-${formatTime(overlap.end)}`;
    return errors;
  }
  
  // Check for overlaps with OTHER shifts for this driver
  if (driver && currentShiftId) {
    const overlapOtherShift = driver.shifts.find(s => {
      if (s.id === currentShiftId) return false;
      return data.start < s.end && data.end > s.start;
    });
    
    if (overlapOtherShift) {
      errors.overlap = `Overlaps with ${overlapOtherShift.name || 'another shift'} (${formatTime(overlapOtherShift.start)}-${formatTime(overlapOtherShift.end)})`;
      return errors;
    }
  }
  
  // Check vehicle availability (if a vehicle is selected)
  if (data.vehicle && !isVehicleAvailableForDuty(data.vehicle, data.start, data.end, excludeId)) {
    errors.vehicle = `${data.vehicle} is already assigned during this time`;
  }
  
  return errors;
}

function getFilteredDrivers() {
  let result = drivers;
  
  // Apply search filter
  if (driverFilters.search) {
    const search = driverFilters.search.toLowerCase();
    result = result.filter(d => 
      d.name.toLowerCase().includes(search) || 
      d.fullName.toLowerCase().includes(search) ||
      d.id.toLowerCase().includes(search)
    );
  }
  
  // Apply status filter
  if (driverFilters.status !== 'all') {
    if (driverFilters.status === 'active') {
      result = result.filter(d => d.status !== 'leave');
    } else {
      result = result.filter(d => d.status === driverFilters.status);
    }
  }
  
  // Apply sort
  result = [...result].sort((a, b) => {
    switch (driverFilters.sort) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'status':
      default:
        const statusOrder = { leave: 0, working: 1, available: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
    }
  });
  
  return result;
}

function getFilteredVehicles() {
  let result = vehicles;
  
  // Apply search filter
  if (vehicleFilters.search) {
    const search = vehicleFilters.search.toLowerCase();
    result = result.filter(v => 
      v.id.toLowerCase().includes(search) || 
      v.rego.toLowerCase().includes(search)
    );
  }
  
  // Apply status filter
  if (vehicleFilters.status !== 'all') {
    if (vehicleFilters.status === 'active') {
      result = result.filter(v => v.status !== 'maintenance');
    } else {
      result = result.filter(v => v.status === vehicleFilters.status);
    }
  }
  
  // Apply sort
  result = [...result].sort((a, b) => {
    switch (vehicleFilters.sort) {
      case 'id':
        return a.id.localeCompare(b.id);
      case 'status':
      default:
        const statusOrder = { maintenance: 0, inuse: 1, available: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
    }
  });
  
  return result;
}

function getFilteredJobs() {
  return unassignedJobs;
}

function applyDriverFilters() {
  driverFilters.search = document.getElementById('driverSearch')?.value || '';
  driverFilters.status = document.getElementById('driverStatusFilter')?.value || 'all';
  driverFilters.sort = document.getElementById('driverSort')?.value || 'status';
  renderDriverRows();
  if (viewMode === 'vertical') {
    renderDriverVertical();
  }
  updateStats();
}

function applyVehicleFilters() {
  vehicleFilters.search = document.getElementById('vehicleSearch')?.value || '';
  vehicleFilters.status = document.getElementById('vehicleStatusFilter')?.value || 'all';
  vehicleFilters.sort = document.getElementById('vehicleSort')?.value || 'status';
  renderVehicleRows();
  if (viewMode === 'vertical') {
    renderVehicleVertical();
  }
  updateStats();
}

function toggleShowCancelled() {
  showCancelledDuties = !showCancelledDuties;
  const btn = document.getElementById('showCancelledBtn');
  if (btn) {
    btn.classList.toggle('active', showCancelledDuties);
  }
  renderDriverRows();
  if (viewMode === 'vertical') {
    renderDriverVertical();
  }
}

function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  const wasCollapsed = section.classList.contains('collapsed');
  
  section.classList.toggle('collapsed');
  
  // Clear custom height when collapsing
  if (!wasCollapsed) {
    section.style.flex = '';
    section.style.height = '';
  } else {
    // When expanding, redistribute space
    redistributeSectionSpace();
  }
}

function redistributeSectionSpace() {
  const sections = ['driversSection', 'vehiclesSection', 'unassignedSection'];
  const expandedSections = sections.filter(id => {
    const section = document.getElementById(id);
    return !section.classList.contains('collapsed');
  });
  
  // Reset flex for expanded sections
  expandedSections.forEach(id => {
    const section = document.getElementById(id);
    if (id === 'unassignedSection') {
      section.style.flex = '0.6';
    } else if (allocationMode === 'vehicle') {
      section.style.flex = id === 'vehiclesSection' ? '1.2' : '1';
    } else {
      section.style.flex = id === 'driversSection' ? '1.2' : '1';
    }
  });
}

function expandSection(sectionId) {
  const sections = document.querySelectorAll('.heatmap-section');
  if (expandedSection === sectionId) {
    document.getElementById(sectionId).classList.remove('expanded');
    expandedSection = null;
    // Restore default flex values
    resetSectionSizes();
  } else {
    sections.forEach(s => {
      s.classList.remove('expanded');
      s.style.flex = '';
      s.style.height = '';
    });
    document.getElementById(sectionId).classList.remove('collapsed');
    document.getElementById(sectionId).classList.add('expanded');
    expandedSection = sectionId;
  }
}

function resetSectionSizes() {
  const driversSection = document.getElementById('driversSection');
  const vehiclesSection = document.getElementById('vehiclesSection');
  const unassignedSection = document.getElementById('unassignedSection');
  
  driversSection.style.flex = '';
  driversSection.style.height = '';
  vehiclesSection.style.flex = '';
  vehiclesSection.style.height = '';
  unassignedSection.style.flex = '';
  unassignedSection.style.height = '';
}

// Section resize functionality
let resizeState = null;

function initResizeHandles() {
  const handles = document.querySelectorAll('.section-resize-handle');
  
  handles.forEach(handle => {
    handle.addEventListener('mousedown', startResize);
  });
  
  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
}

function startResize(e) {
  const handle = e.target;
  const aboveId = handle.dataset.above;
  const belowId = handle.dataset.below;
  const aboveSection = document.getElementById(aboveId);
  const belowSection = document.getElementById(belowId);
  
  // If both sections are collapsed, do nothing
  if (aboveSection.classList.contains('collapsed') && belowSection.classList.contains('collapsed')) {
    return;
  }
  
  // If one section is collapsed, expand it first
  if (aboveSection.classList.contains('collapsed')) {
    aboveSection.classList.remove('collapsed');
    aboveSection.style.flex = '0 0 100px';
  }
  if (belowSection.classList.contains('collapsed')) {
    belowSection.classList.remove('collapsed');
    belowSection.style.flex = '0 0 100px';
  }
  
  // Clear expanded state
  if (expandedSection) {
    document.getElementById(expandedSection).classList.remove('expanded');
    expandedSection = null;
  }
  
  const container = document.querySelector('.heatmap-left');
  const containerRect = container.getBoundingClientRect();
  
  resizeState = {
    handle,
    aboveSection,
    belowSection,
    startY: e.clientY,
    aboveStartHeight: aboveSection.getBoundingClientRect().height,
    belowStartHeight: belowSection.getBoundingClientRect().height,
    containerHeight: containerRect.height
  };
  
  handle.classList.add('active');
  aboveSection.classList.add('resizing');
  belowSection.classList.add('resizing');
  document.body.style.cursor = 'ns-resize';
  document.body.style.userSelect = 'none';
  
  e.preventDefault();
}

function doResize(e) {
  if (!resizeState) return;
  
  const { handle, aboveSection, belowSection, startY, aboveStartHeight, belowStartHeight } = resizeState;
  const deltaY = e.clientY - startY;
  
  const minHeight = 50; // Minimum section height (smaller for more control)
  
  let newAboveHeight = aboveStartHeight + deltaY;
  let newBelowHeight = belowStartHeight - deltaY;
  
  // Enforce minimum heights
  if (newAboveHeight < minHeight) {
    newAboveHeight = minHeight;
    newBelowHeight = aboveStartHeight + belowStartHeight - minHeight;
  }
  if (newBelowHeight < minHeight) {
    newBelowHeight = minHeight;
    newAboveHeight = aboveStartHeight + belowStartHeight - minHeight;
  }
  
  // Apply heights using flex-basis
  aboveSection.style.flex = `0 0 ${newAboveHeight}px`;
  belowSection.style.flex = `0 0 ${newBelowHeight}px`;
}

function stopResize() {
  if (!resizeState) return;
  
  const { handle, aboveSection, belowSection } = resizeState;
  
  handle.classList.remove('active');
  aboveSection.classList.remove('resizing');
  belowSection.classList.remove('resizing');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  
  resizeState = null;
}

// Panel (sidebar) resize functionality
let panelResizeState = null;

function initPanelResize() {
  const handle = document.getElementById('panelResizeHandle');
  if (handle) {
    handle.addEventListener('mousedown', startPanelResize);
  }
  
  document.addEventListener('mousemove', doPanelResize);
  document.addEventListener('mouseup', stopPanelResize);
}

function startPanelResize(e) {
  const handle = e.target;
  const panel = document.getElementById('detailPanel');
  
  panelResizeState = {
    handle,
    panel,
    startX: e.clientX,
    startWidth: panel.getBoundingClientRect().width
  };
  
  handle.classList.add('active');
  panel.classList.add('resizing');
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  
  e.preventDefault();
}

function doPanelResize(e) {
  if (!panelResizeState) return;
  
  const { handle, panel, startX, startWidth } = panelResizeState;
  const deltaX = startX - e.clientX; // Inverted because dragging left increases width
  
  const minWidth = 280;
  const maxWidth = 800;
  
  let newWidth = startWidth + deltaX;
  
  // Enforce min/max widths
  newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
  
  panel.style.width = `${newWidth}px`;
}

function stopPanelResize() {
  if (!panelResizeState) return;
  
  const { handle, panel } = panelResizeState;
  
  handle.classList.remove('active');
  panel.classList.remove('resizing');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  
  panelResizeState = null;
}

function popoutSection(type) { showToast('Pop-out opened'); }

function renderTimelineHeader(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (let h = 5; h <= 23; h++) {
    const div = document.createElement('div');
    div.className = 'timeline-hour';
    div.textContent = String(h).padStart(2, '0');
    container.appendChild(div);
  }
}

// ============================================
// RENDERING - TIMELINE (STYLE-AWARE)
// ============================================

function renderDriverRowStyleA(driver, idx) {
  const statusClass = driver.status === 'leave' ? 'leave' : driver.status === 'available' ? 'available' : 'busy';
  
  let blocksHTML = '';
  
  if (driver.status === 'leave') {
    blocksHTML = `<div class="timeline-duty leave" style="left: 0%; width: 100%;">LEAVE</div>`;
  } else {
    (driver.shifts || []).forEach(shift => {
      // Filter out cancelled duties for Gantt display (unless toggle is on)
      const activeDuties = (shift.duties || []).filter(d => !d.cancelled);
      const cancelledDuties = showCancelledDuties ? (shift.duties || []).filter(d => d.cancelled) : [];
      
      if (activeDuties.length === 0 && cancelledDuties.length === 0) return;
      
      // Only show shift label if there are active duties
      if (activeDuties.length > 0) {
        const shiftLeft = timeToPercent(shift.start);
        blocksHTML += `<div class="shift-label" style="left: ${shiftLeft}%">${shift.name}</div>`;
      }
      
      // Render active duties
      activeDuties.forEach(duty => {
        const left = timeToPercent(duty.start);
        const width = Math.max(timeToPercent(duty.end) - left, 0.5);
        const shortLabel = getDutyShortLabel(duty, width);
        blocksHTML += `<div class="timeline-duty ${duty.type}" style="left: ${left}%; width: ${width}%;">
          <span class="duty-text">${shortLabel}</span>
          ${renderDutyTooltip(duty, shift.name)}
        </div>`;
        
        // Show vehicle indicator for any duty with a vehicle assigned
        if (duty.vehicle) {
          blocksHTML += `<div class="vehicle-status-bar" style="left: ${left}%; width: ${width}%;"></div>`;
        }
      });
      
      // Render cancelled duties as ghost bars
      cancelledDuties.forEach(duty => {
        const left = timeToPercent(duty.start);
        const width = Math.max(timeToPercent(duty.end) - left, 0.5);
        blocksHTML += `<div class="timeline-duty cancelled-ghost" style="left: ${left}%; width: ${width}%;" title="CANCELLED: ${duty.description}${duty.cancelReason ? ' (' + duty.cancelReason + ')' : ''}"></div>`;
      });
    });
  }
  
  return `
    <div class="heatmap-row ${selectedItem?.type === 'driver' && selectedItem?.index === idx ? 'selected' : ''}" 
         onclick="selectItem('driver', ${idx})">
      <div class="row-label">
        <div class="row-status ${statusClass}"></div>
        <span class="row-name">${driver.name}</span>
      </div>
      <div class="row-timeline">${blocksHTML}</div>
    </div>
  `;
}

function renderDriverRowStyleBCD(driver, idx, style) {
  const statusClass = driver.status === 'leave' ? 'leave' : driver.status === 'available' ? 'available' : 'busy';
  
  let blocksHTML = '';
  
  if (driver.status === 'leave') {
    blocksHTML = `<div class="timeline-duty leave" style="left: 0%; width: 100%;">LEAVE</div>`;
  } else {
    (driver.shifts || []).forEach(shift => {
      const allDuties = shift.duties || [];
      const activeDuties = allDuties.filter(d => !d.cancelled);
      const cancelledDuties = allDuties.filter(d => d.cancelled);
      
      if (activeDuties.length === 0 && !showCancelledDuties) return;
      if (allDuties.length === 0) return;
      
      const shiftTypeClass = shift.type === 'charter' ? 'charter' : (shift.type === 'adhoc' ? 'adhoc' : 'regular');
      
      if (showCancelledDuties) {
        // Show all duties in one bar
        const dutiesToRender = [...allDuties].sort((a, b) => a.start - b.start);
        const shiftStart = Math.min(...dutiesToRender.map(d => d.start));
        const shiftEnd = Math.max(...dutiesToRender.map(d => d.end));
        const shiftLeft = timeToPercent(shiftStart);
        const shiftWidth = timeToPercent(shiftEnd) - shiftLeft;
        const shiftDuration = shiftEnd - shiftStart;
        
        let segmentsHTML = '';
        let vehicleStripHTML = '';
        
        dutiesToRender.forEach(duty => {
          const dutyWidth = ((duty.end - duty.start) / shiftDuration) * 100;
          const dutyLeft = ((duty.start - shiftStart) / shiftDuration) * 100;
          const isCancelled = duty.cancelled;
          
          if (isCancelled) {
            segmentsHTML += `<div class="segment cancelled-ghost" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="CANCELLED: ${duty.description}${duty.cancelReason ? ' (' + duty.cancelReason + ')' : ''}"></div>`;
            vehicleStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%; opacity: 0.3;"></div>`;
          } else {
            segmentsHTML += `<div class="segment ${duty.type}" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
            if (duty.vehicle) {
              const vehicleObj = vehicles.find(v => v.id === duty.vehicle);
              const vehicleLabel = vehicleObj ? vehicleObj.rego : duty.vehicle;
              vehicleStripHTML += `<div class="vehicle-segment assigned" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="${vehicleLabel}">${vehicleLabel}</div>`;
            } else if (VEHICLE_REQUIRED_TYPES.includes(duty.type)) {
              vehicleStripHTML += `<div class="vehicle-segment missing" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="No vehicle">—</div>`;
            } else {
              vehicleStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
            }
          }
        });
        
        blocksHTML += `
          <div class="shift-bar ${shiftTypeClass}" style="left: ${shiftLeft}%; width: ${shiftWidth}%;">
            ${segmentsHTML}
            <div class="shift-label">${shift.name}</div>
            <div class="vehicle-strip">${vehicleStripHTML}</div>
            ${renderShiftTooltip(shift)}
          </div>
        `;
      } else {
        // Group contiguous active duties into separate bars
        const sortedActive = [...activeDuties].sort((a, b) => a.start - b.start);
        const groups = [];
        let currentGroup = [];
        
        sortedActive.forEach(duty => {
          if (currentGroup.length === 0) {
            currentGroup.push(duty);
          } else {
            const lastDuty = currentGroup[currentGroup.length - 1];
            // Check if this duty is contiguous (starts when last one ends)
            if (Math.abs(duty.start - lastDuty.end) < 0.01) {
              currentGroup.push(duty);
            } else {
              groups.push(currentGroup);
              currentGroup = [duty];
            }
          }
        });
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        
        // Render each group as a separate shift bar
        groups.forEach((group, groupIdx) => {
          const groupStart = Math.min(...group.map(d => d.start));
          const groupEnd = Math.max(...group.map(d => d.end));
          const groupLeft = timeToPercent(groupStart);
          const groupWidth = timeToPercent(groupEnd) - groupLeft;
          const groupDuration = groupEnd - groupStart;
          
          let segmentsHTML = '';
          let vehicleStripHTML = '';
          
          group.forEach(duty => {
            const dutyWidth = ((duty.end - duty.start) / groupDuration) * 100;
            const dutyLeft = ((duty.start - groupStart) / groupDuration) * 100;
            
            segmentsHTML += `<div class="segment ${duty.type}" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
            if (duty.vehicle) {
              const vehicleObj = vehicles.find(v => v.id === duty.vehicle);
              const vehicleLabel = vehicleObj ? vehicleObj.rego : duty.vehicle;
              vehicleStripHTML += `<div class="vehicle-segment assigned" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="${vehicleLabel}">${vehicleLabel}</div>`;
            } else if (VEHICLE_REQUIRED_TYPES.includes(duty.type)) {
              vehicleStripHTML += `<div class="vehicle-segment missing" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="No vehicle">—</div>`;
            } else {
              vehicleStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
            }
          });
          
          // Only show shift name on first group
          const label = groupIdx === 0 ? shift.name : '';
          
          blocksHTML += `
            <div class="shift-bar ${shiftTypeClass}" style="left: ${groupLeft}%; width: ${groupWidth}%;">
              ${segmentsHTML}
              ${label ? `<div class="shift-label">${label}</div>` : ''}
              <div class="vehicle-strip">${vehicleStripHTML}</div>
              ${groupIdx === 0 ? renderShiftTooltip(shift) : ''}
            </div>
          `;
        });
      }
    });
  }
  
  return `
    <div class="heatmap-row ${selectedItem?.type === 'driver' && selectedItem?.index === idx ? 'selected' : ''}" 
         onclick="selectItem('driver', ${idx})">
      <div class="row-label">
        <div class="row-status ${statusClass}"></div>
        <span class="row-name">${driver.name}</span>
      </div>
      <div class="row-timeline">${blocksHTML}</div>
    </div>
  `;
}

function renderDriverRowStyleE(driver, idx) {
  const statusClass = driver.status === 'leave' ? 'leave' : driver.status === 'available' ? 'available' : 'busy';
  
  let blocksHTML = '';
  
  if (driver.status === 'leave') {
    blocksHTML = `<div class="timeline-duty leave" style="left: 0%; width: 100%;">LEAVE</div>`;
  } else {
    (driver.shifts || []).forEach(shift => {
      const allDuties = shift.duties || [];
      const activeDuties = allDuties.filter(d => !d.cancelled);
      
      if (activeDuties.length === 0 && !showCancelledDuties) return;
      if (allDuties.length === 0) return;
      
      if (showCancelledDuties) {
        // Show all duties in one bar
        const dutiesToRender = [...allDuties].sort((a, b) => a.start - b.start);
        const shiftStart = Math.min(...dutiesToRender.map(d => d.start));
        const shiftEnd = Math.max(...dutiesToRender.map(d => d.end));
        const shiftLeft = timeToPercent(shiftStart);
        const shiftWidth = timeToPercent(shiftEnd) - shiftLeft;
        const shiftDuration = shiftEnd - shiftStart;
        
        let segmentsHTML = '';
        let vehicleStripHTML = '';
        
        dutiesToRender.forEach(duty => {
          const dutyLeft = ((duty.start - shiftStart) / shiftDuration) * 100;
          const dutyWidth = ((duty.end - duty.start) / shiftDuration) * 100;
          const isCancelled = duty.cancelled;
          const segmentClass = isCancelled ? 'segment cancelled-ghost' : `segment ${duty.type}`;
          const tooltip = isCancelled ? ` title="CANCELLED: ${duty.description}${duty.cancelReason ? ' (' + duty.cancelReason + ')' : ''}"` : '';
          
          segmentsHTML += `<div class="${segmentClass}" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"${tooltip}></div>`;
          
          if (!isCancelled) {
            if (duty.vehicle) {
              const vehicleObj = vehicles.find(v => v.id === duty.vehicle);
              const vehicleLabel = vehicleObj ? vehicleObj.rego : duty.vehicle;
              vehicleStripHTML += `<div class="vehicle-segment assigned" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="${vehicleLabel}">${vehicleLabel}</div>`;
            } else if (VEHICLE_REQUIRED_TYPES.includes(duty.type)) {
              vehicleStripHTML += `<div class="vehicle-segment missing" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="No vehicle">—</div>`;
            } else {
              vehicleStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
            }
          } else {
            vehicleStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%; opacity: 0.3;"></div>`;
          }
        });
        
        blocksHTML += `
          <div class="shift-bar" style="left: ${shiftLeft}%; width: ${shiftWidth}%;">
            ${segmentsHTML}
            <div class="shift-label">${shift.name}</div>
            <div class="vehicle-strip">${vehicleStripHTML}</div>
            ${renderShiftTooltip(shift)}
          </div>
        `;
      } else {
        // Group contiguous active duties into separate bars
        const sortedActive = [...activeDuties].sort((a, b) => a.start - b.start);
        const groups = [];
        let currentGroup = [];
        
        sortedActive.forEach(duty => {
          if (currentGroup.length === 0) {
            currentGroup.push(duty);
          } else {
            const lastDuty = currentGroup[currentGroup.length - 1];
            if (Math.abs(duty.start - lastDuty.end) < 0.01) {
              currentGroup.push(duty);
            } else {
              groups.push(currentGroup);
              currentGroup = [duty];
            }
          }
        });
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        
        groups.forEach((group, groupIdx) => {
          const groupStart = Math.min(...group.map(d => d.start));
          const groupEnd = Math.max(...group.map(d => d.end));
          const groupLeft = timeToPercent(groupStart);
          const groupWidth = timeToPercent(groupEnd) - groupLeft;
          const groupDuration = groupEnd - groupStart;
          
          let segmentsHTML = '';
          let vehicleStripHTML = '';
          
          group.forEach(duty => {
            const dutyWidth = ((duty.end - duty.start) / groupDuration) * 100;
            const dutyLeft = ((duty.start - groupStart) / groupDuration) * 100;
            
            segmentsHTML += `<div class="segment ${duty.type}" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
            if (duty.vehicle) {
              const vehicleObj = vehicles.find(v => v.id === duty.vehicle);
              const vehicleLabel = vehicleObj ? vehicleObj.rego : duty.vehicle;
              vehicleStripHTML += `<div class="vehicle-segment assigned" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="${vehicleLabel}">${vehicleLabel}</div>`;
            } else if (VEHICLE_REQUIRED_TYPES.includes(duty.type)) {
              vehicleStripHTML += `<div class="vehicle-segment missing" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="No vehicle">—</div>`;
            } else {
              vehicleStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
            }
          });
          
          const label = groupIdx === 0 ? shift.name : '';
          
          blocksHTML += `
            <div class="shift-bar" style="left: ${groupLeft}%; width: ${groupWidth}%;">
              ${segmentsHTML}
              ${label ? `<div class="shift-label">${label}</div>` : ''}
              <div class="vehicle-strip">${vehicleStripHTML}</div>
              ${groupIdx === 0 ? renderShiftTooltip(shift) : ''}
            </div>
          `;
        });
      }
    });
  }
  
  return `
    <div class="heatmap-row ${selectedItem?.type === 'driver' && selectedItem?.index === idx ? 'selected' : ''}" 
         onclick="selectItem('driver', ${idx})">
      <div class="row-label">
        <div class="row-status ${statusClass}"></div>
        <span class="row-name">${driver.name}</span>
      </div>
      <div class="row-timeline">${blocksHTML}</div>
    </div>
  `;
}

function renderDriverRows() {
  const container = document.getElementById('driverRows');
  const filtered = getFilteredDrivers();
  
  container.innerHTML = filtered.map(driver => {
    const idx = drivers.indexOf(driver);
    
    if (currentStyle === 'style-a') {
      return renderDriverRowStyleA(driver, idx);
    } else if (currentStyle === 'style-e') {
      return renderDriverRowStyleE(driver, idx);
    } else {
      return renderDriverRowStyleBCD(driver, idx, currentStyle);
    }
  }).join('');
}

function renderVehicleRows() {
  const container = document.getElementById('vehicleRows');
  const filtered = getFilteredVehicles();
  
  container.innerHTML = filtered.map(vehicle => {
    const idx = vehicles.indexOf(vehicle);
    const statusClass = vehicle.status === 'maintenance' ? 'maintenance' : vehicle.status === 'available' ? 'available' : 'busy';
    
    let blocksHTML = '';
    
    if (currentStyle === 'style-a') {
      // Style A: Fragmented blocks showing duties
      
      // Helper to check if a synced duty's source is cancelled
      const isDutyCancelled = (duty) => {
        if (duty.cancelled) return true;
        if (duty.syncedDutyId) {
          for (const driver of drivers) {
            for (const dShift of driver.shifts || []) {
              const sourceDuty = (dShift.duties || []).find(d => d.id === duty.syncedDutyId);
              if (sourceDuty) {
                return sourceDuty.cancelled === true;
              }
            }
          }
        }
        return false;
      };
      
      if (allocationMode === 'vehicle' && vehicle.shifts) {
        // Vehicle-centric: show duties with driver assignment indicators
        (vehicle.shifts || []).forEach(shift => {
          const allDuties = shift.duties || [];
          const activeDuties = allDuties.filter(d => !isDutyCancelled(d));
          const cancelledDuties = allDuties.filter(d => isDutyCancelled(d));
          
          if (activeDuties.length === 0 && !showCancelledDuties) return;
          
          const shiftLeft = timeToPercent(shift.start);
          blocksHTML += `<div class="shift-label" style="left: ${shiftLeft}%">${shift.name}</div>`;
          
          // Render active duties
          activeDuties.forEach(duty => {
            const left = timeToPercent(duty.start);
            const width = Math.max(timeToPercent(duty.end) - left, 0.5);
            const shortLabel = getDutyShortLabel(duty, width);
            blocksHTML += `<div class="timeline-duty ${duty.type}" style="left: ${left}%; width: ${width}%;">
              <span class="duty-text">${shortLabel}</span>
              ${renderDutyTooltip(duty, shift.name)}
            </div>`;
            
            // Show driver assignment status (green bar if driver assigned)
            if (DRIVER_REQUIRED_TYPES.includes(duty.type) && (duty.driver || duty.driverId)) {
              blocksHTML += `<div class="vehicle-status-bar" style="left: ${left}%; width: ${width}%;"></div>`;
            }
          });
          
          // Render cancelled duties as ghost bars
          if (showCancelledDuties) {
            cancelledDuties.forEach(duty => {
              const left = timeToPercent(duty.start);
              const width = Math.max(timeToPercent(duty.end) - left, 0.5);
              blocksHTML += `<div class="timeline-duty cancelled-ghost" style="left: ${left}%; width: ${width}%;" title="CANCELLED: ${duty.description || ''}"></div>`;
            });
          }
        });
      } else {
        // Driver-centric: simple blocks with tooltip
        (vehicle.shifts || []).forEach(shift => {
          const allDuties = shift.duties || [];
          const hasActiveDuties = allDuties.some(d => !isDutyCancelled(d));
          
          if (!hasActiveDuties && !showCancelledDuties) return;
          
          const left = timeToPercent(shift.start);
          const width = timeToPercent(shift.end) - left;
          const typeClass = shift.type === 'maintenance' ? 'maintenance' : 'driving';
          const shortLabel = width < 4 ? '' : (shift.type === 'maintenance' ? 'MAINT' : shift.name.substring(0, 8));
          const fullLabel = shift.type === 'maintenance' ? 'Maintenance' : shift.name;
          // Create a simple tooltip for shift-level blocks
          const tooltip = `<div class="timeline-duty-tooltip">
            <div class="tooltip-title">${fullLabel}</div>
            <div class="tooltip-row"><span class="tooltip-label">Time</span><span class="tooltip-value">${formatTime(shift.start)} - ${formatTime(shift.end)}</span></div>
            <div class="tooltip-row"><span class="tooltip-label">Hours</span><span class="tooltip-value">${(shift.end - shift.start).toFixed(2)}h</span></div>
          </div>`;
          blocksHTML += `<div class="timeline-duty ${typeClass}" style="left: ${left}%; width: ${width}%;">
            <span class="duty-text">${shortLabel}</span>
            ${tooltip}
          </div>`;
        });
      }
    } else {
      // Styles B, C, D, E: Unified bars with driver strip
      (vehicle.shifts || []).forEach(shift => {
        const allDuties = shift.duties || [];
        
        // Helper to check if a synced duty's source is cancelled
        const isDutyCancelled = (duty) => {
          if (duty.cancelled) return true;
          // Check if the source duty on a driver is cancelled
          if (duty.syncedDutyId) {
            for (const driver of drivers) {
              for (const dShift of driver.shifts || []) {
                const sourceDuty = (dShift.duties || []).find(d => d.id === duty.syncedDutyId);
                if (sourceDuty) {
                  return sourceDuty.cancelled === true;
                }
              }
            }
          }
          return false;
        };
        
        const activeDuties = allDuties.filter(d => !isDutyCancelled(d));
        const typeClass = shift.type === 'maintenance' ? 'maintenance' : (shift.type === 'charter' ? 'charter' : 'regular');
        const label = shift.type === 'maintenance' ? 'MAINT' : shift.name;
        
        if (activeDuties.length === 0 && !showCancelledDuties) return;
        if (allDuties.length === 0) return;
        
        if (showCancelledDuties) {
          // Show all duties in one bar
          const dutiesToRender = [...allDuties].sort((a, b) => a.start - b.start);
          const shiftStart = Math.min(...dutiesToRender.map(d => d.start));
          const shiftEnd = Math.max(...dutiesToRender.map(d => d.end));
          const left = timeToPercent(shiftStart);
          const width = timeToPercent(shiftEnd) - left;
          const shiftDuration = shiftEnd - shiftStart;
          
          let segmentsHTML = '';
          let driverStripHTML = '';
          
          dutiesToRender.forEach(duty => {
            const dutyWidth = ((duty.end - duty.start) / shiftDuration) * 100;
            const dutyLeft = ((duty.start - shiftStart) / shiftDuration) * 100;
            const isCancelled = isDutyCancelled(duty);
            
            if (isCancelled) {
              segmentsHTML += `<div class="segment cancelled-ghost" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="CANCELLED: ${duty.description || ''}"></div>`;
              driverStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%; opacity: 0.3;"></div>`;
            } else {
              segmentsHTML += `<div class="segment ${duty.type}" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
              const hasDriver = duty.driver || duty.driverId;
              if (hasDriver) {
                let driverName = duty.driver;
                if (!driverName && duty.driverId) {
                  const driverObj = drivers.find(d => d.id === duty.driverId);
                  driverName = driverObj ? driverObj.name : duty.driverId;
                }
                driverStripHTML += `<div class="vehicle-segment assigned" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="${driverName}">${driverName}</div>`;
              } else if (DRIVER_REQUIRED_TYPES.includes(duty.type)) {
                driverStripHTML += `<div class="vehicle-segment missing" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="No driver">—</div>`;
              } else {
                driverStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
              }
            }
          });
          
          blocksHTML += `
            <div class="shift-bar ${typeClass}" style="left: ${left}%; width: ${width}%;">
              ${segmentsHTML}
              <div class="shift-label">${label}</div>
              <div class="vehicle-strip">${driverStripHTML}</div>
              ${renderShiftTooltip(shift)}
            </div>
          `;
        } else {
          // Group contiguous active duties into separate bars
          const sortedActive = [...activeDuties].sort((a, b) => a.start - b.start);
          const groups = [];
          let currentGroup = [];
          
          sortedActive.forEach(duty => {
            if (currentGroup.length === 0) {
              currentGroup.push(duty);
            } else {
              const lastDuty = currentGroup[currentGroup.length - 1];
              if (Math.abs(duty.start - lastDuty.end) < 0.01) {
                currentGroup.push(duty);
              } else {
                groups.push(currentGroup);
                currentGroup = [duty];
              }
            }
          });
          if (currentGroup.length > 0) {
            groups.push(currentGroup);
          }
          
          groups.forEach((group, groupIdx) => {
            const groupStart = Math.min(...group.map(d => d.start));
            const groupEnd = Math.max(...group.map(d => d.end));
            const groupLeft = timeToPercent(groupStart);
            const groupWidth = timeToPercent(groupEnd) - groupLeft;
            const groupDuration = groupEnd - groupStart;
            
            let segmentsHTML = '';
            let driverStripHTML = '';
            
            group.forEach(duty => {
              const dutyWidth = ((duty.end - duty.start) / groupDuration) * 100;
              const dutyLeft = ((duty.start - groupStart) / groupDuration) * 100;
              
              segmentsHTML += `<div class="segment ${duty.type}" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
              
              const hasDriver = duty.driver || duty.driverId;
              if (hasDriver) {
                let driverName = duty.driver;
                if (!driverName && duty.driverId) {
                  const driverObj = drivers.find(d => d.id === duty.driverId);
                  driverName = driverObj ? driverObj.name : duty.driverId;
                }
                driverStripHTML += `<div class="vehicle-segment assigned" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="${driverName}">${driverName}</div>`;
              } else if (DRIVER_REQUIRED_TYPES.includes(duty.type)) {
                driverStripHTML += `<div class="vehicle-segment missing" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="No driver">—</div>`;
              } else {
                driverStripHTML += `<div class="vehicle-segment none" style="left: ${dutyLeft}%; width: ${dutyWidth}%;"></div>`;
              }
            });
            
            const groupLabel = groupIdx === 0 ? label : '';
            
            blocksHTML += `
              <div class="shift-bar ${typeClass}" style="left: ${groupLeft}%; width: ${groupWidth}%;">
                ${segmentsHTML}
                ${groupLabel ? `<div class="shift-label">${groupLabel}</div>` : ''}
                <div class="vehicle-strip">${driverStripHTML}</div>
                ${groupIdx === 0 ? renderShiftTooltip(shift) : ''}
              </div>
            `;
          });
        }
      });
    }
    
    return `
      <div class="heatmap-row ${selectedItem?.type === 'vehicle' && selectedItem?.index === idx ? 'selected' : ''}"
           onclick="selectItem('vehicle', ${idx})">
        <div class="row-label">
          <div class="row-status ${statusClass}"></div>
          <span class="row-name">${vehicle.rego}</span>
        </div>
        <div class="row-timeline">${blocksHTML}</div>
      </div>
    `;
  }).join('');
}

function renderUnassignedRows() {
  const container = document.getElementById('unassignedRows');
  const filtered = getFilteredJobs();
  
  container.innerHTML = filtered.map(job => {
    // Filter out cancelled duties for display
    const allDuties = job.duties || [];
    const activeDuties = allDuties.filter(d => !d.cancelled);
    const cancelledDuties = allDuties.filter(d => d.cancelled);
    
    if (activeDuties.length === 0 && !showCancelledDuties) return ''; // Skip job entirely if all duties cancelled
    
    const idx = unassignedJobs.indexOf(job);
    
    let blocksHTML = '';
    
    if (showCancelledDuties && allDuties.length > 0) {
      // Show all duties in one bar
      const allStart = Math.min(...allDuties.map(d => d.start));
      const allEnd = Math.max(...allDuties.map(d => d.end));
      const left = timeToPercent(allStart);
      const width = timeToPercent(allEnd) - left;
      
      blocksHTML = `<div class="time-block unassigned-job" style="left: ${left}%; width: ${width}%;">${job.name}</div>`;
      
      // Show cancelled ghost overlays
      cancelledDuties.forEach(duty => {
        const dutyLeft = timeToPercent(duty.start);
        const dutyWidth = timeToPercent(duty.end) - dutyLeft;
        blocksHTML += `<div class="timeline-duty cancelled-ghost" style="left: ${dutyLeft}%; width: ${dutyWidth}%;" title="CANCELLED: ${duty.description || ''}"></div>`;
      });
    } else if (activeDuties.length > 0) {
      // Group contiguous active duties into separate bars
      const sortedActive = [...activeDuties].sort((a, b) => a.start - b.start);
      const groups = [];
      let currentGroup = [];
      
      sortedActive.forEach(duty => {
        if (currentGroup.length === 0) {
          currentGroup.push(duty);
        } else {
          const lastDuty = currentGroup[currentGroup.length - 1];
          if (Math.abs(duty.start - lastDuty.end) < 0.01) {
            currentGroup.push(duty);
          } else {
            groups.push(currentGroup);
            currentGroup = [duty];
          }
        }
      });
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      
      // Render each group as a separate bar
      groups.forEach((group, groupIdx) => {
        const groupStart = Math.min(...group.map(d => d.start));
        const groupEnd = Math.max(...group.map(d => d.end));
        const left = timeToPercent(groupStart);
        const width = timeToPercent(groupEnd) - left;
        const label = groupIdx === 0 ? job.name : '';
        
        blocksHTML += `<div class="time-block unassigned-job" style="left: ${left}%; width: ${width}%;">${label}</div>`;
      });
    }
    
    return `
      <div class="heatmap-row ${selectedItem?.type === 'job' && selectedItem?.index === idx ? 'selected' : ''}"
           onclick="selectItem('job', ${idx})">
        <div class="row-label"><span class="row-name">${job.name}</span></div>
        <div class="row-timeline">${blocksHTML}</div>
      </div>
    `;
  }).join('');
}

function renderAll() {
  renderDriverRows();
  renderVehicleRows();
  renderUnassignedRows();
  
  // Render vertical views if in vertical mode
  if (viewMode === 'vertical') {
    renderDriverVertical();
    renderVehicleVertical();
    renderUnassignedVertical();
  }
  
  updateStats();
  renderDetailPanel();
}

function updateStats() {
  const fd = getFilteredDrivers(), fv = getFilteredVehicles(), fj = getFilteredJobs();
  document.getElementById('statDriversAvail').textContent = fd.filter(d => d.status === 'available').length;
  document.getElementById('statDriversWork').textContent = fd.filter(d => d.status === 'working').length;
  document.getElementById('statDriversLeave').textContent = fd.filter(d => d.status === 'leave').length;
  document.getElementById('statVehiclesAvail').textContent = fv.filter(v => v.status === 'available').length;
  document.getElementById('statVehiclesMaint').textContent = fv.filter(v => v.status === 'maintenance').length;
  document.getElementById('statUnassigned').textContent = fj.length;
  document.getElementById('driverCount').textContent = fd.length;
  document.getElementById('driverAvail').textContent = fd.filter(d => d.status === 'available').length;
  document.getElementById('driverLeave').textContent = fd.filter(d => d.status === 'leave').length;
  document.getElementById('vehicleCount').textContent = fv.length;
  document.getElementById('vehicleAvail').textContent = fv.filter(v => v.status === 'available').length;
  document.getElementById('vehicleMaint').textContent = fv.filter(v => v.status === 'maintenance').length;
  document.getElementById('unassignedCount').textContent = fj.length;
}

function selectItem(type, index) {
  document.querySelectorAll('.heatmap-row.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.nav-highlight').forEach(el => el.classList.remove('nav-highlight'));
  selectedItem = { type, index };
  editingDuty = null;
  formErrors = {};
  renderAll();
}

function navigateToResource(type, index) {
  // Just scroll to and highlight the resource - don't change selection
  // This lets users peek at a driver/vehicle while keeping their current panel context
  
  // Remove any existing nav highlights
  document.querySelectorAll('.nav-highlight').forEach(el => el.classList.remove('nav-highlight'));
  
  setTimeout(() => {
    let rowSelector;
    if (viewMode === 'vertical') {
      rowSelector = `.vertical-column[onclick*="selectItem('${type}', ${index})"]`;
    } else {
      rowSelector = `.heatmap-row[onclick*="selectItem('${type}', ${index})"]`;
    }
    
    const row = document.querySelector(rowSelector);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('nav-highlight');
    }
  }, 50);
}

function renderDetailPanel() {
  const panel = document.getElementById('detailPanel');
  
  if (!selectedItem) {
    panel.innerHTML = `<div class="empty-panel"><div class="empty-icon">📋</div><div class="empty-text">Select a ${allocationMode === 'vehicle' ? 'vehicle' : 'driver'}, ${allocationMode === 'vehicle' ? 'driver' : 'vehicle'}, or job</div></div>`;
    return;
  }
  
  if (selectedItem.type === 'driver') {
    const driver = drivers[selectedItem.index];
    if (!driver) {
      selectedItem = null;
      panel.innerHTML = `<div class="empty-panel"><div class="empty-icon">📋</div><div class="empty-text">Driver not found</div></div>`;
      return;
    }
    panel.innerHTML = renderDriverDetail(driver);
    // Populate transfer list if in transfer mode
    if (transferringShift && transferringShift.type === 'driver') {
      setTimeout(() => updateTransferDriverList(), 0);
    }
    // Populate bulk assign list if in bulk assign mode
    if (bulkAssigning && bulkAssigning.type === 'vehicle') {
      setTimeout(() => updateBulkVehicleList(), 0);
    }
  } else if (selectedItem.type === 'vehicle') {
    const vehicle = vehicles[selectedItem.index];
    if (!vehicle) {
      selectedItem = null;
      panel.innerHTML = `<div class="empty-panel"><div class="empty-icon">📋</div><div class="empty-text">Vehicle not found</div></div>`;
      return;
    }
    panel.innerHTML = renderVehicleDetail(vehicle);
    // Populate transfer list if in transfer mode
    if (transferringShift && transferringShift.type === 'vehicle') {
      setTimeout(() => updateTransferVehicleList(), 0);
    }
    // Populate bulk assign list if in bulk assign mode
    if (bulkAssigning && bulkAssigning.type === 'driver') {
      setTimeout(() => updateBulkDriverList(), 0);
    }
  } else if (selectedItem.type === 'job') {
    const job = unassignedJobs[selectedItem.index];
    if (!job) {
      selectedItem = null;
      panel.innerHTML = `<div class="empty-panel"><div class="empty-icon">📋</div><div class="empty-text">Job not found</div></div>`;
      return;
    }
    panel.innerHTML = renderJobDetail(job);
    // Populate assignment list after render
    setTimeout(() => {
      if (allocationMode === 'vehicle') {
        updateVehicleAssignmentList(selectedItem.index);
      } else {
        updateDriverAssignmentList(selectedItem.index);
      }
    }, 0);
  }
}

function renderDriverDetail(driver) {
  if (allocationMode === 'vehicle') {
    return renderDriverDetailVehicleCentric(driver);
  }
  return renderDriverDetailDriverCentric(driver);
}

function renderDriverDetailDriverCentric(driver) {
  let scheduleHTML = '';
  
  // Check if we're in transfer mode for this driver
  let transferPanelHTML = '';
  if (transferringShift && transferringShift.type === 'driver') {
    const shift = transferringShift.shift;
    
    transferPanelHTML = `
      <div class="panel-section" style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--accent-blue); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div class="panel-section-title" style="color: var(--accent-blue);">Transfer: ${shift.name}</div>
        <div class="info-row"><span class="info-label">Time</span><span class="info-value">${formatTime(shift.start)} - ${formatTime(shift.end)}</span></div>
        <div class="assignment-panel">
          <div class="assignment-search">
            <input type="text" class="assignment-search-input" id="transferDriverSearch" 
                   placeholder="Search drivers..." oninput="updateTransferDriverList()">
          </div>
          <div class="assignment-count" id="transferDriverCount"></div>
          <div class="assignment-list" id="transferDriverList"></div>
        </div>
        <button class="transfer-cancel-btn" onclick="cancelTransfer()">Cancel Transfer</button>
      </div>
    `;
  }
  
  // Check for smart suggestions
  const driverIndex = drivers.indexOf(driver);
  const endingInfo = getDriverEndingInfo(driver);
  const suggestionPanelHTML = renderSuggestionPanel(endingInfo, 'driver', driverIndex);
  
  if (driver.status === 'leave') {
    scheduleHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-red)">On Leave</span></div>`;
  } else if (!driver.shifts || driver.shifts.length === 0) {
    scheduleHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-green)">Available All Day</span></div>`;
  } else {
    scheduleHTML = driver.shifts.map((shift, shiftIdx) => {
      const vehicleStatus = getShiftVehicleStatus(shift);
      return `
        <div class="shift-block">
          <div class="shift-block-header">
            <div class="shift-block-title">${shift.name}</div>
            <div class="shift-block-meta">
              <span class="shift-vehicle-status ${vehicleStatus.status}">${vehicleStatus.label}</span>
              <span class="shift-block-time">${formatTime(shift.start)}-${formatTime(shift.end)}</span>
            </div>
          </div>
          <div class="shift-block-actions">
            ${vehicleStatus.status !== 'complete' ? `<button class="shift-action-btn primary" onclick="showBulkAssignVehicle('${driver.id}', '${shift.id}')" title="Assign vehicle to all unassigned duties">Assign All</button>` : ''}
            <button class="shift-action-btn" onclick="showTransferDriverShift('${driver.id}', ${shiftIdx})" title="Transfer to another driver">Transfer</button>
            <button class="shift-action-btn danger" onclick="cancelAllDuties('${driver.id}', '${shift.id}')" title="Cancel all duties in this shift">Cancel All</button>
            <button class="shift-action-btn danger" onclick="unassignDriverShift('${driver.id}', ${shiftIdx})" title="Remove and move to unassigned">Unassign</button>
          </div>
          ${bulkAssigning && bulkAssigning.type === 'vehicle' && bulkAssigning.driverId === driver.id && bulkAssigning.shiftId === shift.id ? renderBulkAssignVehiclePanel() : ''}
          <div class="shift-block-content">
            <div class="duty-list-header">
              <span class="duty-header-time">Start</span>
              <span class="duty-header-sep"></span>
              <span class="duty-header-time">End</span>
              <span class="duty-header-type">Type</span>
              <span class="duty-header-desc">Desc</span>
              <span class="duty-header-location">Location</span>
              <span class="duty-header-vehicle">Vehicle</span>
              <span class="duty-header-pay">Pay</span>
              <span class="duty-header-hours">Hours</span>
              <span class="duty-header-actions"></span>
            </div>
            <div class="duty-list">
              ${shift.duties.map((duty, idx) => renderDutyItem(duty, driver.id, shift.id, idx)).join('')}
            </div>
            ${renderShiftTotals(shift, driver.id)}
          </div>
        </div>
      `;
    }).join('');
  }
  
  return `
    <div class="panel-header">
      <div class="panel-header-info">
        <div class="panel-title">${driver.fullName}</div>
        <div class="panel-subtitle">${driver.id}</div>
      </div>
      <div class="panel-actions">
        <button class="panel-action-btn" onclick="showToast('Calling ${driver.phone}...')">📞</button>
        <button class="panel-action-btn" onclick="showToast('Opening message...')">💬</button>
      </div>
    </div>
    <div class="panel-content">
      <div class="panel-section">
        <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${driver.phone}</span></div>
        <div class="info-row"><span class="info-label">Licence</span><span class="info-value">${driver.licence}</span></div>
      </div>
      ${transferPanelHTML}
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Today's Schedule</span>
          ${driver.status !== 'leave' ? `<button class="panel-section-action" onclick="showAddDutyForm('${driver.id}')">+ Add Duty</button>` : ''}
        </div>
        ${editingDuty ? renderEditForm() : ''}
        ${scheduleHTML}
      </div>
      ${suggestionPanelHTML}
    </div>
  `;
}

function renderDriverDetailVehicleCentric(driver) {
  // Simplified view - shows driver info and which vehicles they're assigned to
  let assignmentsHTML = '';
  
  if (driver.status === 'leave') {
    assignmentsHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-red)">On Leave</span></div>`;
  } else if (driver.status === 'available') {
    assignmentsHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-green)">Available - Can be assigned to vehicle duties</span></div>`;
  } else {
    // Find which vehicles this driver is assigned to (group by vehicle)
    const vehicleAssignments = new Map();
    vehicles.forEach((v, vIdx) => {
      v.shifts.forEach(shift => {
        shift.duties.forEach(duty => {
          if (duty.driverId === driver.id || duty.driver === driver.name) {
            if (!vehicleAssignments.has(v.id)) {
              vehicleAssignments.set(v.id, {
                vehicle: v,
                vehicleIdx: vIdx,
                duties: []
              });
            }
            vehicleAssignments.get(v.id).duties.push({
              shiftName: shift.name,
              start: duty.start,
              end: duty.end,
              description: duty.description,
              type: duty.type
            });
          }
        });
      });
    });
    
    if (vehicleAssignments.size > 0) {
      assignmentsHTML = `<div class="duty-list">
        ${Array.from(vehicleAssignments.values()).map(va => {
          const totalHours = va.duties.reduce((sum, d) => sum + (d.end - d.start), 0);
          const minStart = Math.min(...va.duties.map(d => d.start));
          const maxEnd = Math.max(...va.duties.map(d => d.end));
          
          return `
            <div class="vehicle-schedule-item clickable" onclick="navigateToResource('vehicle', ${va.vehicleIdx})">
              <div class="vehicle-schedule-header">
                <span class="vehicle-schedule-time">${formatTime(minStart)}-${formatTime(maxEnd)}</span>
                <span class="vehicle-schedule-badge">${va.vehicle.capacity} SEATS</span>
              </div>
              <div class="vehicle-schedule-driver">
                
                <span class="driver-name">${va.vehicle.rego}</span>
                <span class="nav-arrow">→</span>
              </div>
              <div class="vehicle-schedule-details">
                <span class="detail-item">${va.duties.length} ${va.duties.length === 1 ? 'duty' : 'duties'}</span>
                <span class="detail-item">${formatDutyHours(totalHours)}</span>
                <span class="detail-item">${va.vehicle.rego}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>`;
    } else {
      assignmentsHTML = `<div class="info-row"><span class="info-value" style="color: var(--text-muted)">No vehicle assignments</span></div>`;
    }
  }
  
  // Calculate total hours
  const totalHours = driver.shifts.reduce((sum, s) => 
    sum + s.duties.reduce((dSum, d) => dSum + (d.end - d.start), 0), 0);
  
  return `
    <div class="panel-header">
      <div class="panel-header-info">
        <div class="panel-title">${driver.fullName}</div>
        <div class="panel-subtitle">${driver.id}</div>
      </div>
      <div class="panel-actions">
        <button class="panel-action-btn" onclick="showToast('Calling ${driver.phone}...')">📞</button>
        <button class="panel-action-btn" onclick="showToast('Opening message...')">💬</button>
      </div>
    </div>
    <div class="panel-content">
      <div class="panel-section">
        <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${driver.phone}</span></div>
        <div class="info-row"><span class="info-label">Licence</span><span class="info-value">${driver.licence}</span></div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value" style="color: ${driver.status === 'leave' ? 'var(--accent-red)' : driver.status === 'available' ? 'var(--accent-green)' : 'var(--accent-blue)'}">
            ${driver.status === 'leave' ? 'On Leave' : driver.status === 'available' ? 'Available' : 'Working'}
          </span>
        </div>
        ${totalHours > 0 ? `<div class="info-row"><span class="info-label">Today's Hours</span><span class="info-value">${formatDutyHours(totalHours)}</span></div>` : ''}
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Vehicle Assignments</div>
        ${driver.status === 'working' ? '<div class="panel-section-hint">Click a vehicle to view schedule</div>' : ''}
        ${assignmentsHTML}
      </div>
    </div>
  `;
}

function renderDutyItem(duty, driverId, shiftId, dutyIdx) {
  const dt = DUTY_TYPES[duty.type] || DUTY_TYPES.driving;
  const needsVehicle = VEHICLE_REQUIRED_TYPES.includes(duty.type);
  const isCancelled = duty.cancelled === true;
  
  // Calculate hours for this duty
  const hours = duty.end - duty.start;
  const hoursStr = formatDutyHours(hours);
  
  // Get pay type (default to standard if not set)
  const payType = duty.payType || 'standard';
  
  // Get available vehicles for this duty's time slot
  const availableVehicles = vehicles.filter(v => 
    v.status !== 'maintenance' && 
    isVehicleAvailableForDuty(v.id, duty.start, duty.end, duty.id)
  );
  
  // Vehicle dropdown options
  const vehicleOptions = `
    <option value="">--</option>
    ${availableVehicles.map(v => `
      <option value="${v.id}" ${duty.vehicle === v.id ? 'selected' : ''}>${v.rego}</option>
    `).join('')}
    ${duty.vehicle && !availableVehicles.find(v => v.id === duty.vehicle) ? 
      `<option value="${duty.vehicle}" selected>${duty.vehicle}</option>` : ''}
  `;
  
  // Duty type options (compact)
  const typeOptions = Object.entries(DUTY_TYPES).map(([key, val]) => 
    `<option value="${key}" ${duty.type === key ? 'selected' : ''}>${val.label}</option>`
  ).join('');
  
  // Pay type options
  const payTypeOptions = Object.entries(PAY_TYPES).map(([key, val]) => 
    `<option value="${key}" ${payType === key ? 'selected' : ''}>${val.code}</option>`
  ).join('');
  
  // For cancelled duties, show simplified row with reinstate button
  if (isCancelled) {
    return `
      <div class="duty-item-inline cancelled">
        <div class="duty-type-bar ${duty.type}" style="opacity: 0.4;"></div>
        <div class="duty-inline-content">
          <span class="duty-cancelled-badge">CANCELLED</span>
          <span style="color: var(--text-muted); margin-right: 8px;">${formatTimeCompact(duty.start)} - ${formatTimeCompact(duty.end)}</span>
          <span style="color: var(--text-muted); flex: 1;">${duty.description}${duty.cancelReason ? ` (${duty.cancelReason})` : ''}</span>
          <button class="duty-reinstate-btn" onclick="event.stopPropagation(); reinstateDutyLine('${duty.id}', '${driverId}', '${shiftId}')" title="Reinstate this duty">Reinstate</button>
        </div>
      </div>
    `;
  }
  
  // Active duty - full editing with cancel button
  return `
    <div class="duty-item-inline">
      <div class="duty-insert-arrows">
        <button class="duty-insert-btn" onclick="event.stopPropagation(); insertDuty('${driverId}', '${shiftId}', ${dutyIdx}, 'above')" title="Insert duty above">+</button>
        <button class="duty-insert-btn" onclick="event.stopPropagation(); insertDuty('${driverId}', '${shiftId}', ${dutyIdx}, 'below')" title="Insert duty below">+</button>
      </div>
      <div class="duty-type-bar ${duty.type}"></div>
      <div class="duty-inline-content">
        <input type="text" class="duty-inline-time" value="${formatTimeCompact(duty.start)}" 
               onchange="updateDutyTime('${driverId}', '${shiftId}', ${dutyIdx}, 'start', this.value)"
               title="Start time">
        <span class="duty-time-sep">-</span>
        <input type="text" class="duty-inline-time" value="${formatTimeCompact(duty.end)}" 
               onchange="updateDutyTime('${driverId}', '${shiftId}', ${dutyIdx}, 'end', this.value)"
               title="End time">
        <select class="duty-inline-select type" onchange="updateDutyType('${driverId}', '${shiftId}', ${dutyIdx}, this.value)" title="Duty type">
          ${typeOptions}
        </select>
        <input type="text" class="duty-inline-desc" value="${duty.description}" 
               onchange="updateDutyDesc('${driverId}', '${shiftId}', ${dutyIdx}, this.value)"
               placeholder="Description..." title="Description">
        <div class="duty-inline-location-wrapper">
          <input type="text" class="duty-inline-location" 
                 id="dutyLoc_${driverId}_${shiftId}_${dutyIdx}"
                 value="${duty.locationName || ''}" 
                 oninput="onLocationInput('dutyLoc_${driverId}_${shiftId}_${dutyIdx}')"
                 onblur="setTimeout(() => saveDutyLocation('${driverId}', '${shiftId}', ${dutyIdx}), 200)"
                 placeholder="Location..." title="Location (for smart assignment)">
          <input type="hidden" id="dutyLoc_${driverId}_${shiftId}_${dutyIdx}Lat" value="${duty.locationLat || ''}">
          <input type="hidden" id="dutyLoc_${driverId}_${shiftId}_${dutyIdx}Lng" value="${duty.locationLng || ''}">
        </div>
        <select class="duty-inline-select vehicle ${!duty.vehicle && needsVehicle ? 'missing' : ''}" 
                onchange="updateDutyVehicle('${driverId}', '${shiftId}', ${dutyIdx}, this.value)" title="Vehicle">
          ${vehicleOptions}
        </select>
        <select class="duty-inline-select pay" onchange="updateDutyPayType('${driverId}', '${shiftId}', ${dutyIdx}, this.value)" title="Pay type">
          ${payTypeOptions}
        </select>
        <span class="duty-inline-hours">${hoursStr}</span>
        <button class="duty-cancel-btn" onclick="event.stopPropagation(); openCancelDutyModal('${duty.id}', '${driverId}', '${shiftId}', ${dutyIdx})" title="Cancel duty">✕</button>
      </div>
    </div>
  `;
}

function formatTimeCompact(time) {
  const h = Math.floor(time);
  const m = Math.round((time - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function updateDutyTime(driverId, shiftId, dutyIdx, field, value) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  const newTime = parseTime(value);
  
  if (isNaN(newTime)) {
    showToast('Invalid time format', 'error');
    renderDetailPanel();
    return;
  }
  
  const oldVehicle = duty.vehicle;
  const newStart = field === 'start' ? newTime : duty.start;
  const newEnd = field === 'end' ? newTime : duty.end;
  
  if (newStart >= newEnd) {
    showToast('End must be after start', 'error');
    renderDetailPanel();
    return;
  }
  
  // Check for overlaps with other duties in THIS shift
  const overlapInShift = shift.duties.find((d, i) => {
    if (i === dutyIdx) return false;
    return newStart < d.end && newEnd > d.start;
  });
  
  if (overlapInShift) {
    showToast(`Overlaps with ${formatTime(overlapInShift.start)}-${formatTime(overlapInShift.end)}`, 'error');
    renderDetailPanel();
    return;
  }
  
  // Check for overlaps with OTHER shifts for this driver
  const overlapOtherShift = driver.shifts.find(s => {
    if (s.id === shiftId) return false; // Skip current shift
    // Check if new time range overlaps with this shift's time range
    return newStart < s.end && newEnd > s.start;
  });
  
  if (overlapOtherShift) {
    showToast(`Overlaps with ${overlapOtherShift.name || 'another shift'} (${formatTime(overlapOtherShift.start)}-${formatTime(overlapOtherShift.end)})`, 'error');
    renderDetailPanel();
    return;
  }
  
  // Check vehicle availability if vehicle assigned
  if (duty.vehicle && !isVehicleAvailableForDuty(duty.vehicle, newStart, newEnd, duty.id)) {
    showToast(`${duty.vehicle} not available for new time`, 'error');
    renderDetailPanel();
    return;
  }
  
  // Call API in real mode
  if (dataSource === 'real' && duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-')) {
    try {
      const body = { duty_line_id: duty.id };
      if (field === 'start') body.start_time = newTime;
      if (field === 'end') body.end_time = newTime;
      
      const result = await apiRequest('/dispatch/update-duty-line', {
        method: 'POST',
        body
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        renderDetailPanel();
        return;
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      renderDetailPanel();
      return;
    }
  }
  
  // Update the duty
  if (oldVehicle) unsyncVehicleSchedule(oldVehicle, duty.id);
  duty[field] = newTime;
  if (duty.vehicle) syncVehicleSchedule(duty.vehicle, duty, driver, shift);
  
  // Update shift bounds if needed
  updateShiftBounds(shift);
  
  renderDetailPanel();
  renderAll();
}

async function updateDutyDesc(driverId, shiftId, dutyIdx, value) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  
  // Call API in real mode
  if (dataSource === 'real' && duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-')) {
    try {
      const result = await apiRequest('/dispatch/update-duty-line', {
        method: 'POST',
        body: {
          duty_line_id: duty.id,
          description: value
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      return;
    }
  }
  
  duty.description = value;
  
  // Sync to vehicle if assigned
  if (duty.vehicle) {
    syncVehicleSchedule(duty.vehicle, duty, driver, shift);
  }
}

async function updateDutyLocation(driverId, shiftId, dutyIdx, locationName, locationLat, locationLng) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  
  // Call API in real mode
  if (dataSource === 'real' && duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-')) {
    try {
      const result = await apiRequest('/dispatch/update-duty-line', {
        method: 'POST',
        body: {
          duty_line_id: duty.id,
          location_name: locationName || null,
          location_lat: locationLat || null,
          location_lng: locationLng || null
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      return;
    }
  }
  
  // Update local duty
  duty.locationName = locationName;
  duty.locationLat = locationLat;
  duty.locationLng = locationLng;
  
  showToast('Location updated');
}

// Wrapper for inline location input - reads from DOM and calls updateDutyLocation
function saveDutyLocation(driverId, shiftId, dutyIdx) {
  const inputId = `dutyLoc_${driverId}_${shiftId}_${dutyIdx}`;
  const nameInput = document.getElementById(inputId);
  const latInput = document.getElementById(inputId + 'Lat');
  const lngInput = document.getElementById(inputId + 'Lng');
  
  if (!nameInput) return;
  
  const locationName = nameInput.value || null;
  const locationLat = parseFloat(latInput?.value) || null;
  const locationLng = parseFloat(lngInput?.value) || null;
  
  updateDutyLocation(driverId, shiftId, dutyIdx, locationName, locationLat, locationLng);
}

async function updateDutyType(driverId, shiftId, dutyIdx, value) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  const oldVehicle = duty.vehicle;
  
  // Map frontend type to backend type
  const backendTypeMap = {
    'driving': 'DRIVE',
    'oov': 'OOV',
    'break': 'BREAK',
    'waiting': 'WAIT',
    'dead': 'DEAD',
    'charter': 'CHARTER'
  };
  
  // Call API in real mode
  if (dataSource === 'real' && duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-')) {
    try {
      const result = await apiRequest('/dispatch/update-duty-line', {
        method: 'POST',
        body: {
          duty_line_id: duty.id,
          duty_type: backendTypeMap[value] || value
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      return;
    }
  }
  
  duty.type = value;
  
  // Re-sync if vehicle assigned
  if (oldVehicle) {
    syncVehicleSchedule(oldVehicle, duty, driver, shift);
  }
  
  renderDetailPanel();
  renderAll();
  showToast(`Type changed to ${DUTY_TYPES[value]?.label || value}`);
}

async function updateDutyVehicle(driverId, shiftId, dutyIdx, value) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  const oldVehicle = duty.vehicle;
  const newVehicle = value || null;
  const newVehicleObj = newVehicle ? vehicles.find(v => v.id === newVehicle) : null;
  
  // Check availability
  if (newVehicle && !isVehicleAvailableForDuty(newVehicle, duty.start, duty.end, duty.id)) {
    showToast(`${newVehicleObj?.rego || newVehicle} not available`, 'error');
    renderDetailPanel();
    return;
  }
  
  // Call API in real mode
  if (dataSource === 'real' && duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-')) {
    try {
      let result;
      
      // If duty is from template, create a new roster duty line
      if (duty.isTemplate && shift.entryId) {
        result = await apiRequest('/dispatch/create-duty-line', {
          method: 'POST',
          body: {
            roster_entry_id: shift.entryId,
            start_time: duty.start,
            end_time: duty.end,
            duty_type: duty.type,
            description: duty.description,
            vehicle_id: newVehicle,
            pay_type: duty.payType || 'STD'
          }
        });
        // Update duty ID if new one was created
        if (result.data?.id) {
          duty.id = result.data.id;
          duty.isTemplate = false;
        }
      } else {
        result = await apiRequest('/dispatch/update-duty-line', {
          method: 'POST',
          body: {
            duty_line_id: duty.id,
            vehicle_id: newVehicle
          }
        });
      }
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      return;
    }
  }
  
  // Unsync old vehicle
  if (oldVehicle) {
    unsyncVehicleSchedule(oldVehicle, duty.id);
  }
  
  duty.vehicle = newVehicle;
  duty.vehicleId = newVehicle;
  
  // Sync new vehicle
  if (newVehicle) {
    syncVehicleSchedule(newVehicle, duty, driver, shift);
  }
  
  renderDetailPanel();
  renderAll();
  showToast(newVehicle ? `Vehicle set to ${newVehicleObj?.rego || newVehicle}` : 'Vehicle removed');
}

function formatDutyHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

async function updateDutyPayType(driverId, shiftId, dutyIdx, payType) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  
  // Call API in real mode
  if (dataSource === 'real' && duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-')) {
    try {
      const result = await apiRequest('/dispatch/update-duty-line', {
        method: 'POST',
        body: {
          duty_line_id: duty.id,
          pay_type: payType
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
      return;
    }
  }
  
  duty.payType = payType;
  showToast(`Pay type updated to ${PAY_TYPES[payType]?.label || payType}`);
}

async function bulkUpdatePayType(driverId, shiftId, payType) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  // Call API for each duty in real mode
  if (dataSource === 'real') {
    try {
      const promises = shift.duties
        .filter(duty => duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-'))
        .map(duty => apiRequest('/dispatch/update-duty-line', {
          method: 'POST',
          body: {
            duty_line_id: duty.id,
            pay_type: payType
          }
        }));
      
      await Promise.all(promises);
    } catch (err) {
      showToast(err.message || 'Bulk update failed', 'error');
      return;
    }
  }
  
  shift.duties.forEach(duty => {
    duty.payType = payType;
  });
  
  renderDetailPanel();
  showToast(`All duties updated to ${PAY_TYPES[payType]?.label || payType}`);
}

async function insertDuty(driverId, shiftId, dutyIdx, position) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  // Helper to check if a time range overlaps with other shifts
  const wouldOverlapOtherShift = (start, end) => {
    return driver.shifts.some(s => {
      if (s.id === shiftId) return false;
      return start < s.end && end > s.start;
    });
  };
  
  const refDuty = shift.duties[dutyIdx];
  let newStart, newEnd;
  let extendedShift = false;
  
  if (position === 'above') {
    // Insert before this duty
    if (dutyIdx === 0) {
      // First duty - check if there's a gap before it
      const gapBefore = refDuty.start - shift.start;
      if (gapBefore >= 0.25) {
        // There's a gap - use it
        newStart = shift.start;
        newEnd = refDuty.start;
      } else {
        // No gap - try to extend shift backwards by 30 min from the duty's start
        const extension = 0.5;
        // Use the earlier of shift.start or refDuty.start as the base for extension
        const baseStart = Math.min(shift.start, refDuty.start);
        const newShiftStart = Math.max(5, baseStart - extension);
        
        // Check if extension would overlap with another shift
        if (wouldOverlapOtherShift(newShiftStart, shift.end)) {
          showToast('Cannot extend - would overlap with another shift', 'error');
          return;
        }
        
        if (newShiftStart < refDuty.start) {
          shift.start = newShiftStart;
          newStart = shift.start;
          newEnd = refDuty.start;
          extendedShift = true;
        } else {
          // Can't extend further (already at 05:00)
          showToast('Cannot extend shift before 05:00', 'error');
          return;
        }
      }
    } else {
      // Between previous duty and this one
      const prevDuty = shift.duties[dutyIdx - 1];
      newStart = prevDuty.end;
      newEnd = refDuty.start;
      
      if (newEnd <= newStart) {
        showToast('No gap between duties', 'error');
        return;
      }
    }
  } else {
    // Insert after this duty
    if (dutyIdx === shift.duties.length - 1) {
      // Last duty - check if there's a gap after it
      const gapAfter = shift.end - refDuty.end;
      if (gapAfter >= 0.25) {
        // There's a gap - use it
        newStart = refDuty.end;
        newEnd = shift.end;
      } else {
        // No gap - try to extend shift forward by 30 min from the duty's end
        const extension = 0.5;
        // Use the later of shift.end or refDuty.end as the base for extension
        const baseEnd = Math.max(shift.end, refDuty.end);
        const newShiftEnd = Math.min(24, baseEnd + extension);
        
        // Check if extension would overlap with another shift
        if (wouldOverlapOtherShift(shift.start, newShiftEnd)) {
          showToast('Cannot extend - would overlap with another shift', 'error');
          return;
        }
        
        if (newShiftEnd > refDuty.end) {
          shift.end = newShiftEnd;
          newStart = refDuty.end;
          newEnd = shift.end;
          extendedShift = true;
        } else {
          // Can't extend further (already at 24:00)
          showToast('Cannot extend shift past 24:00', 'error');
          return;
        }
      }
    } else {
      // Between this duty and next one
      const nextDuty = shift.duties[dutyIdx + 1];
      newStart = refDuty.end;
      newEnd = nextDuty.start;
      
      if (newEnd <= newStart) {
        showToast('No gap between duties', 'error');
        return;
      }
    }
  }
  
  // Final validation: ensure end time is after start time
  // This catches edge cases like overnight shifts or corrupted data
  if (newEnd <= newStart) {
    // Default to 30 min duration from start
    newEnd = Math.min(24, newStart + 0.5);
    
    // If still invalid (start is already at or past 24), show error
    if (newEnd <= newStart) {
      showToast('Cannot add duty - invalid time range', 'error');
      return;
    }
  }
  
  // Create new duty object
  let newDutyId = `d-${Date.now()}`;
  const newDuty = {
    id: newDutyId,
    type: 'oov', // Default to OOV since it doesn't require vehicle
    start: newStart,
    end: newEnd,
    description: 'New duty',
    vehicle: null,
    vehicleId: null,
    payType: 'STD',
    locationName: null,
    locationLat: null,
    locationLng: null
  };
  
  // Call API in real mode if we have an entry ID
  if (dataSource === 'real' && shift.entryId) {
    try {
      const result = await apiRequest('/dispatch/create-duty-line', {
        method: 'POST',
        body: {
          roster_entry_id: shift.entryId,
          start_time: newStart,
          end_time: newEnd,
          duty_type: 'oov',
          description: 'New duty',
          pay_type: 'STD'
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      
      // Use the real ID from the API
      newDuty.id = result.duty_line_id;
      newDutyId = result.duty_line_id;
    } catch (err) {
      showToast(err.message || 'Failed to create duty', 'error');
      return;
    }
  }
  
  // Insert at correct position
  const insertIdx = position === 'above' ? dutyIdx : dutyIdx + 1;
  shift.duties.splice(insertIdx, 0, newDuty);
  
  // Update driver status if they were available
  if (driver.status === 'available') {
    driver.status = 'working';
  }
  
  if (extendedShift) {
    showToast('Shift extended - duty added');
  } else {
    showToast('Duty added');
  }
  
  renderDetailPanel();
  renderAll();
}

function calculateShiftTotals(shift) {
  const totals = {
    total: 0,
    byType: {}
  };
  
  // Only count active (non-cancelled) duties
  shift.duties.filter(d => !d.cancelled).forEach(duty => {
    const hours = duty.end - duty.start;
    totals.total += hours;
    
    if (!totals.byType[duty.type]) {
      totals.byType[duty.type] = 0;
    }
    totals.byType[duty.type] += hours;
  });
  
  return totals;
}

function renderShiftTotals(shift, driverId) {
  const totals = calculateShiftTotals(shift);
  
  // Build breakdown by type
  const breakdownHTML = Object.entries(totals.byType).map(([type, hours]) => {
    const dt = DUTY_TYPES[type] || { label: type };
    return `
      <div class="shift-total-item">
        <div class="shift-total-dot ${type}"></div>
        <span>${dt.label}: ${formatDutyHours(hours)}</span>
      </div>
    `;
  }).join('');
  
  // Pay type bulk assign options
  const payTypeOptions = Object.entries(PAY_TYPES).map(([key, val]) => 
    `<option value="${key}">${val.label}</option>`
  ).join('');
  
  return `
    <div class="shift-totals">
      <div>
        <span class="shift-totals-label">Total Hours:</span>
        <span class="shift-totals-value">${formatDutyHours(totals.total)}</span>
      </div>
      <div class="shift-totals-breakdown">${breakdownHTML}</div>
      <div>
        <select class="duty-pay-select" onchange="if(this.value) bulkUpdatePayType('${driverId}', '${shift.id}', this.value); this.value='';" title="Set all duties to this pay type">
          <option value="">Bulk Pay...</option>
          ${payTypeOptions}
        </select>
      </div>
    </div>
  `;
}

function renderEditForm() {
  if (!editingDuty) return '';
  
  // If this is a vehicle-centric edit, use the vehicle edit form
  if (editingDuty.isVehicleCentric) {
    return renderVehicleEditForm();
  }
  
  const duty = editingDuty.duty;
  const shift = editingDuty.shift;
  const isNew = editingDuty.isNew;
  const isAdhoc = editingDuty.isAdhoc;
  const needsVehicle = VEHICLE_REQUIRED_TYPES.includes(duty.type);
  
  // Use allSlots for adhoc, or find slots within shift for existing shifts
  const availableSlots = isNew ? (editingDuty.allSlots || (shift ? findAvailableSlots(shift.duties, shift.start, shift.end) : [])) : [];
  
  const availableVehicles = getAvailableVehiclesForPeriod(duty.start, duty.end);
  
  const currentVehicle = duty.vehicle;
  const vehicleOptions = [...availableVehicles];
  if (currentVehicle && !vehicleOptions.find(v => v.id === currentVehicle)) {
    const existingVehicle = vehicles.find(v => v.id === currentVehicle);
    if (existingVehicle) vehicleOptions.unshift(existingVehicle);
  }
  
  const hasErrors = Object.keys(formErrors).length > 0;
  
  // Check if duty will extend shift bounds
  let shiftExtensionHint = '';
  if (shift && !isAdhoc) {
    const willExtendStart = duty.start < shift.start;
    const willExtendEnd = duty.end > shift.end;
    if (willExtendStart && willExtendEnd) {
      shiftExtensionHint = `ℹ️ Shift will extend from ${formatTime(shift.start)}-${formatTime(shift.end)} to ${formatTime(duty.start)}-${formatTime(duty.end)}`;
    } else if (willExtendStart) {
      shiftExtensionHint = `ℹ️ Shift start will extend from ${formatTime(shift.start)} to ${formatTime(duty.start)}`;
    } else if (willExtendEnd) {
      shiftExtensionHint = `ℹ️ Shift end will extend from ${formatTime(shift.end)} to ${formatTime(duty.end)}`;
    }
  }
  
  return `
    <div class="edit-form">
      <div class="edit-form-title">
        ${isNew ? (isAdhoc ? '➕ Add Adhoc Duty' : '➕ Add New Duty') : '✏️ Edit Duty'}
        ${isAdhoc ? '<span style="font-size: 10px; color: var(--accent-amber); margin-left: 8px;">(Creates new shift)</span>' : ''}
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start Time</label>
          <input type="text" class="form-input ${formErrors.time || formErrors.overlap ? 'error' : ''}" 
                 id="editStart" value="${formatTime(duty.start)}" 
                 placeholder="HH:MM" maxlength="5"
                 oninput="formatTimeInput(this)" onchange="onFormChange()">
        </div>
        <div class="form-group">
          <label class="form-label">End Time</label>
          <input type="text" class="form-input ${formErrors.time || formErrors.overlap ? 'error' : ''}" 
                 id="editEnd" value="${formatTime(duty.end)}" 
                 placeholder="HH:MM" maxlength="5"
                 oninput="formatTimeInput(this)" onchange="onFormChange()">
        </div>
      </div>
      
      ${formErrors.time ? `<div class="form-error">⚠️ ${formErrors.time}</div>` : ''}
      ${formErrors.overlap ? `<div class="form-error">⚠️ ${formErrors.overlap}</div>` : ''}
      ${shiftExtensionHint ? `<div class="form-hint" style="color: var(--accent-blue);">${shiftExtensionHint}</div>` : ''}
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Duty Type</label>
          <select class="form-select" id="editType" onchange="onFormChange()">
            ${Object.entries(DUTY_TYPES).map(([k, v]) => `
              <option value="${k}" ${duty.type === k ? 'selected' : ''}>${v.label} - ${v.name}</option>
            `).join('')}
          </select>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Description</label>
          <input type="text" class="form-input" id="editDesc" value="${duty.description}" placeholder="Enter description...">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Location <span style="font-size: 10px; color: var(--text-muted);">(optional - for smart assignment)</span></label>
          <div class="location-input-wrapper">
            <input type="text" class="form-input" id="editLocation" 
                   value="${duty.locationName || ''}" 
                   placeholder="Start typing to search or enter free text..."
                   oninput="onLocationInput('editLocation')"
                   onfocus="onLocationInput('editLocation')">
            <input type="hidden" id="editLocationLat" value="${duty.locationLat || ''}">
            <input type="hidden" id="editLocationLng" value="${duty.locationLng || ''}">
          </div>
          ${duty.locationLat && duty.locationLng ? 
            `<div class="location-coords">📍 ${Number(duty.locationLat).toFixed(4)}, ${Number(duty.locationLng).toFixed(4)}</div>` : 
            ''}
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">
            Vehicle ${needsVehicle ? '<span class="required">*</span>' : ''}
          </label>
          <select class="form-select ${formErrors.vehicle ? 'error' : ''}" id="editVehicle" onchange="onFormChange()">
            <option value="">-- No Vehicle --</option>
            ${vehicleOptions.map(v => `
              <option value="${v.id}" ${duty.vehicle === v.id ? 'selected' : ''}>${v.rego} (${v.capacity} seats)</option>
            `).join('')}
          </select>
          ${vehicleOptions.length === 0 && needsVehicle ? 
            `<div class="form-hint">No vehicles available for this time period</div>` : 
            `<div class="form-hint">${vehicleOptions.length} vehicle(s) available for ${formatTime(duty.start)}-${formatTime(duty.end)}</div>`
          }
        </div>
      </div>
      
      ${formErrors.vehicle ? `<div class="form-error">⚠️ ${formErrors.vehicle}</div>` : ''}
      
      ${isNew && availableSlots.length > 0 ? `
        <div class="available-slots">
          <div class="available-slots-label">📍 Available time slots:</div>
          <div class="slot-chips">
            ${availableSlots.map(s => `
              <span class="slot-chip" onclick="fillSlot(${s.start}, ${s.end})">${formatTime(s.start)} - ${formatTime(s.end)}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <div class="form-actions">
        <button class="form-btn cancel" onclick="cancelEdit()">Cancel</button>
        <button class="form-btn save" id="saveBtn" onclick="saveEdit()" ${hasErrors ? 'disabled' : ''}>
          ${isNew ? (isAdhoc ? 'Create Adhoc' : 'Add Duty') : 'Save Changes'}
        </button>
      </div>
    </div>
  `;
}

function renderVehicleDetail(vehicle) {
  if (allocationMode === 'vehicle') {
    return renderVehicleDetailVehicleCentric(vehicle);
  }
  return renderVehicleDetailDriverCentric(vehicle);
}

function renderVehicleDetailDriverCentric(vehicle) {
  let blocksHTML = '';
  if (vehicle.status === 'maintenance') {
    blocksHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-amber)">In Maintenance</span></div>`;
  } else if (!vehicle.shifts || vehicle.shifts.length === 0 || vehicle.shifts.every(s => s.type === 'maintenance')) {
    blocksHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-green)">Available All Day</span></div>`;
  } else {
    // Display synced shifts from driver assignments
    const workShifts = vehicle.shifts.filter(s => s.type !== 'maintenance');
    
    blocksHTML = `<div class="duty-list">
      ${workShifts.map(shift => {
        // Find the driver index for navigation
        const driverIdx = shift.syncedDriverId 
          ? drivers.findIndex(d => d.id === shift.syncedDriverId)
          : -1;
        const driver = driverIdx >= 0 ? drivers[driverIdx] : null;
        const driverName = driver?.name || shift.duties[0]?.driver || 'Unknown';
        const shiftName = shift.name || 'Assignment';
        const isClickable = driverIdx >= 0;
        const shiftTypeIcon = shift.shiftType === 'charter' ? '🎫' : '🚌';
        
        // Calculate total hours for this shift
        const totalHours = shift.duties.reduce((sum, d) => sum + (d.end - d.start), 0);
        
        return `
          <div class="vehicle-schedule-item ${isClickable ? 'clickable' : ''}" ${isClickable ? `onclick="navigateToResource('driver', ${driverIdx})"` : ''}>
            <div class="vehicle-schedule-header">
              <span class="vehicle-schedule-time">${formatTime(shift.start)}-${formatTime(shift.end)}</span>
              <span class="vehicle-schedule-badge ${shift.shiftType || 'shift'}">${shiftTypeIcon} ${shiftName}</span>
            </div>
            <div class="vehicle-schedule-driver">
              
              <span class="driver-name">${driverName}</span>
              ${isClickable ? '<span class="nav-arrow">→</span>' : ''}
            </div>
            <div class="vehicle-schedule-details">
              <span class="detail-item">${shift.duties.length} ${shift.duties.length === 1 ? 'duty' : 'duties'}</span>
              <span class="detail-item">${formatDutyHours(totalHours)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>`;
  }
  
  // Calculate utilization
  const workShifts = vehicle.shifts?.filter(s => s.type !== 'maintenance') || [];
  const totalHours = workShifts.reduce((sum, s) => 
    sum + s.duties.reduce((dSum, d) => dSum + (d.end - d.start), 0), 0);
  const hasClickableShifts = workShifts.some(s => s.syncedDriverId && drivers.findIndex(d => d.id === s.syncedDriverId) >= 0);
  
  return `
    <div class="panel-header">
      <div class="panel-header-info">
        <div class="panel-title">${vehicle.rego}</div>
        <div class="panel-subtitle">${vehicle.capacity} seats</div>
      </div>
    </div>
    <div class="panel-content">
      <div class="panel-section">
        <div class="info-row"><span class="info-label">Rego</span><span class="info-value">${vehicle.rego}</span></div>
        <div class="info-row"><span class="info-label">Capacity</span><span class="info-value">${vehicle.capacity} seats</span></div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value" style="color: ${vehicle.status === 'maintenance' ? 'var(--accent-amber)' : vehicle.status === 'available' ? 'var(--accent-green)' : 'var(--accent-blue)'}">
            ${vehicle.status === 'maintenance' ? 'Maintenance' : vehicle.status === 'available' ? 'Available' : 'In Use'}
          </span>
        </div>
        ${totalHours > 0 ? `<div class="info-row"><span class="info-label">Today's Hours</span><span class="info-value">${formatDutyHours(totalHours)}</span></div>` : ''}
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Today's Schedule</div>
        ${hasClickableShifts ? '<div class="panel-section-hint">Click a shift to view driver</div>' : ''}
        ${blocksHTML}
      </div>
    </div>
  `;
}

function renderVehicleDetailVehicleCentric(vehicle) {
  let scheduleHTML = '';
  
  // Check if we're in transfer mode for vehicles
  let transferPanelHTML = '';
  if (transferringShift && transferringShift.type === 'vehicle') {
    const shift = transferringShift.shift;
    
    transferPanelHTML = `
      <div class="panel-section" style="background: rgba(59, 130, 246, 0.1); border: 1px solid var(--accent-blue); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div class="panel-section-title" style="color: var(--accent-blue);">Transfer: ${shift.name}</div>
        <div class="info-row"><span class="info-label">Time</span><span class="info-value">${formatTime(shift.start)} - ${formatTime(shift.end)}</span></div>
        <div class="assignment-panel">
          <div class="assignment-search">
            <input type="text" class="assignment-search-input" id="transferVehicleSearch" 
                   placeholder="Search vehicles..." oninput="updateTransferVehicleList()">
          </div>
          <div class="assignment-count" id="transferVehicleCount"></div>
          <div class="assignment-list" id="transferVehicleList"></div>
        </div>
        <button class="transfer-cancel-btn" onclick="cancelTransfer()">Cancel Transfer</button>
      </div>
    `;
  }
  
  // Check for smart suggestions
  const vehicleIndex = vehicles.indexOf(vehicle);
  const endingInfo = getVehicleEndingInfo(vehicle);
  const suggestionPanelHTML = renderSuggestionPanel(endingInfo, 'vehicle', vehicleIndex);
  
  if (vehicle.status === 'maintenance') {
    scheduleHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-amber)">In Maintenance</span></div>`;
  } else if (!vehicle.shifts || vehicle.shifts.length === 0) {
    scheduleHTML = `<div class="info-row"><span class="info-value" style="color: var(--accent-green)">Available All Day</span></div>`;
  } else {
    scheduleHTML = vehicle.shifts.filter(s => s.type !== 'maintenance').map((shift, shiftIdx) => {
      const driverStatus = getShiftDriverStatus(shift);
      const actualIdx = vehicle.shifts.indexOf(shift);
      return `
        <div class="shift-block">
          <div class="shift-block-header">
            <div class="shift-block-title">${shift.name}</div>
            <div class="shift-block-meta">
              <span class="shift-vehicle-status ${driverStatus.status}">${driverStatus.label}</span>
              <span class="shift-block-time">${formatTime(shift.start)}-${formatTime(shift.end)}</span>
            </div>
          </div>
          <div class="shift-block-actions">
            ${driverStatus.status !== 'complete' ? `<button class="shift-action-btn primary" onclick="showBulkAssignDriver('${vehicle.id}', '${shift.id}')" title="Assign driver to all unassigned duties">Assign All</button>` : ''}
            <button class="shift-action-btn" onclick="showTransferVehicleShift('${vehicle.id}', ${actualIdx})" title="Transfer to another vehicle">Transfer</button>
            <button class="shift-action-btn danger" onclick="unassignVehicleShift('${vehicle.id}', ${actualIdx})" title="Remove and move to unassigned">Unassign</button>
          </div>
          ${bulkAssigning && bulkAssigning.type === 'driver' && bulkAssigning.vehicleId === vehicle.id && bulkAssigning.shiftId === shift.id ? renderBulkAssignDriverPanel() : ''}
          <div class="shift-block-content">
            <div class="duty-list-header">
              <span class="duty-header-time">Start</span>
              <span class="duty-header-sep"></span>
              <span class="duty-header-time">End</span>
              <span class="duty-header-type">Type</span>
              <span class="duty-header-desc">Desc</span>
              <span class="duty-header-vehicle">Driver</span>
              <span class="duty-header-pay">Pay</span>
              <span class="duty-header-hours">Hours</span>
              <span class="duty-header-actions"></span>
            </div>
            <div class="duty-list">
              ${shift.duties.map((duty, idx) => renderVehicleDutyItem(duty, vehicle.id, shift.id, idx)).join('')}
            </div>
            ${renderVehicleShiftTotals(shift, vehicle.id)}
          </div>
        </div>
      `;
    }).join('');
  }
  
  return `
    <div class="panel-header">
      <div class="panel-header-info">
        <div class="panel-title">${vehicle.rego}</div>
        <div class="panel-subtitle">${vehicle.capacity} seats</div>
      </div>
    </div>
    <div class="panel-content">
      <div class="panel-section">
        <div class="info-row"><span class="info-label">Rego</span><span class="info-value">${vehicle.rego}</span></div>
        <div class="info-row">
          <span class="info-label">Status</span>
          <span class="info-value" style="color: ${vehicle.status === 'maintenance' ? 'var(--accent-amber)' : vehicle.status === 'available' ? 'var(--accent-green)' : 'var(--accent-blue)'}">
            ${vehicle.status === 'maintenance' ? 'Maintenance' : vehicle.status === 'available' ? 'Available' : 'In Use'}
          </span>
        </div>
      </div>
      ${transferPanelHTML}
      <div class="panel-section">
        <div class="panel-section-header">
          <span class="panel-section-title">Today's Schedule</span>
          ${vehicle.status !== 'maintenance' ? `<button class="panel-section-action" onclick="showAddVehicleDutyForm('${vehicle.id}')">+ Add Duty</button>` : ''}
        </div>
        ${editingDuty ? renderVehicleEditForm() : ''}
        ${scheduleHTML}
      </div>
      ${suggestionPanelHTML}
    </div>
  `;
}

function getShiftDriverStatus(shift) {
  const drivingDuties = shift.duties.filter(d => DRIVER_REQUIRED_TYPES.includes(d.type));
  if (drivingDuties.length === 0) return { status: 'complete', label: 'N/A' };
  
  const withDriver = drivingDuties.filter(d => d.driver || d.driverId);
  if (withDriver.length === drivingDuties.length) return { status: 'complete', label: 'All assigned' };
  if (withDriver.length === 0) return { status: 'none', label: 'No drivers' };
  return { status: 'partial', label: `${withDriver.length}/${drivingDuties.length} assigned` };
}

function renderVehicleDutyItem(duty, vehicleId, shiftId, dutyIdx) {
  const dt = DUTY_TYPES[duty.type] || DUTY_TYPES.driving;
  const needsDriver = DRIVER_REQUIRED_TYPES.includes(duty.type);
  const hasDriver = duty.driver || duty.driverId;
  
  // Calculate hours for this duty
  const hours = duty.end - duty.start;
  const hoursStr = formatDutyHours(hours);
  
  // Get pay type (default to standard if not set)
  const payType = duty.payType || 'standard';
  
  // Get available drivers for this duty's time slot
  const availableDrivers = drivers.filter(d => 
    d.status !== 'leave' && 
    isDriverAvailableForDuty(d.id, duty.start, duty.end, duty.id)
  );
  
  // Find current driver ID (could be in driverId or we need to look up from driver name)
  let currentDriverId = duty.driverId;
  if (!currentDriverId && duty.driver) {
    const driverObj = drivers.find(d => d.name === duty.driver);
    currentDriverId = driverObj ? driverObj.id : null;
  }
  
  // Driver dropdown options
  const driverOptions = `
    <option value="">--</option>
    ${availableDrivers.map(d => `
      <option value="${d.id}" ${currentDriverId === d.id ? 'selected' : ''}>${d.name}</option>
    `).join('')}
    ${currentDriverId && !availableDrivers.find(d => d.id === currentDriverId) ? 
      `<option value="${currentDriverId}" selected>${duty.driver || currentDriverId}</option>` : ''}
  `;
  
  // Duty type options (compact)
  const typeOptions = Object.entries(DUTY_TYPES).map(([key, val]) => 
    `<option value="${key}" ${duty.type === key ? 'selected' : ''}>${val.label}</option>`
  ).join('');
  
  // Pay type options
  const payTypeOptions = Object.entries(PAY_TYPES).map(([key, val]) => 
    `<option value="${key}" ${payType === key ? 'selected' : ''}>${val.code}</option>`
  ).join('');
  
  return `
    <div class="duty-item-inline">
      <div class="duty-insert-arrows">
        <button class="duty-insert-btn" onclick="event.stopPropagation(); insertVehicleDuty('${vehicleId}', '${shiftId}', ${dutyIdx}, 'above')" title="Insert duty above">+</button>
        <button class="duty-insert-btn" onclick="event.stopPropagation(); insertVehicleDuty('${vehicleId}', '${shiftId}', ${dutyIdx}, 'below')" title="Insert duty below">+</button>
      </div>
      <div class="duty-type-bar ${duty.type}"></div>
      <div class="duty-inline-content">
        <input type="text" class="duty-inline-time" value="${formatTimeCompact(duty.start)}" 
               onchange="updateVehicleDutyTime('${vehicleId}', '${shiftId}', ${dutyIdx}, 'start', this.value)"
               title="Start time">
        <span class="duty-time-sep">-</span>
        <input type="text" class="duty-inline-time" value="${formatTimeCompact(duty.end)}" 
               onchange="updateVehicleDutyTime('${vehicleId}', '${shiftId}', ${dutyIdx}, 'end', this.value)"
               title="End time">
        <select class="duty-inline-select type" onchange="updateVehicleDutyType('${vehicleId}', '${shiftId}', ${dutyIdx}, this.value)" title="Duty type">
          ${typeOptions}
        </select>
        <input type="text" class="duty-inline-desc" value="${duty.description}" 
               onchange="updateVehicleDutyDesc('${vehicleId}', '${shiftId}', ${dutyIdx}, this.value)"
               placeholder="Description..." title="Description">
        <select class="duty-inline-select vehicle ${!hasDriver && needsDriver ? 'missing' : ''}" 
                onchange="updateVehicleDutyDriver('${vehicleId}', '${shiftId}', ${dutyIdx}, this.value)" title="Driver">
          ${driverOptions}
        </select>
        <select class="duty-inline-select pay" onchange="updateVehicleDutyPayType('${vehicleId}', '${shiftId}', ${dutyIdx}, this.value)" title="Pay type">
          ${payTypeOptions}
        </select>
        <span class="duty-inline-hours">${hoursStr}</span>
        <button class="duty-delete-btn" onclick="deleteVehicleDuty('${vehicleId}', '${shiftId}', ${dutyIdx})" title="Delete duty"></button>
      </div>
    </div>
  `;
}

// Check if a driver is available for a given time slot
function isDriverAvailableForDuty(driverId, start, end, excludeDutyId = null) {
  if (!driverId) return true;
  
  const driver = drivers.find(d => d.id === driverId);
  if (!driver || driver.status === 'leave') return false;
  
  // Check all driver shifts for conflicts
  for (const shift of driver.shifts || []) {
    for (const duty of shift.duties || []) {
      if (excludeDutyId && duty.id === excludeDutyId) continue;
      if (duty.cancelled) continue; // Skip cancelled duties
      // Check for overlap
      if (start < duty.end && end > duty.start) {
        return false;
      }
    }
  }
  return true;
}

function updateVehicleDutyTime(vehicleId, shiftId, dutyIdx, field, value) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  const newTime = parseTime(value);
  
  if (isNaN(newTime)) {
    showToast('Invalid time format', 'error');
    renderDetailPanel();
    return;
  }
  
  const newStart = field === 'start' ? newTime : duty.start;
  const newEnd = field === 'end' ? newTime : duty.end;
  
  if (newStart >= newEnd) {
    showToast('End must be after start', 'error');
    renderDetailPanel();
    return;
  }
  
  // Check for overlaps with other duties
  const overlap = shift.duties.find((d, i) => {
    if (i === dutyIdx) return false;
    return newStart < d.end && newEnd > d.start;
  });
  
  if (overlap) {
    showToast(`Overlaps with ${formatTime(overlap.start)}-${formatTime(overlap.end)}`, 'error');
    renderDetailPanel();
    return;
  }
  
  duty[field] = newTime;
  
  // Update shift bounds if needed
  updateShiftBounds(shift);
  
  renderDetailPanel();
  renderAll();
}

function updateVehicleDutyDesc(vehicleId, shiftId, dutyIdx, value) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  shift.duties[dutyIdx].description = value;
}

function updateVehicleDutyType(vehicleId, shiftId, dutyIdx, value) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  shift.duties[dutyIdx].type = value;
  
  renderDetailPanel();
  renderAll();
  showToast(`Type changed to ${DUTY_TYPES[value]?.label || value}`);
}

function updateVehicleDutyDriver(vehicleId, shiftId, dutyIdx, driverId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  const duty = shift.duties[dutyIdx];
  
  // Check availability
  if (driverId && !isDriverAvailableForDuty(driverId, duty.start, duty.end, duty.id)) {
    showToast('Driver not available', 'error');
    renderDetailPanel();
    return;
  }
  
  if (driverId) {
    const driver = drivers.find(d => d.id === driverId);
    duty.driverId = driverId;
    duty.driver = driver?.name || driverId;
  } else {
    duty.driverId = null;
    duty.driver = null;
  }
  
  renderDetailPanel();
  renderAll();
  showToast(driverId ? `Driver set to ${duty.driver}` : 'Driver removed');
}

function updateVehicleDutyPayType(vehicleId, shiftId, dutyIdx, payType) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift || !shift.duties[dutyIdx]) return;
  
  shift.duties[dutyIdx].payType = payType;
  showToast(`Pay type updated to ${PAY_TYPES[payType].label}`);
}

function bulkUpdateVehiclePayType(vehicleId, shiftId, payType) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  shift.duties.forEach(duty => {
    duty.payType = payType;
  });
  
  renderDetailPanel();
  showToast(`All duties updated to ${PAY_TYPES[payType].label}`);
}

function insertVehicleDuty(vehicleId, shiftId, dutyIdx, position) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  const refDuty = shift.duties[dutyIdx];
  let newStart, newEnd;
  let extendedShift = false;
  
  if (position === 'above') {
    // Insert before this duty
    if (dutyIdx === 0) {
      // First duty - check if there's a gap before it
      const gapBefore = refDuty.start - shift.start;
      if (gapBefore >= 0.25) {
        // There's a gap - use it
        newStart = shift.start;
        newEnd = refDuty.start;
      } else {
        // No gap - extend shift backwards by 30 min
        const extension = 0.5;
        const newShiftStart = Math.max(5, shift.start - extension);
        if (newShiftStart < shift.start) {
          shift.start = newShiftStart;
          newStart = shift.start;
          newEnd = refDuty.start;
          extendedShift = true;
        } else {
          // Can't extend further (already at 05:00)
          showToast('Cannot extend shift before 05:00', true);
          return;
        }
      }
    } else {
      // Between previous duty and this one
      const prevDuty = shift.duties[dutyIdx - 1];
      newStart = prevDuty.end;
      newEnd = refDuty.start;
      
      if (newEnd <= newStart) {
        showToast('No gap between duties', true);
        return;
      }
    }
  } else {
    // Insert after this duty
    if (dutyIdx === shift.duties.length - 1) {
      // Last duty - check if there's a gap after it
      const gapAfter = shift.end - refDuty.end;
      if (gapAfter >= 0.25) {
        // There's a gap - use it
        newStart = refDuty.end;
        newEnd = shift.end;
      } else {
        // No gap - extend shift forward by 30 min
        const extension = 0.5;
        const newShiftEnd = Math.min(24, shift.end + extension);
        if (newShiftEnd > shift.end) {
          shift.end = newShiftEnd;
          newStart = refDuty.end;
          newEnd = shift.end;
          extendedShift = true;
        } else {
          // Can't extend further (already at 24:00)
          showToast('Cannot extend shift past 24:00', true);
          return;
        }
      }
    } else {
      // Between this duty and next one
      const nextDuty = shift.duties[dutyIdx + 1];
      newStart = refDuty.end;
      newEnd = nextDuty.start;
      
      if (newEnd <= newStart) {
        showToast('No gap between duties', true);
        return;
      }
    }
  }
  
  // Create and insert new duty directly
  const newDuty = {
    id: `d-${Date.now()}`,
    type: 'oov', // Default to OOV since it doesn't require driver
    start: newStart,
    end: newEnd,
    description: 'New duty',
    driver: null,
    driverId: null,
    payType: 'standard'
  };
  
  // Insert at correct position
  const insertIdx = position === 'above' ? dutyIdx : dutyIdx + 1;
  shift.duties.splice(insertIdx, 0, newDuty);
  
  // Update vehicle status if needed
  if (vehicle.status === 'available') {
    vehicle.status = 'inuse';
  }
  
  if (extendedShift) {
    showToast('Shift extended - duty added');
  } else {
    showToast('Duty added');
  }
  
  renderDetailPanel();
  renderAll();
}

function renderVehicleShiftTotals(shift, vehicleId) {
  const totals = calculateShiftTotals(shift);
  
  const breakdownHTML = Object.entries(totals.byType).map(([type, hours]) => {
    const dt = DUTY_TYPES[type] || { label: type };
    return `
      <div class="shift-total-item">
        <div class="shift-total-dot ${type}"></div>
        <span>${dt.label}: ${formatDutyHours(hours)}</span>
      </div>
    `;
  }).join('');
  
  const payTypeOptions = Object.entries(PAY_TYPES).map(([key, val]) => 
    `<option value="${key}">${val.label}</option>`
  ).join('');
  
  return `
    <div class="shift-totals">
      <div>
        <span class="shift-totals-label">Total Hours:</span>
        <span class="shift-totals-value">${formatDutyHours(totals.total)}</span>
      </div>
      <div class="shift-totals-breakdown">${breakdownHTML}</div>
      <div>
        <select class="duty-pay-select" onchange="if(this.value) bulkUpdateVehiclePayType('${vehicleId}', '${shift.id}', this.value); this.value='';" title="Set all duties to this pay type">
          <option value="">Bulk Pay...</option>
          ${payTypeOptions}
        </select>
      </div>
    </div>
  `;
}

function renderJobDetail(job) {
  if (!job) return `<div class="empty-panel"><div class="empty-icon">📋</div><div class="empty-text">Select a job to view details</div></div>`;
  if (allocationMode === 'vehicle') {
    return renderJobDetailVehicleCentric(job);
  }
  return renderJobDetailDriverCentric(job);
}

function renderJobDetailDriverCentric(job) {
  if (!job) return `<div class="empty-panel"><div class="empty-icon">📋</div><div class="empty-text">Job not found</div></div>`;
  
  // Calculate total job hours
  let totalHours = 0;
  const duties = job.duties || [];
  if (duties.length > 0) {
    totalHours = duties.reduce((sum, duty) => sum + (duty.end - duty.start), 0);
  } else {
    totalHours = (job.end || 18) - (job.start || 6);
  }
  
  // Render job duties
  const dutiesHTML = duties.length > 0 ? `
    <div class="duty-list">
      ${duties.map(duty => {
        const dt = DUTY_TYPES[duty.type] || DUTY_TYPES.driving;
        const hours = duty.end - duty.start;
        return `
          <div class="duty-item">
            <div class="duty-type-bar ${duty.type}"></div>
            <div class="duty-content">
              <div class="duty-row-main">
                <span class="duty-time">${formatTime(duty.start)}-${formatTime(duty.end)}</span>
                <span class="duty-desc">${duty.description}</span>
                <span class="duty-badge ${duty.type}">${dt.label}</span>
              </div>
              <div class="duty-row-meta">
                <span class="duty-hours">${formatDutyHours(hours)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="shift-totals" style="margin-top: 8px;">
      <div>
        <span class="shift-totals-label">Total Hours:</span>
        <span class="shift-totals-value">${formatDutyHours(totalHours)}</span>
      </div>
    </div>
  ` : '<div class="info-row"><span class="info-value" style="color: var(--text-muted)">No duties defined</span></div>';
  
  // Location info for charters
  const locationHTML = job.type === 'charter' && job.pickupLocation ? `
    <div class="panel-section" style="background: rgba(59, 130, 246, 0.05); border-radius: 6px; padding: 10px;">
      <div class="info-row"><span class="info-label">📍 Pickup</span><span class="info-value">${job.pickupLocation.name}</span></div>
      <div class="info-row"><span class="info-label">🏁 Dropoff</span><span class="info-value">${job.dropoffLocation?.name || 'TBC'}</span></div>
      ${job.pickupLocation && job.dropoffLocation ? `
        <div class="info-row">
          <span class="info-label">📏 Distance</span>
          <span class="info-value">${formatDistance(calculateDistance(job.pickupLocation, job.dropoffLocation))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">🚗 Est. Travel</span>
          <span class="info-value">${formatTravelTime(estimateTravelTime(job.pickupLocation, job.dropoffLocation))}</span>
        </div>
      ` : ''}
    </div>
  ` : '';
  
  return `
    <div class="panel-header">
      <div class="panel-header-info">
        <div class="panel-title">${job.name}</div>
        <div class="panel-subtitle">${job.id}</div>
      </div>
    </div>
    <div class="panel-content">
      <div class="panel-section">
        <div class="info-row"><span class="info-label">Time</span><span class="info-value">${formatTime(job.start)} - ${formatTime(job.end)}</span></div>
        <div class="info-row"><span class="info-label">Type</span><span class="info-value">${job.type === 'charter' ? 'Charter' : 'Shift'}</span></div>
        ${job.customer ? `<div class="info-row"><span class="info-label">Customer</span><span class="info-value">${job.customer}</span></div>` : ''}
      </div>
      ${locationHTML}
      <div class="panel-section">
        <div class="panel-section-title">Job Breakdown</div>
        ${dutiesHTML}
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Assign Driver</div>
        <div class="assignment-panel">
          <div class="assignment-search">
            <input type="text" class="assignment-search-input" id="assignDriverSearch" 
                   placeholder="Search by name..." oninput="updateDriverAssignmentList(${unassignedJobs.indexOf(job)})">
          </div>
          <div class="assignment-filters">
            <select class="filter-select" id="assignDriverFilter" onchange="updateDriverAssignmentList(${unassignedJobs.indexOf(job)})">
              <option value="no-duties">No duties</option>
              <option value="has-duties">Has duties</option>
              <option value="not-available">Not available</option>
              <option value="all">All drivers</option>
            </select>
            <select class="filter-select" id="assignDriverSort" onchange="updateDriverAssignmentList(${unassignedJobs.indexOf(job)})">
              <option value="surname">Surname</option>
              <option value="firstname">First name</option>
              <option value="hours-asc">Hours (low→high)</option>
              <option value="hours-desc">Hours (high→low)</option>
              <option value="shifts">Fewest shifts</option>
            </select>
          </div>
          <div class="assignment-count" id="driverAssignmentCount"></div>
          <div class="assignment-list" id="driverAssignmentList"></div>
        </div>
      </div>
    </div>
  `;
}

function updateDriverAssignmentList(jobIndex) {
  const job = unassignedJobs[jobIndex];
  if (!job) return;
  
  const search = document.getElementById('assignDriverSearch')?.value?.toLowerCase() || '';
  const filter = document.getElementById('assignDriverFilter')?.value || 'no-duties';
  const sort = document.getElementById('assignDriverSort')?.value || 'surname';
  
  // Get all non-leave drivers first
  let filteredDrivers = drivers.filter(d => d.status !== 'leave');
  
  // Helper to check if driver is available for the job time
  const isAvailableForJob = (driver) => {
    const jobStartMins = toMinutes(job.start);
    const jobEndMins = toMinutes(job.end);
    
    for (const shift of driver.shifts) {
      for (const duty of shift.duties) {
        if (duty.cancelled) continue; // Skip cancelled duties
        const dStartMins = toMinutes(duty.start);
        const dEndMins = toMinutes(duty.end);
        if (jobStartMins < dEndMins && jobEndMins > dStartMins) {
          return false; // Overlap found
        }
      }
    }
    return true;
  };
  
  // Helper to get total hours for a driver (excluding cancelled)
  const getTotalHours = (driver) => {
    return driver.shifts.reduce((total, shift) => {
      return total + shift.duties.filter(d => !d.cancelled).reduce((sum, duty) => sum + (duty.end - duty.start), 0);
    }, 0);
  };
  
  // Helper to check if driver has active duties
  const hasActiveDuties = (driver) => {
    return driver.shifts.some(s => s.duties.some(d => !d.cancelled));
  };
  
  // Apply availability filter
  if (filter === 'no-duties') {
    filteredDrivers = filteredDrivers.filter(d => !hasActiveDuties(d));
  } else if (filter === 'has-duties') {
    filteredDrivers = filteredDrivers.filter(d => {
      return hasActiveDuties(d) && isAvailableForJob(d);
    });
  } else if (filter === 'not-available') {
    filteredDrivers = filteredDrivers.filter(d => !isAvailableForJob(d));
  }
  // 'all' shows everyone except leave
  
  // Apply search
  if (search) {
    filteredDrivers = filteredDrivers.filter(d => 
      d.name.toLowerCase().includes(search) || 
      d.fullName.toLowerCase().includes(search) ||
      d.id.toLowerCase().includes(search)
    );
  }
  
  // Apply sorting
  filteredDrivers.sort((a, b) => {
    switch (sort) {
      case 'surname':
        const surnameA = a.fullName.split(' ').pop().toLowerCase();
        const surnameB = b.fullName.split(' ').pop().toLowerCase();
        return surnameA.localeCompare(surnameB);
      case 'firstname':
        const firstA = a.fullName.split(' ')[0].toLowerCase();
        const firstB = b.fullName.split(' ')[0].toLowerCase();
        return firstA.localeCompare(firstB);
      case 'hours-asc':
        return getTotalHours(a) - getTotalHours(b);
      case 'hours-desc':
        return getTotalHours(b) - getTotalHours(a);
      case 'shifts':
        return a.shifts.length - b.shifts.length;
      default:
        return 0;
    }
  });
  
  // Update count with filter context
  const countEl = document.getElementById('driverAssignmentCount');
  if (countEl) {
    const filterLabels = {
      'no-duties': 'with no duties',
      'has-duties': 'with duties (available)',
      'not-available': 'not available',
      'all': 'total'
    };
    countEl.textContent = `${filteredDrivers.length} driver(s) ${filterLabels[filter]}`;
  }
  
  // Render list
  const listEl = document.getElementById('driverAssignmentList');
  if (listEl) {
    if (filteredDrivers.length === 0) {
      listEl.innerHTML = '<div class="assignment-empty">No matching drivers</div>';
    } else {
      listEl.innerHTML = filteredDrivers.map(d => {
        const driverIdx = drivers.indexOf(d);
        const totalHours = getTotalHours(d);
        const available = isAvailableForJob(d);
        const shiftCount = d.shifts.filter(s => s.duties.some(duty => !duty.cancelled)).length;
        
        // Build detail text
        let detailText = '';
        if (shiftCount === 0) {
          detailText = 'No duties';
        } else {
          detailText = `${shiftCount} shift(s) • ${formatDutyHours(totalHours)}`;
        }
        
        return `
        <div class="assignment-item ${!available ? 'unavailable' : ''}">
          <div class="assignment-item-info">
            <span class="assignment-item-name clickable" onclick="navigateToResource('driver', ${driverIdx})">${d.fullName}</span>
            <span class="assignment-item-detail">${detailText}</span>
          </div>
          <span class="assignment-item-status ${available ? (shiftCount > 0 ? 'working' : 'available') : 'unavailable'}">${available ? (shiftCount > 0 ? 'Working' : 'Available') : 'Busy'}</span>
          ${available ? `<button class="assign-btn" onclick="assignDriverToJob(${jobIndex}, ${driverIdx})">Assign</button>` : ''}
        </div>
      `}).join('');
    }
  }
}

// Get the ending location and time of a driver's last charter/shift
function getDriverEndingInfo(driver) {
  if (!driver.shifts || driver.shifts.length === 0) return null;
  
  // Get the last shift
  const sortedShifts = [...driver.shifts].sort((a, b) => b.end - a.end);
  const lastShift = sortedShifts[0];
  
  if (lastShift.type !== 'charter') return null;
  
  // Find the last location from duties
  const lastDuty = [...lastShift.duties].reverse().find(d => d.toLocationId || d.locationId);
  if (!lastDuty) return null;
  
  const locationId = lastDuty.toLocationId || lastDuty.locationId;
  const location = LOCATIONS.find(l => l.id === locationId);
  
  return {
    location,
    endTime: lastShift.end,
    shift: lastShift
  };
}

// Get the ending location and time of a vehicle's last charter/shift
function getVehicleEndingInfo(vehicle) {
  if (!vehicle.shifts || vehicle.shifts.length === 0) return null;
  
  // Get non-maintenance shifts
  const workShifts = vehicle.shifts.filter(s => s.type !== 'maintenance');
  if (workShifts.length === 0) return null;
  
  // Get the last shift
  const sortedShifts = [...workShifts].sort((a, b) => b.end - a.end);
  const lastShift = sortedShifts[0];
  
  if (lastShift.type !== 'charter') return null;
  
  // Find the last location from duties
  const lastDuty = [...lastShift.duties].reverse().find(d => d.toLocationId || d.locationId);
  if (!lastDuty) return null;
  
  const locationId = lastDuty.toLocationId || lastDuty.locationId;
  const location = LOCATIONS.find(l => l.id === locationId);
  
  return {
    location,
    endTime: lastShift.end,
    shift: lastShift
  };
}

// Render smart suggestions panel
function renderSuggestionPanel(endingInfo, entityType, entityIndex) {
  if (!endingInfo || !endingInfo.location) return '';
  
  // Get unassigned charter jobs
  const charterJobs = unassignedJobs.filter(j => j.type === 'charter' && j.start > endingInfo.endTime);
  
  if (charterJobs.length === 0) return '';
  
  // Find best suggestions
  const suggestions = findBestNextJobs(endingInfo.location, endingInfo.endTime, charterJobs, 5);
  
  if (suggestions.length === 0) return '';
  
  return `
    <div class="suggestion-panel">
      <div class="suggestion-header">
        <span class="suggestion-icon">🎯</span>
        <div>
          <div class="suggestion-title">Smart Suggestions</div>
          <div class="suggestion-subtitle">Based on ${endingInfo.shift.name} ending at ${endingInfo.location.name} @ ${formatTime(endingInfo.endTime)}</div>
        </div>
      </div>
      <div class="suggestion-list">
        ${suggestions.map((s, idx) => `
          <div class="suggestion-item ${s.canMakeIt ? '' : 'not-possible'}">
            <div class="suggestion-rank">#${idx + 1}</div>
            <div class="suggestion-details">
              <div class="suggestion-job-name">${s.job.name} (${s.job.customer || 'Charter'})</div>
              <div class="suggestion-location">📍 ${s.pickupLocation?.name || 'Unknown'} @ ${formatTime(s.job.start)}</div>
              <div class="suggestion-metrics">
                <span class="suggestion-metric distance">📏 ${formatDistance(s.distance)}</span>
                <span class="suggestion-metric time">🚗 ${formatTravelTime(s.travelTime)}</span>
                ${s.canMakeIt 
                  ? `<span class="suggestion-metric wait">⏳ ${s.waitTime > 0.08 ? formatTravelTime(s.waitTime) + ' wait' : 'Just in time'}</span>`
                  : `<span class="suggestion-metric late">⚠️ Would arrive ${formatTravelTime(s.arrivalTime - s.job.start)} late</span>`
                }
              </div>
            </div>
            <div class="suggestion-actions">
              ${s.canMakeIt 
                ? `<button class="suggestion-assign-btn" onclick="assignSuggestedJob(${unassignedJobs.indexOf(s.job)}, '${entityType}', ${entityIndex})">Assign</button>`
                : `<button class="suggestion-assign-btn" disabled>Can't make it</button>`
              }
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Assign a suggested job
function assignSuggestedJob(jobIndex, entityType, entityIndex) {
  if (entityType === 'driver') {
    assignDriverToJob(jobIndex, entityIndex);
  } else if (entityType === 'vehicle') {
    assignVehicleToJob(jobIndex, entityIndex);
  }
}

function renderJobDetailVehicleCentric(job) {
  if (!job) return `<div class="empty-panel"><div class="empty-icon">📋</div><div class="empty-text">Job not found</div></div>`;
  
  // Calculate total job hours
  let totalHours = 0;
  const duties = job.duties || [];
  if (duties.length > 0) {
    totalHours = duties.reduce((sum, duty) => sum + (duty.end - duty.start), 0);
  } else {
    totalHours = (job.end || 18) - (job.start || 6);
  }
  
  // Render job duties
  const dutiesHTML = duties.length > 0 ? `
    <div class="duty-list">
      ${duties.map(duty => {
        const dt = DUTY_TYPES[duty.type] || DUTY_TYPES.driving;
        const hours = duty.end - duty.start;
        return `
          <div class="duty-item">
            <div class="duty-type-bar ${duty.type}"></div>
            <div class="duty-content">
              <div class="duty-row-main">
                <span class="duty-time">${formatTime(duty.start)}-${formatTime(duty.end)}</span>
                <span class="duty-desc">${duty.description}</span>
                <span class="duty-badge ${duty.type}">${dt.label}</span>
              </div>
              <div class="duty-row-meta">
                <span class="duty-hours">${formatDutyHours(hours)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="shift-totals" style="margin-top: 8px;">
      <div>
        <span class="shift-totals-label">Total Hours:</span>
        <span class="shift-totals-value">${formatDutyHours(totalHours)}</span>
      </div>
    </div>
  ` : '<div class="info-row"><span class="info-value" style="color: var(--text-muted)">No duties defined</span></div>';
  
  // Location info for charters
  const locationHTML = job.type === 'charter' && job.pickupLocation ? `
    <div class="panel-section" style="background: rgba(59, 130, 246, 0.05); border-radius: 6px; padding: 10px;">
      <div class="info-row"><span class="info-label">📍 Pickup</span><span class="info-value">${job.pickupLocation.name}</span></div>
      <div class="info-row"><span class="info-label">🏁 Dropoff</span><span class="info-value">${job.dropoffLocation?.name || 'TBC'}</span></div>
      ${job.pickupLocation && job.dropoffLocation ? `
        <div class="info-row">
          <span class="info-label">📏 Distance</span>
          <span class="info-value">${formatDistance(calculateDistance(job.pickupLocation, job.dropoffLocation))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">🚗 Est. Travel</span>
          <span class="info-value">${formatTravelTime(estimateTravelTime(job.pickupLocation, job.dropoffLocation))}</span>
        </div>
      ` : ''}
    </div>
  ` : '';
  
  return `
    <div class="panel-header">
      <div class="panel-header-info">
        <div class="panel-title">${job.name}</div>
        <div class="panel-subtitle">${job.id}</div>
      </div>
    </div>
    <div class="panel-content">
      <div class="panel-section">
        <div class="info-row"><span class="info-label">Time</span><span class="info-value">${formatTime(job.start)} - ${formatTime(job.end)}</span></div>
        <div class="info-row"><span class="info-label">Type</span><span class="info-value">${job.type === 'charter' ? 'Charter' : 'Shift'}</span></div>
        ${job.customer ? `<div class="info-row"><span class="info-label">Customer</span><span class="info-value">${job.customer}</span></div>` : ''}
      </div>
      ${locationHTML}
      <div class="panel-section">
        <div class="panel-section-title">Job Breakdown</div>
        ${dutiesHTML}
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Assign Vehicle</div>
        <div class="assignment-panel">
          <div class="assignment-search">
            <input type="text" class="assignment-search-input" id="assignVehicleSearch" 
                   placeholder="Search by ID or rego..." oninput="updateVehicleAssignmentList(${unassignedJobs.indexOf(job)})">
          </div>
          <div class="assignment-filters">
            <select class="filter-select" id="assignVehicleFilter" onchange="updateVehicleAssignmentList(${unassignedJobs.indexOf(job)})">
              <option value="no-duties">No duties</option>
              <option value="has-duties">Has duties</option>
              <option value="not-available">Not available</option>
              <option value="all">All vehicles</option>
            </select>
            <select class="filter-select" id="assignVehicleCapacity" onchange="updateVehicleAssignmentList(${unassignedJobs.indexOf(job)})">
              <option value="all">Any Capacity</option>
              <option value="45">45+ seats</option>
              <option value="50">50+ seats</option>
              <option value="60">60+ seats</option>
            </select>
            <select class="filter-select" id="assignVehicleSort" onchange="updateVehicleAssignmentList(${unassignedJobs.indexOf(job)})">
              <option value="id">Vehicle ID</option>
              <option value="capacity-desc">Capacity (high→low)</option>
              <option value="capacity-asc">Capacity (low→high)</option>
              <option value="hours-asc">Hours (low→high)</option>
              <option value="hours-desc">Hours (high→low)</option>
            </select>
          </div>
          <div class="assignment-count" id="vehicleAssignmentCount"></div>
          <div class="assignment-list" id="vehicleAssignmentList"></div>
        </div>
      </div>
    </div>
  `;
}

function updateVehicleAssignmentList(jobIndex) {
  const job = unassignedJobs[jobIndex];
  if (!job) return;
  
  const search = document.getElementById('assignVehicleSearch')?.value?.toLowerCase() || '';
  const filter = document.getElementById('assignVehicleFilter')?.value || 'no-duties';
  const capacityFilter = document.getElementById('assignVehicleCapacity')?.value || 'all';
  const sort = document.getElementById('assignVehicleSort')?.value || 'id';
  
  // Get all non-maintenance vehicles first
  let filteredVehicles = vehicles.filter(v => v.status !== 'maintenance');
  
  // Helper to check if vehicle is available for the job time
  const isAvailableForJob = (vehicle) => {
    const jobStartMins = toMinutes(job.start);
    const jobEndMins = toMinutes(job.end);
    
    for (const shift of vehicle.shifts) {
      if (shift.type === 'maintenance') continue;
      for (const duty of shift.duties) {
        const dStartMins = toMinutes(duty.start);
        const dEndMins = toMinutes(duty.end);
        if (jobStartMins < dEndMins && jobEndMins > dStartMins) {
          return false; // Overlap found
        }
      }
    }
    return true;
  };
  
  // Helper to get total hours for a vehicle
  const getTotalHours = (vehicle) => {
    return vehicle.shifts.reduce((total, shift) => {
      if (shift.type === 'maintenance') return total;
      return total + shift.duties.reduce((sum, duty) => sum + (duty.end - duty.start), 0);
    }, 0);
  };
  
  // Apply availability filter
  if (filter === 'no-duties') {
    filteredVehicles = filteredVehicles.filter(v => {
      const nonMaintShifts = v.shifts.filter(s => s.type !== 'maintenance');
      return nonMaintShifts.length === 0 || nonMaintShifts.every(s => s.duties.length === 0);
    });
  } else if (filter === 'has-duties') {
    filteredVehicles = filteredVehicles.filter(v => {
      const hasDuties = v.shifts.some(s => s.type !== 'maintenance' && s.duties.length > 0);
      return hasDuties && isAvailableForJob(v);
    });
  } else if (filter === 'not-available') {
    filteredVehicles = filteredVehicles.filter(v => !isAvailableForJob(v));
  }
  // 'all' shows everyone except maintenance
  
  // Apply search
  if (search) {
    filteredVehicles = filteredVehicles.filter(v => 
      v.id.toLowerCase().includes(search) || 
      v.rego.toLowerCase().includes(search)
    );
  }
  
  // Apply capacity filter
  if (capacityFilter !== 'all') {
    const minCapacity = parseInt(capacityFilter);
    filteredVehicles = filteredVehicles.filter(v => v.capacity >= minCapacity);
  }
  
  // Apply sorting
  filteredVehicles.sort((a, b) => {
    switch (sort) {
      case 'id':
        return a.id.localeCompare(b.id);
      case 'capacity-desc':
        return b.capacity - a.capacity;
      case 'capacity-asc':
        return a.capacity - b.capacity;
      case 'hours-asc':
        return getTotalHours(a) - getTotalHours(b);
      case 'hours-desc':
        return getTotalHours(b) - getTotalHours(a);
      default:
        return 0;
    }
  });
  
  // Update count with filter context
  const countEl = document.getElementById('vehicleAssignmentCount');
  if (countEl) {
    const filterLabels = {
      'no-duties': 'with no duties',
      'has-duties': 'with duties (available)',
      'not-available': 'not available',
      'all': 'total'
    };
    countEl.textContent = `${filteredVehicles.length} vehicle(s) ${filterLabels[filter]}`;
  }
  
  // Render list
  const listEl = document.getElementById('vehicleAssignmentList');
  if (listEl) {
    if (filteredVehicles.length === 0) {
      listEl.innerHTML = '<div class="assignment-empty">No matching vehicles</div>';
    } else {
      listEl.innerHTML = filteredVehicles.map(v => {
        const vehicleIdx = vehicles.indexOf(v);
        const totalHours = getTotalHours(v);
        const available = isAvailableForJob(v);
        const shiftCount = v.shifts.filter(s => s.type !== 'maintenance' && s.duties.length > 0).length;
        
        // Build detail text
        let detailText = `${v.capacity} seats`;
        if (shiftCount > 0) {
          detailText += ` • ${shiftCount} shift(s) • ${formatDutyHours(totalHours)}`;
        }
        
        return `
          <div class="assignment-item ${!available ? 'unavailable' : ''}">
            <div class="assignment-item-info">
              <span class="assignment-item-name clickable" onclick="navigateToResource('vehicle', ${vehicleIdx})">${v.rego}</span>
              <span class="assignment-item-detail">${detailText}</span>
            </div>
            <span class="assignment-item-status ${available ? (shiftCount > 0 ? 'inuse' : 'available') : 'unavailable'}">${available ? (shiftCount > 0 ? 'In Use' : 'Available') : 'Busy'}</span>
            ${available ? `<button class="assign-btn" onclick="assignVehicleToJob(${jobIndex}, ${vehicleIdx})">Assign</button>` : ''}
          </div>
        `;
      }).join('');
    }
  }
}

// Transfer list update functions
function updateTransferDriverList() {
  if (!transferringShift || transferringShift.type !== 'driver') return;
  
  const shift = transferringShift.shift;
  const search = document.getElementById('transferDriverSearch')?.value?.toLowerCase() || '';
  
  let availableDrivers = getDriversAvailableForShift(shift, transferringShift.sourceId);
  
  // Apply search
  if (search) {
    availableDrivers = availableDrivers.filter(d => 
      d.name.toLowerCase().includes(search) || 
      d.fullName.toLowerCase().includes(search) ||
      d.id.toLowerCase().includes(search)
    );
  }
  
  // Update count
  const countEl = document.getElementById('transferDriverCount');
  if (countEl) {
    countEl.textContent = `${availableDrivers.length} driver(s) available for ${formatTime(shift.start)}-${formatTime(shift.end)}`;
  }
  
  // Render list
  const listEl = document.getElementById('transferDriverList');
  if (listEl) {
    if (availableDrivers.length === 0) {
      listEl.innerHTML = '<div class="assignment-empty">No matching drivers available</div>';
    } else {
      listEl.innerHTML = availableDrivers.map(d => {
        const driverIdx = drivers.indexOf(d);
        return `
        <div class="assignment-item">
          <div class="assignment-item-info">
            <span class="assignment-item-name clickable" onclick="navigateToResource('driver', ${driverIdx})">${d.fullName}</span>
            <span class="assignment-item-detail">${d.shifts.length > 0 ? `${d.shifts.length} shift(s)` : 'No shifts'}</span>
          </div>
          <span class="assignment-item-status ${d.status}">${d.status === 'available' ? 'Available' : 'Working'}</span>
          <button class="assign-btn" onclick="executeTransferDriverShift('${d.id}')">Transfer</button>
        </div>
      `}).join('');
    }
  }
}

function updateTransferVehicleList() {
  if (!transferringShift || transferringShift.type !== 'vehicle') return;
  
  const shift = transferringShift.shift;
  const search = document.getElementById('transferVehicleSearch')?.value?.toLowerCase() || '';
  
  let availableVehicles = getVehiclesAvailableForShift(shift, transferringShift.sourceId);
  
  // Apply search
  if (search) {
    availableVehicles = availableVehicles.filter(v => 
      v.id.toLowerCase().includes(search) || 
      v.rego.toLowerCase().includes(search)
    );
  }
  
  // Update count
  const countEl = document.getElementById('transferVehicleCount');
  if (countEl) {
    countEl.textContent = `${availableVehicles.length} vehicle(s) available for ${formatTime(shift.start)}-${formatTime(shift.end)}`;
  }
  
  // Render list
  const listEl = document.getElementById('transferVehicleList');
  if (listEl) {
    if (availableVehicles.length === 0) {
      listEl.innerHTML = '<div class="assignment-empty">No matching vehicles available</div>';
    } else {
      listEl.innerHTML = availableVehicles.map(v => {
        const vehicleIdx = vehicles.indexOf(v);
        const shiftCount = v.shifts.filter(s => s.type !== 'maintenance').length;
        return `
          <div class="assignment-item">
            <div class="assignment-item-info">
              <span class="assignment-item-name clickable" onclick="navigateToResource('vehicle', ${vehicleIdx})">${v.rego}</span>
              <span class="assignment-item-detail">${v.capacity} seats${shiftCount > 0 ? ` • ${shiftCount} shift(s)` : ''}</span>
            </div>
            <span class="assignment-item-status ${v.status}">${v.status === 'available' ? 'Available' : 'In Use'}</span>
            <button class="assign-btn" onclick="executeTransferVehicleShift('${v.id}')">Transfer</button>
          </div>
        `;
      }).join('');
    }
  }
}

function editDuty(driverId, shiftId, dutyIdx) {
  const driver = drivers.find(d => d.id === driverId);
  const shift = driver.shifts.find(s => s.id === shiftId);
  const duty = shift.duties[dutyIdx];
  
  editingDuty = { 
    driverId, 
    shiftId, 
    dutyIdx, 
    duty: { ...duty }, 
    shift, 
    isNew: false 
  };
  formErrors = {};
  renderDetailPanel();
}

function showAddDutyForm(driverId) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  // Find all available slots across the ENTIRE day, including gaps between shifts
  const dayStart = 5;  // 5am
  const dayEnd = 23;   // 11pm
  const allSlots = findAllAvailableSlots(driver, dayStart, dayEnd);
  
  if (allSlots.length === 0) {
    showToast('No available time slots today', true);
    return;
  }
  
  // PRIORITY: Find slots WITHIN existing shifts first (these can be saved to DB)
  let selectedSlot = null;
  let containingShift = null;
  
  for (const slot of allSlots) {
    const duration = Math.min(0.5, slot.end - slot.start);
    const shift = driver.shifts.find(s => s.start <= slot.start && s.end >= slot.start + duration);
    if (shift && shift.entryId) {
      selectedSlot = slot;
      containingShift = shift;
      break;
    }
  }
  
  // If no slot within shifts, use first slot (will be adhoc/local only)
  if (!selectedSlot) {
    selectedSlot = allSlots[0];
    const duration = Math.min(0.5, selectedSlot.end - selectedSlot.start);
    containingShift = driver.shifts.find(s => s.start <= selectedSlot.start && s.end >= selectedSlot.start + duration);
  }
  
  const duration = Math.min(0.5, selectedSlot.end - selectedSlot.start);
  
  editingDuty = {
    driverId, 
    shiftId: containingShift ? containingShift.id : null,
    dutyIdx: containingShift ? containingShift.duties.length : 0,
    duty: { 
      id: `d-new-${Date.now()}`, 
      type: 'driving', 
      start: selectedSlot.start, 
      end: selectedSlot.start + duration, 
      description: 'New duty', 
      vehicle: null 
    },
    shift: containingShift || null,
    isNew: true,
    isAdhoc: !containingShift,
    allSlots: allSlots
  };
  formErrors = {};
  renderDetailPanel();
}

// Find ALL available time slots for a driver across the entire day
function findAllAvailableSlots(driver, dayStart, dayEnd, minDuration = 0.25) {
  const slots = [];
  const minDurationMins = toMinutes(minDuration);
  
  // Collect all occupied periods (from all shifts' duties)
  const occupiedPeriods = [];
  driver.shifts.forEach(shift => {
    shift.duties.forEach(duty => {
      occupiedPeriods.push({ start: duty.start, end: duty.end });
    });
  });
  
  // Sort by start time
  occupiedPeriods.sort((a, b) => a.start - b.start);
  
  // Find gaps
  let currentTime = dayStart;
  
  for (const period of occupiedPeriods) {
    const gapMins = toMinutes(period.start) - toMinutes(currentTime);
    if (gapMins >= minDurationMins) {
      slots.push({ start: currentTime, end: period.start });
    }
    currentTime = Math.max(currentTime, period.end);
  }
  
  // Check for gap at end of day
  const endGapMins = toMinutes(dayEnd) - toMinutes(currentTime);
  if (endGapMins >= minDurationMins) {
    slots.push({ start: currentTime, end: dayEnd });
  }
  
  return slots;
}

function fillSlot(start, end) {
  if (!editingDuty) return;
  
  const duration = Math.min(0.5, end - start);
  editingDuty.duty.start = start;
  editingDuty.duty.end = start + duration;
  
  // Check if this slot falls within an existing shift
  const driver = drivers.find(d => d.id === editingDuty.driverId);
  const containingShift = driver.shifts.find(s => s.start <= start && s.end >= start + duration);
  
  editingDuty.shift = containingShift || null;
  editingDuty.shiftId = containingShift ? containingShift.id : null;
  editingDuty.isAdhoc = !containingShift;
  
  formErrors = {};
  renderDetailPanel();
}

function onFormChange() {
  if (!editingDuty) return;
  
  const startStr = document.getElementById('editStart')?.value;
  const endStr = document.getElementById('editEnd')?.value;
  const type = document.getElementById('editType')?.value;
  const vehicle = document.getElementById('editVehicle')?.value || null;
  
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  
  editingDuty.duty.start = start;
  editingDuty.duty.end = end;
  editingDuty.duty.type = type;
  editingDuty.duty.vehicle = vehicle;
  
  // For vehicle-centric editing, skip driver-based validation
  if (editingDuty.isVehicleCentric) {
    // Validate within the shift bounds
    if (editingDuty.shift) {
      const excludeId = editingDuty.duty.id;
      formErrors = validateDutyForm(
        { start, end, type, driver: editingDuty.duty.driver }, 
        editingDuty.shift.duties, 
        editingDuty.shift.start, 
        editingDuty.shift.end, 
        excludeId
      );
    } else {
      formErrors = {};
    }
    renderDetailPanel();
    return;
  }
  
  const driver = drivers.find(d => d.id === editingDuty.driverId);
  if (!driver) return;
  
  // Only re-check shift assignment for truly adhoc duties (ones created via "Add Duty" button)
  // For duties inserted via arrows, we already have the correct shift reference
  if (editingDuty.isNew && editingDuty.isAdhoc) {
    // This is a truly adhoc duty - find which shift it belongs to based on times
    const containingShift = driver.shifts.find(s => s.start <= start && s.end >= end);
    editingDuty.shift = containingShift || null;
    editingDuty.shiftId = containingShift ? containingShift.id : null;
    editingDuty.isAdhoc = !containingShift;
  }
  
  // Validate
  if (editingDuty.isAdhoc || !editingDuty.shift) {
    // Validate against all duties across all shifts (for adhoc)
    const allDuties = driver.shifts.flatMap(s => s.duties);
    formErrors = validateAdhocDutyForm({ start, end, type, vehicle }, allDuties, editingDuty.duty.id);
  } else {
    // Validate within the shift - use the shift reference we already have
    const excludeId = editingDuty.duty.id;
    formErrors = validateDutyForm(
      { start, end, type, vehicle }, 
      editingDuty.shift.duties, 
      editingDuty.shift.start, 
      editingDuty.shift.end, 
      excludeId,
      driver,
      editingDuty.shiftId
    );
  }
  
  renderDetailPanel();
}

// Validate adhoc duty against all existing duties (not bound to a shift)
function validateAdhocDutyForm(data, allDuties, excludeId = null) {
  const errors = {};
  
  if (isNaN(data.start) || isNaN(data.end)) {
    errors.time = 'Invalid time format (use HH:MM or HHMM, e.g., 07:30 or 0730)';
    return errors;
  }
  
  if (data.start < 0 || data.start > 24 || data.end < 0 || data.end > 24) {
    errors.time = 'Time must be between 00:00 and 24:00';
    return errors;
  }
  
  const startMins = toMinutes(data.start);
  const endMins = toMinutes(data.end);
  
  if (startMins >= endMins) {
    errors.time = 'End time must be after start time';
    return errors;
  }
  
  // Check for overlaps with any existing duty (excluding the one being edited)
  const overlap = allDuties.find(d => {
    if (excludeId && d.id === excludeId) return false; // Skip the duty being edited
    const dStartMins = toMinutes(d.start);
    const dEndMins = toMinutes(d.end);
    return (startMins < dEndMins && endMins > dStartMins);
  });
  
  if (overlap) {
    errors.overlap = `Overlaps with duty at ${formatTime(overlap.start)}-${formatTime(overlap.end)}`;
  }
  
  // Check vehicle availability (if a vehicle is selected)
  if (data.vehicle && !isVehicleAvailableForDuty(data.vehicle, data.start, data.end, excludeId)) {
    errors.vehicle = `${data.vehicle} is already assigned during this time`;
  }
  
  return errors;
}

function cancelEdit() {
  // If we extended a shift for a new duty and user cancels, revert the extension
  if (editingDuty && editingDuty.isNew && editingDuty.shift) {
    if (editingDuty.originalShiftStart !== undefined) {
      editingDuty.shift.start = editingDuty.originalShiftStart;
    }
    if (editingDuty.originalShiftEnd !== undefined) {
      editingDuty.shift.end = editingDuty.originalShiftEnd;
    }
  }
  
  editingDuty = null;
  formErrors = {};
  renderAll();
}

async function saveEdit() {
  if (!editingDuty) return;
  
  const startStr = document.getElementById('editStart')?.value;
  const endStr = document.getElementById('editEnd')?.value;
  const type = document.getElementById('editType')?.value;
  const vehicle = document.getElementById('editVehicle')?.value || null;
  const description = document.getElementById('editDesc')?.value || '';
  const locationName = document.getElementById('editLocation')?.value || null;
  const locationLat = parseFloat(document.getElementById('editLocationLat')?.value) || null;
  const locationLng = parseFloat(document.getElementById('editLocationLng')?.value) || null;
  
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  
  const driver = drivers.find(d => d.id === editingDuty.driverId);
  
  // Final validation
  if (editingDuty.isAdhoc || !editingDuty.shift) {
    const allDuties = driver.shifts.flatMap(s => s.duties);
    // Exclude current duty from overlap check
    formErrors = validateAdhocDutyForm({ start, end, type, vehicle }, allDuties, editingDuty.duty.id);
  } else {
    // Always exclude the duty being edited
    const excludeId = editingDuty.duty.id;
    formErrors = validateDutyForm(
      { start, end, type, vehicle }, 
      editingDuty.shift.duties, 
      editingDuty.shift.start, 
      editingDuty.shift.end, 
      excludeId,
      driver,
      editingDuty.shiftId
    );
  }
  
  if (Object.keys(formErrors).length > 0) {
    renderDetailPanel();
    return;
  }
  
  const updatedDuty = { 
    id: editingDuty.duty.id, 
    type, 
    start, 
    end, 
    description, 
    vehicle,
    locationName,
    locationLat,
    locationLng
  };
  
  if (editingDuty.isNew) {
    if (editingDuty.isAdhoc || !editingDuty.shift) {
      // Create new adhoc shift via API
      if (dataSource === 'real') {
        try {
          const result = await apiRequest('/dispatch/create-adhoc-shift', {
            method: 'POST',
            body: {
              date: formatDateISO(currentDate),
              employee_id: driver.id,
              duty: {
                start_time: start,
                end_time: end,
                duty_type: type,
                description: description || 'Adhoc duty',
                vehicle_id: vehicle || null,
                pay_type: 'STD',
                location_name: locationName,
                location_lat: locationLat,
                location_lng: locationLng
              }
            }
          });
          
          if (result.error) {
            showToast(result.error, 'error');
            return;
          }
          
          // Create local shift object with real IDs
          const entryId = result.data?.entry_id || result.entry_id;
          const dutyLineId = result.data?.duty_line_id || result.duty_line_id;
          const newShift = {
            id: `shift-${entryId}`,
            entryId: entryId,
            name: 'ADHOC',
            type: 'adhoc',
            start: start,
            end: end,
            duties: [{
              ...updatedDuty,
              id: dutyLineId
            }]
          };
          driver.shifts.push(newShift);
          driver.shifts.sort((a, b) => a.start - b.start);
          
          showToast('Adhoc duty created');
        } catch (err) {
          showToast(err.message || 'Failed to create adhoc duty', 'error');
          return;
        }
      } else {
        // Demo mode - local only
        const newShift = {
          id: `shift-adhoc-${Date.now()}`,
          name: `ADHOC ${String(Math.floor(Math.random() * 900) + 100)}`,
          type: 'adhoc',
          start: start,
          end: end,
          duties: [updatedDuty]
        };
        driver.shifts.push(newShift);
        driver.shifts.sort((a, b) => a.start - b.start);
        showToast('Adhoc duty created (demo mode)');
      }
      
      // Update driver status if they were available
      if (driver.status === 'available') {
        driver.status = 'working';
      }
    } else {
      // Add to existing shift - call API if in real mode
      if (dataSource === 'real' && editingDuty.shift.entryId) {
        try {
          const result = await apiRequest('/dispatch/create-duty-line', {
            method: 'POST',
            body: {
              roster_entry_id: editingDuty.shift.entryId,
              start_time: start,
              end_time: end,
              duty_type: type,
              description: description,
              vehicle_id: vehicle || null,
              pay_type: 'STD',
              location_name: locationName,
              location_lat: locationLat,
              location_lng: locationLng
            }
          });
          
          if (result.error) {
            showToast(result.error, 'error');
            return;
          }
          
          // Use the real ID from API
          updatedDuty.id = result.data?.id || result.duty_line_id;
        } catch (err) {
          showToast(err.message || 'Failed to create duty', 'error');
          return;
        }
      }
      
      editingDuty.shift.duties.push(updatedDuty);
      editingDuty.shift.duties.sort((a, b) => a.start - b.start);
      
      // Auto-extend shift boundaries to fit the new duty
      updateShiftBounds(editingDuty.shift);
      
      showToast('Duty added successfully');
    }
  } else {
    // Update existing duty - track old vehicle for sync
    const shift = driver.shifts.find(s => s.id === editingDuty.shiftId);
    const oldVehicle = shift.duties[editingDuty.dutyIdx].vehicle;
    
    // If vehicle changed, unsync from old vehicle
    if (oldVehicle && oldVehicle !== vehicle) {
      unsyncVehicleSchedule(oldVehicle, editingDuty.duty.id);
    }
    
    shift.duties[editingDuty.dutyIdx] = updatedDuty;
    shift.duties.sort((a, b) => a.start - b.start);
    
    // Auto-extend shift boundaries to fit the updated duty
    updateShiftBounds(shift);
    
    showToast('Duty updated successfully');
  }
  
  editingDuty = null;
  formErrors = {};
  
  // Sync vehicle assignment to vehicle's schedule
  if (vehicle) {
    syncVehicleSchedule(vehicle, updatedDuty, driver);
  }
  
  renderAll();
}

// Sync a duty's vehicle assignment to the vehicle's own schedule
function syncVehicleSchedule(vehicleId, duty, driver, shiftInfo = null) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  // Find the shift this duty belongs to
  let sourceShift = shiftInfo;
  if (!sourceShift) {
    for (const shift of driver.shifts) {
      if (shift.duties.some(d => d.id === duty.id)) {
        sourceShift = shift;
        break;
      }
    }
  }
  
  // Check if vehicle already has a shift that covers this time
  // Look for an existing synced shift for this driver AND shift
  let syncedShift = vehicle.shifts.find(s => 
    s.syncedDriverId === driver.id && 
    s.syncedShiftId === (sourceShift?.id || null) &&
    s.type !== 'maintenance'
  );
  
  if (!syncedShift) {
    // Create a new synced shift on the vehicle
    syncedShift = {
      id: `vshift-sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: sourceShift?.name || driver.name,
      type: 'synced',
      syncedDriverId: driver.id,
      syncedShiftId: sourceShift?.id || null,
      shiftType: sourceShift?.type || 'shift',
      start: duty.start,
      end: duty.end,
      duties: []
    };
    vehicle.shifts.push(syncedShift);
  }
  
  // Check if this duty already exists in the synced shift
  const existingDutyIdx = syncedShift.duties.findIndex(d => d.syncedDutyId === duty.id);
  
  const syncedDuty = {
    id: `vduty-sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    syncedDutyId: duty.id,
    type: duty.type,
    start: duty.start,
    end: duty.end,
    description: duty.description || `${driver.name}`,
    driver: driver.name
  };
  
  if (existingDutyIdx >= 0) {
    // Update existing
    syncedDuty.id = syncedShift.duties[existingDutyIdx].id;
    syncedShift.duties[existingDutyIdx] = syncedDuty;
  } else {
    // Add new
    syncedShift.duties.push(syncedDuty);
  }
  
  // Sort duties and update shift bounds
  syncedShift.duties.sort((a, b) => a.start - b.start);
  if (syncedShift.duties.length > 0) {
    syncedShift.start = Math.min(...syncedShift.duties.map(d => d.start));
    syncedShift.end = Math.max(...syncedShift.duties.map(d => d.end));
  }
  
  // Update vehicle status
  if (vehicle.status === 'available') {
    vehicle.status = 'inuse';
  }
}

// Remove a duty from vehicle's synced schedule
function unsyncVehicleSchedule(vehicleId, dutyId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  for (const shift of vehicle.shifts) {
    const dutyIdx = shift.duties.findIndex(d => d.syncedDutyId === dutyId);
    if (dutyIdx >= 0) {
      shift.duties.splice(dutyIdx, 1);
      
      // If shift is now empty, remove it
      if (shift.duties.length === 0 && shift.type === 'synced') {
        const shiftIdx = vehicle.shifts.indexOf(shift);
        vehicle.shifts.splice(shiftIdx, 1);
      } else {
        // Update shift bounds
        shift.start = Math.min(...shift.duties.map(d => d.start));
        shift.end = Math.max(...shift.duties.map(d => d.end));
      }
      break;
    }
  }
  
  // Update vehicle status if no more duties
  const hasActiveDuties = vehicle.shifts.some(s => s.type !== 'maintenance' && s.duties.length > 0);
  if (!hasActiveDuties) {
    vehicle.status = 'available';
  }
}

// Recalculate shift start/end to encompass all duties
function updateShiftBounds(shift) {
  if (!shift.duties || shift.duties.length === 0) return;
  
  // Only consider active (non-cancelled) duties for bounds
  const activeDuties = shift.duties.filter(d => !d.cancelled);
  if (activeDuties.length === 0) return;
  
  const minStart = Math.min(...activeDuties.map(d => d.start));
  const maxEnd = Math.max(...activeDuties.map(d => d.end));
  
  // Always update to actual bounds of active duties
  shift.start = minStart;
  shift.end = maxEnd;
}

function deleteDuty(driverId, shiftId, dutyIdx) {
  const driver = drivers.find(d => d.id === driverId);
  const shift = driver.shifts.find(s => s.id === shiftId);
  const duty = shift.duties[dutyIdx];
  
  // Unsync vehicle if assigned
  if (duty.vehicle) {
    unsyncVehicleSchedule(duty.vehicle, duty.id);
  }
  
  shift.duties.splice(dutyIdx, 1);
  showToast('Duty deleted');
  renderAll();
}

// ============================================
// DUTY CANCELLATION
// ============================================

let pendingCancelDuty = null;

function openCancelDutyModal(dutyId, driverId, shiftId, dutyIdx) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  const duty = shift.duties[dutyIdx];
  if (!duty) return;
  
  // Store pending cancel info
  pendingCancelDuty = { dutyId, driverId, shiftId, dutyIdx, duty };
  
  // Populate modal with duty info
  document.getElementById('cancelDutyInfo').innerHTML = `
    <div style="display: flex; gap: 16px; align-items: center;">
      <div class="duty-type-bar ${duty.type}" style="width: 4px; height: 40px; border-radius: 2px;"></div>
      <div>
        <div style="font-weight: 500; color: var(--text-primary);">${formatTimeCompact(duty.start)} - ${formatTimeCompact(duty.end)}</div>
        <div style="color: var(--text-secondary); font-size: 13px;">${duty.description}</div>
      </div>
    </div>
  `;
  
  document.getElementById('cancelDutyReason').value = '';
  document.getElementById('cancelDutyModalOverlay').classList.add('show');
}

function closeCancelDutyModal() {
  document.getElementById('cancelDutyModalOverlay').classList.remove('show');
  pendingCancelDuty = null;
}

async function cancelAllDuties(driverId, shiftId) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  // Get active (non-cancelled) duties
  const activeDuties = shift.duties.filter(d => !d.cancelled);
  if (activeDuties.length === 0) {
    showToast('All duties already cancelled', 'info');
    return;
  }
  
  if (!confirm(`Cancel all ${activeDuties.length} active duties in ${shift.name}?`)) {
    return;
  }
  
  let cancelled = 0;
  let failed = 0;
  
  for (const duty of activeDuties) {
    if (dataSource === 'real' && duty.id && !duty.id.startsWith('placeholder-') && !duty.id.startsWith('d-')) {
      try {
        const result = await apiRequest('/dispatch/cancel-duty-line', {
          method: 'POST',
          body: {
            duty_line_id: duty.id,
            reason: 'Bulk cancel'
          }
        });
        
        if (!result.error) {
          duty.cancelled = true;
          duty.cancelReason = 'Bulk cancel';
          duty.cancelledAt = new Date().toISOString();
          // Unsync from vehicle schedule
          if (duty.vehicle) {
            unsyncVehicleSchedule(duty.vehicle, duty.id);
          }
          cancelled++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    } else {
      // Demo mode
      duty.cancelled = true;
      duty.cancelReason = 'Bulk cancel';
      duty.cancelledAt = new Date().toISOString();
      // Unsync from vehicle schedule
      if (duty.vehicle) {
        unsyncVehicleSchedule(duty.vehicle, duty.id);
      }
      cancelled++;
    }
  }
  
  updateShiftBounds(shift);
  
  if (failed > 0) {
    showToast(`Cancelled ${cancelled} duties, ${failed} failed`, 'warning');
  } else {
    showToast(`All ${cancelled} duties cancelled`);
  }
  
  renderAll();
}

async function confirmCancelDuty() {
  if (!pendingCancelDuty) return;
  
  const { dutyId, driverId, shiftId, dutyIdx, duty } = pendingCancelDuty;
  const reason = document.getElementById('cancelDutyReason').value.trim() || null;
  
  // Call API to cancel
  if (dataSource === 'real' && dutyId && !dutyId.startsWith('placeholder-') && !dutyId.startsWith('d-')) {
    try {
      const result = await apiRequest('/dispatch/cancel-duty-line', {
        method: 'POST',
        body: {
          duty_line_id: dutyId,
          reason: reason
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      
      // Update local state
      duty.cancelled = true;
      duty.cancelReason = reason;
      duty.cancelledAt = new Date().toISOString();
      
      // Unsync from vehicle schedule
      if (duty.vehicle) {
        unsyncVehicleSchedule(duty.vehicle, duty.id);
      }
      
      // Recalculate shift bounds based on remaining active duties
      const driver = drivers.find(d => d.id === driverId);
      const shift = driver?.shifts.find(s => s.id === shiftId);
      if (shift) {
        updateShiftBounds(shift);
      }
      
      closeCancelDutyModal();
      showToast('Duty cancelled');
      renderAll();
    } catch (err) {
      showToast(err.message || 'Cancel failed', 'error');
    }
  } else {
    // Demo mode - just update local state
    duty.cancelled = true;
    duty.cancelReason = reason;
    duty.cancelledAt = new Date().toISOString();
    
    // Unsync from vehicle schedule
    if (duty.vehicle) {
      unsyncVehicleSchedule(duty.vehicle, duty.id);
    }
    
    const driver = drivers.find(d => d.id === driverId);
    const shift = driver?.shifts.find(s => s.id === shiftId);
    if (shift) {
      updateShiftBounds(shift);
    }
    
    closeCancelDutyModal();
    showToast('Duty cancelled (demo mode)');
    renderAll();
  }
}

async function reinstateDutyLine(dutyId, driverId, shiftId) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  const duty = shift.duties.find(d => d.id === dutyId);
  if (!duty) return;
  
  // Check for overlap with ALL active duties across ALL shifts for this driver
  for (const s of driver.shifts) {
    for (const d of s.duties) {
      if (d.id === duty.id) continue; // Skip self
      if (d.cancelled) continue; // Skip cancelled duties
      
      // Check for time overlap
      if (duty.start < d.end && duty.end > d.start) {
        showToast(`Cannot reinstate: overlaps with ${d.description || 'duty'} (${formatTimeCompact(d.start)}-${formatTimeCompact(d.end)})`, 'error');
        return;
      }
    }
  }
  
  // Call API to reinstate
  if (dataSource === 'real' && dutyId && !dutyId.startsWith('placeholder-') && !dutyId.startsWith('d-')) {
    try {
      const result = await apiRequest('/dispatch/reinstate-duty-line', {
        method: 'POST',
        body: {
          duty_line_id: dutyId
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      
      // Update local state
      duty.cancelled = false;
      duty.cancelReason = null;
      duty.cancelledAt = null;
      
      // Re-sync to vehicle schedule if vehicle assigned
      if (duty.vehicle) {
        syncVehicleSchedule(duty.vehicle, duty, driver, shift);
      }
      
      // Recalculate shift bounds
      updateShiftBounds(shift);
      
      showToast('Duty reinstated');
      renderAll();
    } catch (err) {
      showToast(err.message || 'Reinstate failed', 'error');
    }
  } else {
    // Demo mode - just update local state
    duty.cancelled = false;
    duty.cancelReason = null;
    duty.cancelledAt = null;
    
    // Re-sync to vehicle schedule if vehicle assigned
    if (duty.vehicle) {
      syncVehicleSchedule(duty.vehicle, duty, driver, shift);
    }
    
    updateShiftBounds(shift);
    
    showToast('Duty reinstated (demo mode)');
    renderAll();
  }
}

async function assignDriverToJob(jobIndex, driverIndex) {
  const job = unassignedJobs[jobIndex];
  const driver = drivers[driverIndex];
  
  // If real data mode, call API to persist
  if (dataSource === 'real' && job.entryId) {
    try {
      const result = await apiRequest('/dispatch/assign', {
        method: 'POST',
        body: {
          roster_entry_id: job.entryId,
          driver_id: driver.id
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      
      showToast(`${driver.name} assigned to ${job.name}`);
      selectedItem = null;  // Clear selection before reload
      await loadDispatchData();  // Reload from API
      return;
    } catch (err) {
      showToast(err.message || 'Assignment failed', 'error');
      return;
    }
  }
  
  // Fake data mode - just update local arrays
  const duties = job.duties.map(d => ({ ...d, vehicle: null }));
  
  driver.shifts.push({
    id: `shift-assigned-${Date.now()}`,
    name: job.name,
    type: job.type,
    start: job.start,
    end: job.end,
    duties: duties
  });
  driver.status = 'working';
  
  unassignedJobs.splice(jobIndex, 1);
  
  showToast(`${driver.name} assigned to ${job.name} — assign vehicles to duties`);
  selectedItem = { type: 'driver', index: driverIndex };
  renderAll();
}

function assignVehicleToJob(jobIndex, vehicleIndex) {
  const job = unassignedJobs[jobIndex];
  const vehicle = vehicles[vehicleIndex];
  
  // Use the job's pre-defined duties instead of generating new ones
  const duties = job.duties.map(d => ({ ...d, driver: null, driverId: null }));
  
  vehicle.shifts.push({
    id: `vshift-assigned-${Date.now()}`,
    name: job.name,
    type: job.type,
    start: job.start,
    end: job.end,
    duties: duties
  });
  vehicle.status = 'inuse';
  
  unassignedJobs.splice(jobIndex, 1);
  
  showToast(`${vehicle.rego} assigned to ${job.name} — assign drivers to duties`);
  selectedItem = { type: 'vehicle', index: vehicleIndex };
  renderAll();
}

// ============ TRANSFER & UNASSIGN FUNCTIONS ============

let transferringShift = null; // { type: 'driver'|'vehicle', sourceId, shiftIdx, shift }
let bulkAssigning = null; // { type: 'vehicle'|'driver', driverId?, vehicleId?, shiftId, shift, unassignedDuties }

// Driver shift transfer
function showTransferDriverShift(driverId, shiftIdx) {
  const driver = drivers.find(d => d.id === driverId);
  const shift = driver.shifts[shiftIdx];
  
  transferringShift = {
    type: 'driver',
    sourceId: driverId,
    shiftIdx: shiftIdx,
    shift: shift
  };
  
  renderDetailPanel();
}

async function executeTransferDriverShift(targetDriverId) {
  if (!transferringShift || transferringShift.type !== 'driver') return;
  
  const sourceDriver = drivers.find(d => d.id === transferringShift.sourceId);
  const targetDriver = drivers.find(d => d.id === targetDriverId);
  const shift = transferringShift.shift;
  
  // If real data mode, call API to persist
  if (dataSource === 'real' && shift.entryId) {
    try {
      const result = await apiRequest('/dispatch/transfer', {
        method: 'POST',
        body: {
          roster_entry_id: shift.entryId,
          to_driver_id: targetDriverId
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      
      showToast(`${shift.name} transferred to ${targetDriver.name}`);
      transferringShift = null;
      selectedItem = null;  // Clear selection before reload
      await loadDispatchData();  // Reload from API
      return;
    } catch (err) {
      showToast(err.message || 'Transfer failed', 'error');
      return;
    }
  }
  
  // Fake data mode - just update local arrays
  // Unsync all vehicle assignments before clearing them
  shift.duties.forEach(duty => {
    if (duty.vehicle) {
      unsyncVehicleSchedule(duty.vehicle, duty.id);
    }
  });
  
  // Remove from source
  sourceDriver.shifts.splice(transferringShift.shiftIdx, 1);
  if (sourceDriver.shifts.length === 0) {
    sourceDriver.status = 'available';
  }
  
  // Add to target (keep same duties but clear vehicle assignments)
  const newShift = {
    ...shift,
    id: `shift-transferred-${Date.now()}`,
    duties: shift.duties.map(d => ({ ...d, vehicle: null }))
  };
  targetDriver.shifts.push(newShift);
  targetDriver.shifts.sort((a, b) => a.start - b.start);
  targetDriver.status = 'working';
  
  showToast(`${shift.name} transferred to ${targetDriver.name}`);
  
  transferringShift = null;
  selectedItem = { type: 'driver', index: drivers.indexOf(targetDriver) };
  renderAll();
}

async function unassignDriverShift(driverId, shiftIdx) {
  const driver = drivers.find(d => d.id === driverId);
  const shift = driver.shifts[shiftIdx];
  
  // If real data mode, call API to persist
  if (dataSource === 'real' && shift.entryId) {
    try {
      const result = await apiRequest('/dispatch/unassign', {
        method: 'POST',
        body: {
          roster_entry_id: shift.entryId,
          unassign: 'driver'
        }
      });
      
      if (result.error) {
        showToast(result.error, 'error');
        return;
      }
      
      showToast(`${shift.name} moved to unassigned`);
      selectedItem = null;  // Clear selection before reload
      await loadDispatchData();  // Reload from API
      return;
    } catch (err) {
      showToast(err.message || 'Unassign failed', 'error');
      return;
    }
  }
  
  // Fake data mode - just update local arrays
  // Unsync all vehicle assignments from this shift
  shift.duties.forEach(duty => {
    if (duty.vehicle) {
      unsyncVehicleSchedule(duty.vehicle, duty.id);
    }
  });
  
  // Create unassigned job from shift
  const job = {
    id: `JOB-${Date.now()}`,
    name: shift.name,
    type: shift.type,
    start: shift.start,
    end: shift.end,
    depot: driver.depot,
    customer: shift.type === 'charter' ? 'Unassigned' : null,
    duties: shift.duties.map(d => ({ ...d, vehicle: null }))
  };
  
  unassignedJobs.push(job);
  
  // Remove from driver
  driver.shifts.splice(shiftIdx, 1);
  if (driver.shifts.length === 0) {
    driver.status = 'available';
  }
  
  showToast(`${shift.name} moved to unassigned`);
  renderAll();
}

// Vehicle shift transfer
function showTransferVehicleShift(vehicleId, shiftIdx) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  const shift = vehicle.shifts[shiftIdx];
  
  transferringShift = {
    type: 'vehicle',
    sourceId: vehicleId,
    shiftIdx: shiftIdx,
    shift: shift
  };
  
  renderDetailPanel();
}

function executeTransferVehicleShift(targetVehicleId) {
  if (!transferringShift || transferringShift.type !== 'vehicle') return;
  
  const sourceVehicle = vehicles.find(v => v.id === transferringShift.sourceId);
  const targetVehicle = vehicles.find(v => v.id === targetVehicleId);
  const shift = transferringShift.shift;
  
  // Remove from source
  sourceVehicle.shifts.splice(transferringShift.shiftIdx, 1);
  if (sourceVehicle.shifts.filter(s => s.type !== 'maintenance').length === 0) {
    sourceVehicle.status = 'available';
  }
  
  // Add to target (keep same duties but clear driver assignments)
  const newShift = {
    ...shift,
    id: `vshift-transferred-${Date.now()}`,
    duties: shift.duties.map(d => ({ ...d, driver: null, driverId: null }))
  };
  targetVehicle.shifts.push(newShift);
  targetVehicle.shifts.sort((a, b) => a.start - b.start);
  targetVehicle.status = 'inuse';
  
  showToast(`${shift.name} transferred to ${targetVehicle.id}`);
  
  transferringShift = null;
  selectedItem = { type: 'vehicle', index: vehicles.indexOf(targetVehicle) };
  renderAll();
}

function unassignVehicleShift(vehicleId, shiftIdx) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  const shift = vehicle.shifts[shiftIdx];
  
  // Create unassigned job from shift
  const job = {
    id: `JOB-${Date.now()}`,
    name: shift.name,
    type: shift.type,
    start: shift.start,
    end: shift.end,
    depot: vehicle.depot,
    customer: shift.type === 'charter' ? 'Unassigned' : null,
    duties: shift.duties.map(d => ({ ...d, driver: null, driverId: null }))
  };
  
  unassignedJobs.push(job);
  
  // Remove from vehicle
  vehicle.shifts.splice(shiftIdx, 1);
  if (vehicle.shifts.filter(s => s.type !== 'maintenance').length === 0) {
    vehicle.status = 'available';
  }
  
  showToast(`${shift.name} moved to unassigned`);
  renderAll();
}

function cancelTransfer() {
  transferringShift = null;
  renderDetailPanel();
}

// Bulk assign vehicle to all unassigned duties in a driver's shift
function showBulkAssignVehicle(driverId, shiftId) {
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  // Find duties that need a vehicle but don't have one
  const unassignedDuties = shift.duties.filter(d => 
    VEHICLE_REQUIRED_TYPES.includes(d.type) && !d.vehicle
  );
  
  if (unassignedDuties.length === 0) {
    showToast('All duties already have vehicles assigned');
    return;
  }
  
  bulkAssigning = {
    type: 'vehicle',
    driverId,
    shiftId,
    shift,
    unassignedDuties
  };
  
  renderDetailPanel();
}

function renderBulkAssignVehiclePanel() {
  if (!bulkAssigning || bulkAssigning.type !== 'vehicle') return '';
  
  // Find vehicles available for all the unassigned duty periods
  const availableVehicles = getVehiclesAvailableForDuties(bulkAssigning.unassignedDuties);
  
  return `
    <div class="bulk-assign-panel">
      <div class="bulk-assign-header">
        <span class="bulk-assign-title">Assign Vehicle to ${bulkAssigning.unassignedDuties.length} Duties</span>
        <button class="bulk-assign-close" onclick="cancelBulkAssign()">✕</button>
      </div>
      <div class="bulk-assign-info">
        Select a vehicle to assign to all unassigned duties in this shift.
        Only showing vehicles available for all time periods.
      </div>
      <div class="assignment-panel">
        <div class="assignment-search">
          <input type="text" class="assignment-search-input" id="bulkVehicleSearch" 
                 placeholder="Search vehicles..." oninput="updateBulkVehicleList()">
        </div>
        <div class="assignment-count" id="bulkVehicleCount">${availableVehicles.length} vehicle(s) available</div>
        <div class="assignment-list" id="bulkVehicleList"></div>
      </div>
    </div>
  `;
}

function updateBulkVehicleList() {
  if (!bulkAssigning || bulkAssigning.type !== 'vehicle') return;
  
  const search = document.getElementById('bulkVehicleSearch')?.value?.toLowerCase() || '';
  
  let availableVehicles = getVehiclesAvailableForDuties(bulkAssigning.unassignedDuties);
  
  if (search) {
    availableVehicles = availableVehicles.filter(v => 
      v.id.toLowerCase().includes(search) || 
      v.rego.toLowerCase().includes(search)
    );
  }
  
  const countEl = document.getElementById('bulkVehicleCount');
  if (countEl) {
    countEl.textContent = `${availableVehicles.length} vehicle(s) available for all ${bulkAssigning.unassignedDuties.length} duties`;
  }
  
  const listEl = document.getElementById('bulkVehicleList');
  if (listEl) {
    if (availableVehicles.length === 0) {
      listEl.innerHTML = '<div class="assignment-empty">No vehicles available for all time periods</div>';
    } else {
      listEl.innerHTML = availableVehicles.map(v => {
        const vehicleIdx = vehicles.indexOf(v);
        return `
        <div class="assignment-item">
          <div class="assignment-item-info">
            <span class="assignment-item-name clickable" onclick="navigateToResource('vehicle', ${vehicleIdx})">${v.rego}</span>
            <span class="assignment-item-detail">${v.capacity} seats</span>
          </div>
          <button class="assign-btn" onclick="executeBulkAssignVehicle('${v.id}')">Assign All</button>
        </div>
      `}).join('');
    }
  }
}

async function executeBulkAssignVehicle(vehicleId) {
  if (!bulkAssigning || bulkAssigning.type !== 'vehicle') return;
  
  const driver = drivers.find(d => d.id === bulkAssigning.driverId);
  if (!driver) return;
  
  const shift = driver.shifts.find(s => s.id === bulkAssigning.shiftId);
  if (!shift) return;
  
  const vehicle = vehicles.find(v => v.id === vehicleId);
  
  // Find duties that need vehicles (exclude cancelled)
  const dutiesToAssign = shift.duties.filter(duty => 
    VEHICLE_REQUIRED_TYPES.includes(duty.type) && !duty.vehicle && !duty.cancelled
  );
  
  if (dutiesToAssign.length === 0) {
    showToast('No duties to assign');
    bulkAssigning = null;
    return;
  }
  
  // Call API for each duty in real mode
  if (dataSource === 'real') {
    let succeeded = 0;
    let failed = 0;
    
    for (const duty of dutiesToAssign) {
      // Skip placeholder and demo duties
      if (!duty.id || duty.id.startsWith('placeholder-') || duty.id.startsWith('d-')) {
        duty.vehicle = vehicleId;
        duty.vehicleId = vehicleId;
        syncVehicleSchedule(vehicleId, duty, driver);
        succeeded++;
        continue;
      }
      
      try {
        let result;
        
        // If duty is from template, create a new roster duty line
        if (duty.isTemplate && shift.entryId) {
          result = await apiRequest('/dispatch/create-duty-line', {
            method: 'POST',
            body: {
              roster_entry_id: shift.entryId,
              start_time: duty.start,
              end_time: duty.end,
              duty_type: duty.type,
              description: duty.description,
              vehicle_id: vehicleId,
              pay_type: duty.payType || 'STD'
            }
          });
          // Update duty ID if new one was created
          if (result.data?.id) {
            duty.id = result.data.id;
            duty.isTemplate = false;
          }
        } else {
          // Update existing roster duty line
          result = await apiRequest('/dispatch/update-duty-line', {
            method: 'POST',
            body: {
              duty_line_id: duty.id,
              vehicle_id: vehicleId
            }
          });
        }
        
        if (!result.error) {
          duty.vehicle = vehicleId;
          duty.vehicleId = vehicleId;
          syncVehicleSchedule(vehicleId, duty, driver);
          succeeded++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
    }
    
    // Update vehicle status if needed
    if (vehicle && vehicle.status === 'available') {
      vehicle.status = 'inuse';
    }
    
    bulkAssigning = null;
    if (failed > 0) {
      showToast(`Assigned ${vehicle?.rego || vehicleId} to ${succeeded} duties, ${failed} failed`, 'warning');
    } else {
      showToast(`Assigned ${vehicle?.rego || vehicleId} to ${succeeded} duties`);
    }
    renderAll();
    return;
  }
  
  // Demo mode - Update local state
  dutiesToAssign.forEach(duty => {
    duty.vehicle = vehicleId;
    duty.vehicleId = vehicleId;
    syncVehicleSchedule(vehicleId, duty, driver);
  });
  
  // Update vehicle status if needed
  if (vehicle && vehicle.status === 'available') {
    vehicle.status = 'inuse';
  }
  
  bulkAssigning = null;
  showToast(`Assigned ${vehicle?.rego || vehicleId} to ${dutiesToAssign.length} duties`);
  renderAll();
}

// Bulk assign driver to all unassigned duties in a vehicle's shift
function showBulkAssignDriver(vehicleId, shiftId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  
  // Find duties that need a driver but don't have one
  const unassignedDuties = shift.duties.filter(d => 
    DRIVER_REQUIRED_TYPES.includes(d.type) && !d.driver
  );
  
  if (unassignedDuties.length === 0) {
    showToast('All duties already have drivers assigned');
    return;
  }
  
  bulkAssigning = {
    type: 'driver',
    vehicleId,
    shiftId,
    shift,
    unassignedDuties
  };
  
  renderDetailPanel();
}

function renderBulkAssignDriverPanel() {
  if (!bulkAssigning || bulkAssigning.type !== 'driver') return '';
  
  // Find drivers available for all the unassigned duty periods
  const availableDrivers = getDriversAvailableForDuties(bulkAssigning.unassignedDuties);
  
  return `
    <div class="bulk-assign-panel">
      <div class="bulk-assign-header">
        <span class="bulk-assign-title">Assign Driver to ${bulkAssigning.unassignedDuties.length} Duties</span>
        <button class="bulk-assign-close" onclick="cancelBulkAssign()">✕</button>
      </div>
      <div class="bulk-assign-info">
        Select a driver to assign to all unassigned duties in this shift.
        Only showing drivers available for all time periods.
      </div>
      <div class="assignment-panel">
        <div class="assignment-search">
          <input type="text" class="assignment-search-input" id="bulkDriverSearch" 
                 placeholder="Search drivers..." oninput="updateBulkDriverList()">
        </div>
        <div class="assignment-count" id="bulkDriverCount">${availableDrivers.length} driver(s) available</div>
        <div class="assignment-list" id="bulkDriverList"></div>
      </div>
    </div>
  `;
}

function updateBulkDriverList() {
  if (!bulkAssigning || bulkAssigning.type !== 'driver') return;
  
  const search = document.getElementById('bulkDriverSearch')?.value?.toLowerCase() || '';
  
  let availableDrivers = getDriversAvailableForDuties(bulkAssigning.unassignedDuties);
  
  if (search) {
    availableDrivers = availableDrivers.filter(d => 
      d.name.toLowerCase().includes(search) || 
      d.fullName.toLowerCase().includes(search) ||
      d.id.toLowerCase().includes(search)
    );
  }
  
  const countEl = document.getElementById('bulkDriverCount');
  if (countEl) {
    countEl.textContent = `${availableDrivers.length} driver(s) available for all ${bulkAssigning.unassignedDuties.length} duties`;
  }
  
  const listEl = document.getElementById('bulkDriverList');
  if (listEl) {
    if (availableDrivers.length === 0) {
      listEl.innerHTML = '<div class="assignment-empty">No drivers available for all time periods</div>';
    } else {
      listEl.innerHTML = availableDrivers.map(d => {
        const driverIdx = drivers.indexOf(d);
        return `
        <div class="assignment-item">
          <div class="assignment-item-info">
            <span class="assignment-item-name clickable" onclick="navigateToResource('driver', ${driverIdx})">${d.fullName}</span>
            <span class="assignment-item-detail">${d.id}</span>
          </div>
          <button class="assign-btn" onclick="executeBulkAssignDriver('${d.id}')">Assign All</button>
        </div>
      `}).join('');
    }
  }
}

function executeBulkAssignDriver(driverId) {
  if (!bulkAssigning || bulkAssigning.type !== 'driver') return;
  
  const vehicle = vehicles.find(v => v.id === bulkAssigning.vehicleId);
  if (!vehicle) return;
  
  const shift = vehicle.shifts.find(s => s.id === bulkAssigning.shiftId);
  if (!shift) return;
  
  const driver = drivers.find(d => d.id === driverId);
  if (!driver) return;
  
  let assignedCount = 0;
  
  // Assign driver to all unassigned duties
  shift.duties.forEach(duty => {
    if (DRIVER_REQUIRED_TYPES.includes(duty.type) && !duty.driver) {
      duty.driver = driver.name;
      duty.driverId = driver.id;
      assignedCount++;
    }
  });
  
  // Update driver status if needed
  if (driver.status === 'available') {
    driver.status = 'working';
  }
  
  bulkAssigning = null;
  showToast(`Assigned ${driver.name} to ${assignedCount} duties`);
  renderAll();
}

function cancelBulkAssign() {
  bulkAssigning = null;
  renderDetailPanel();
}

// Get vehicles available for all specified duty periods
function getVehiclesAvailableForDuties(duties) {
  return vehicles.filter(v => {
    if (v.status === 'maintenance') return false;
    
    // Check each duty period for conflicts with existing vehicle assignments
    for (const duty of duties) {
      if (!isVehicleAvailableForDuty(v.id, duty.start, duty.end)) {
        return false;
      }
    }
    
    return true;
  });
}

// Get drivers available for all specified duty periods
function getDriversAvailableForDuties(duties) {
  return drivers.filter(d => {
    if (d.status === 'leave') return false;
    
    // Check each duty period for conflicts
    for (const duty of duties) {
      const dutyStartMins = toMinutes(duty.start);
      const dutyEndMins = toMinutes(duty.end);
      
      // Check against all driver shifts
      for (const shift of d.shifts || []) {
        const shiftStartMins = toMinutes(shift.start);
        const shiftEndMins = toMinutes(shift.end);
        
        if (dutyStartMins < shiftEndMins && dutyEndMins > shiftStartMins) {
          return false; // Overlap found
        }
      }
    }
    
    return true;
  });
}

// Get drivers available for a specific time period (for transfer or multiple job assignment)
function getDriversAvailableForShift(shift, excludeDriverId = null) {
  return drivers.filter(d => {
    if (d.id === excludeDriverId) return false;
    if (d.status === 'leave') return false;
    
    // Check if driver has any overlapping shifts
    const shiftStartMins = toMinutes(shift.start);
    const shiftEndMins = toMinutes(shift.end);
    
    for (const existingShift of d.shifts) {
      const existingStartMins = toMinutes(existingShift.start);
      const existingEndMins = toMinutes(existingShift.end);
      
      if (shiftStartMins < existingEndMins && shiftEndMins > existingStartMins) {
        return false; // Overlap found
      }
    }
    
    return true;
  });
}

// Get vehicles available for a specific time period
function getVehiclesAvailableForShift(shift, excludeVehicleId = null) {
  return vehicles.filter(v => {
    if (v.id === excludeVehicleId) return false;
    if (v.status === 'maintenance') return false;
    
    // Check if vehicle has any overlapping shifts
    const shiftStartMins = toMinutes(shift.start);
    const shiftEndMins = toMinutes(shift.end);
    
    for (const existingShift of v.shifts) {
      if (existingShift.type === 'maintenance') continue;
      const existingStartMins = toMinutes(existingShift.start);
      const existingEndMins = toMinutes(existingShift.end);
      
      if (shiftStartMins < existingEndMins && shiftEndMins > existingStartMins) {
        return false; // Overlap found
      }
    }
    
    return true;
  });
}

function generateVehicleDutiesWithoutDrivers(shiftStart, shiftEnd, isCharter = false) {
  const duties = [];
  let currentTime = shiftStart;
  
  if (isCharter) {
    const pickupLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const destLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'dead', start: currentTime, end: currentTime + 0.5, description: `Dead run to ${pickupLoc}`, driver: null, driverId: null });
    currentTime += 0.5;
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: `Charter pickup`, driver: null, driverId: null });
    currentTime += 0.25;
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: currentTime + 1, description: `${pickupLoc} → ${destLoc}`, driver: null, driverId: null });
    currentTime += 1;
    
    if (shiftEnd - currentTime > 2) {
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'waiting', start: currentTime, end: shiftEnd - 1.25, description: `Waiting at ${destLoc}`, driver: null, driverId: null });
      currentTime = shiftEnd - 1.25;
    }
    
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: currentTime + 0.75, description: `Return to ${pickupLoc}`, driver: null, driverId: null });
    currentTime += 0.75;
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'dead', start: currentTime, end: shiftEnd, description: `Dead run to depot`, driver: null, driverId: null });
  } else {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    const totalDuration = shiftEnd - shiftStart;
    
    // Sign on, pre-trip
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Sign on, pre-trip', driver: null, driverId: null });
    currentTime += 0.25;
    
    // First drive
    const firstDriveEnd = currentTime + Math.min(2 + Math.random(), (shiftEnd - currentTime) / 2);
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: firstDriveEnd, description: `${route} - Outbound`, driver: null, driverId: null });
    currentTime = firstDriveEnd;
    
    // Turnaround
    duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Turnaround', driver: null, driverId: null });
    currentTime += 0.25;
    
    // Second drive
    const secondDriveEnd = currentTime + Math.min(2, shiftEnd - currentTime - 1.5);
    if (secondDriveEnd > currentTime + 0.5) {
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: secondDriveEnd, description: `${route} - Inbound`, driver: null, driverId: null });
      currentTime = secondDriveEnd;
    }
    
    // Meal break if shift is long enough
    if (totalDuration > 4 && currentTime < shiftEnd - 1.5) {
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'break', start: currentTime, end: currentTime + 0.5, description: 'Meal break', driver: null, driverId: null });
      currentTime += 0.5;
      
      // Final drive after break
      if (currentTime < shiftEnd - 0.5) {
        duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'driving', start: currentTime, end: shiftEnd - 0.25, description: `${route} - Final`, driver: null, driverId: null });
        currentTime = shiftEnd - 0.25;
      }
    }
    
    // Sign off
    if (currentTime < shiftEnd) {
      duties.push({ id: `vd-${Date.now()}-${Math.random()}`, type: 'oov', start: currentTime, end: shiftEnd, description: 'Sign off', driver: null, driverId: null });
    }
  }
  
  return duties;
}

// Vehicle-centric edit functions
function editVehicleDuty(vehicleId, shiftId, dutyIdx) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  const duty = shift.duties[dutyIdx];
  
  editingDuty = { 
    vehicleId, 
    shiftId, 
    dutyIdx, 
    duty: { ...duty }, 
    shift, 
    isNew: false,
    isVehicleCentric: true
  };
  formErrors = {};
  renderDetailPanel();
}

function deleteVehicleDuty(vehicleId, shiftId, dutyIdx) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  const shift = vehicle.shifts.find(s => s.id === shiftId);
  shift.duties.splice(dutyIdx, 1);
  showToast('Duty deleted');
  renderAll();
}

function showAddVehicleDutyForm(vehicleId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  if (!vehicle) return;
  
  const dayStart = 5;
  const dayEnd = 23;
  const allSlots = findAllAvailableVehicleSlots(vehicle, dayStart, dayEnd);
  
  if (allSlots.length === 0) {
    showToast('No available time slots today', true);
    return;
  }
  
  const firstSlot = allSlots[0];
  const duration = Math.min(0.5, firstSlot.end - firstSlot.start);
  
  const containingShift = vehicle.shifts.find(s => s.start <= firstSlot.start && s.end >= firstSlot.start + duration);
  
  editingDuty = {
    vehicleId, 
    shiftId: containingShift ? containingShift.id : null,
    dutyIdx: containingShift ? containingShift.duties.length : 0,
    duty: { 
      id: `vd-new-${Date.now()}`, 
      type: 'driving', 
      start: firstSlot.start, 
      end: firstSlot.start + duration, 
      description: 'New duty', 
      driver: null,
      driverId: null
    },
    shift: containingShift || null,
    isNew: true,
    isAdhoc: !containingShift,
    isVehicleCentric: true,
    allSlots: allSlots
  };
  formErrors = {};
  renderDetailPanel();
}

function findAllAvailableVehicleSlots(vehicle, dayStart, dayEnd, minDuration = 0.25) {
  const slots = [];
  const minDurationMins = toMinutes(minDuration);
  
  const occupiedPeriods = [];
  vehicle.shifts.forEach(shift => {
    shift.duties.forEach(duty => {
      occupiedPeriods.push({ start: duty.start, end: duty.end });
    });
  });
  
  occupiedPeriods.sort((a, b) => a.start - b.start);
  
  let currentTime = dayStart;
  
  for (const period of occupiedPeriods) {
    const gapMins = toMinutes(period.start) - toMinutes(currentTime);
    if (gapMins >= minDurationMins) {
      slots.push({ start: currentTime, end: period.start });
    }
    currentTime = Math.max(currentTime, period.end);
  }
  
  const endGapMins = toMinutes(dayEnd) - toMinutes(currentTime);
  if (endGapMins >= minDurationMins) {
    slots.push({ start: currentTime, end: dayEnd });
  }
  
  return slots;
}

function isDriverAvailableForPeriod(driver, start, end) {
  if (driver.status === 'leave') return false;
  
  const startMins = toMinutes(start);
  const endMins = toMinutes(end);
  
  for (const shift of driver.shifts) {
    for (const duty of shift.duties) {
      if (duty.cancelled) continue; // Skip cancelled duties
      const dStartMins = toMinutes(duty.start);
      const dEndMins = toMinutes(duty.end);
      if (dStartMins < endMins && dEndMins > startMins) {
        return false;
      }
    }
  }
  
  return true;
}

function getAvailableDriversForPeriod(start, end) {
  return drivers.filter(d => isDriverAvailableForPeriod(d, start, end));
}

function renderVehicleEditForm() {
  if (!editingDuty || !editingDuty.isVehicleCentric) return '';
  
  const duty = editingDuty.duty;
  const shift = editingDuty.shift;
  const isNew = editingDuty.isNew;
  const isAdhoc = editingDuty.isAdhoc;
  const needsDriver = DRIVER_REQUIRED_TYPES.includes(duty.type);
  
  const availableSlots = isNew ? (editingDuty.allSlots || []) : [];
  const availableDrivers = getAvailableDriversForPeriod(duty.start, duty.end);
  
  // Include currently assigned driver if editing
  const driverOptions = [...availableDrivers];
  if (duty.driverId && !driverOptions.find(d => d.id === duty.driverId)) {
    const existingDriver = drivers.find(d => d.id === duty.driverId);
    if (existingDriver) driverOptions.unshift(existingDriver);
  }
  
  const hasErrors = Object.keys(formErrors).length > 0;
  
  // Check if duty will extend shift bounds
  let shiftExtensionHint = '';
  if (shift && !isAdhoc) {
    const willExtendStart = duty.start < shift.start;
    const willExtendEnd = duty.end > shift.end;
    if (willExtendStart && willExtendEnd) {
      shiftExtensionHint = `ℹ️ Block will extend from ${formatTime(shift.start)}-${formatTime(shift.end)} to ${formatTime(duty.start)}-${formatTime(duty.end)}`;
    } else if (willExtendStart) {
      shiftExtensionHint = `ℹ️ Block start will extend from ${formatTime(shift.start)} to ${formatTime(duty.start)}`;
    } else if (willExtendEnd) {
      shiftExtensionHint = `ℹ️ Block end will extend from ${formatTime(shift.end)} to ${formatTime(duty.end)}`;
    }
  }
  
  return `
    <div class="edit-form">
      <div class="edit-form-title">
        ${isNew ? (isAdhoc ? '➕ Add Adhoc Duty' : '➕ Add New Duty') : '✏️ Edit Duty'}
        ${isAdhoc ? '<span style="font-size: 10px; color: var(--accent-amber); margin-left: 8px;">(Creates new block)</span>' : ''}
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start Time</label>
          <input type="text" class="form-input ${formErrors.time || formErrors.overlap ? 'error' : ''}" 
                 id="editStart" value="${formatTime(duty.start)}" 
                 placeholder="HH:MM" maxlength="5"
                 oninput="formatTimeInput(this)" onchange="onVehicleFormChange()">
        </div>
        <div class="form-group">
          <label class="form-label">End Time</label>
          <input type="text" class="form-input ${formErrors.time || formErrors.overlap ? 'error' : ''}" 
                 id="editEnd" value="${formatTime(duty.end)}" 
                 placeholder="HH:MM" maxlength="5"
                 oninput="formatTimeInput(this)" onchange="onVehicleFormChange()">
        </div>
      </div>
      
      ${formErrors.time ? `<div class="form-error">⚠️ ${formErrors.time}</div>` : ''}
      ${formErrors.overlap ? `<div class="form-error">⚠️ ${formErrors.overlap}</div>` : ''}
      ${shiftExtensionHint ? `<div class="form-hint" style="color: var(--accent-blue);">${shiftExtensionHint}</div>` : ''}
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Duty Type</label>
          <select class="form-select" id="editType" onchange="onVehicleFormChange()">
            ${Object.entries(DUTY_TYPES).map(([k, v]) => `
              <option value="${k}" ${duty.type === k ? 'selected' : ''}>${v.label} - ${v.name}</option>
            `).join('')}
          </select>
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Description</label>
          <input type="text" class="form-input" id="editDesc" value="${duty.description}" placeholder="Enter description...">
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Location <span style="font-size: 10px; color: var(--text-muted);">(optional - for smart assignment)</span></label>
          <div class="location-input-wrapper">
            <input type="text" class="form-input" id="editLocation" 
                   value="${duty.locationName || ''}" 
                   placeholder="Start typing to search or enter free text..."
                   oninput="onLocationInput('editLocation')"
                   onfocus="onLocationInput('editLocation')">
            <input type="hidden" id="editLocationLat" value="${duty.locationLat || ''}">
            <input type="hidden" id="editLocationLng" value="${duty.locationLng || ''}">
          </div>
          ${duty.locationLat && duty.locationLng ? 
            `<div class="location-coords">📍 ${Number(duty.locationLat).toFixed(4)}, ${Number(duty.locationLng).toFixed(4)}</div>` : 
            ''}
        </div>
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">
            Driver ${needsDriver ? '<span class="required">*</span>' : ''}
          </label>
          <select class="form-select ${formErrors.driver ? 'error' : ''}" id="editDriver" onchange="onVehicleFormChange()">
            <option value="">-- No Driver --</option>
            ${driverOptions.map(d => `
              <option value="${d.id}" ${duty.driverId === d.id ? 'selected' : ''}>${d.name} (${d.fullName})</option>
            `).join('')}
          </select>
          ${driverOptions.length === 0 && needsDriver ? 
            `<div class="form-hint">No drivers available for this time period</div>` : 
            `<div class="form-hint">${driverOptions.length} driver(s) available for ${formatTime(duty.start)}-${formatTime(duty.end)}</div>`
          }
        </div>
      </div>
      
      ${formErrors.driver ? `<div class="form-error">⚠️ ${formErrors.driver}</div>` : ''}
      
      ${isNew && availableSlots.length > 0 ? `
        <div class="available-slots">
          <div class="available-slots-label">📍 Available time slots:</div>
          <div class="slot-chips">
            ${availableSlots.map(s => `
              <span class="slot-chip" onclick="fillVehicleSlot(${s.start}, ${s.end})">${formatTime(s.start)} - ${formatTime(s.end)}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <div class="form-actions">
        <button class="form-btn cancel" onclick="cancelEdit()">Cancel</button>
        <button class="form-btn save" id="saveBtn" onclick="saveVehicleEdit()" ${hasErrors ? 'disabled' : ''}>
          ${isNew ? (isAdhoc ? 'Create Adhoc' : 'Add Duty') : 'Save Changes'}
        </button>
      </div>
    </div>
  `;
}

function fillVehicleSlot(start, end) {
  if (!editingDuty) return;
  
  const duration = Math.min(0.5, end - start);
  editingDuty.duty.start = start;
  editingDuty.duty.end = start + duration;
  
  const vehicle = vehicles.find(v => v.id === editingDuty.vehicleId);
  const containingShift = vehicle.shifts.find(s => s.start <= start && s.end >= start + duration);
  
  editingDuty.shift = containingShift || null;
  editingDuty.shiftId = containingShift ? containingShift.id : null;
  editingDuty.isAdhoc = !containingShift;
  
  formErrors = {};
  renderDetailPanel();
}

function onVehicleFormChange() {
  if (!editingDuty || !editingDuty.isVehicleCentric) return;
  
  const startStr = document.getElementById('editStart')?.value;
  const endStr = document.getElementById('editEnd')?.value;
  const type = document.getElementById('editType')?.value;
  const driverId = document.getElementById('editDriver')?.value || null;
  
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  
  const selectedDriver = driverId ? drivers.find(d => d.id === driverId) : null;
  
  editingDuty.duty.start = start;
  editingDuty.duty.end = end;
  editingDuty.duty.type = type;
  editingDuty.duty.driverId = driverId;
  editingDuty.duty.driver = selectedDriver ? selectedDriver.name : null;
  
  if (editingDuty.isNew) {
    const vehicle = vehicles.find(v => v.id === editingDuty.vehicleId);
    const containingShift = vehicle.shifts.find(s => s.start <= start && s.end >= end);
    editingDuty.shift = containingShift || null;
    editingDuty.shiftId = containingShift ? containingShift.id : null;
    editingDuty.isAdhoc = !containingShift;
  }
  
  // Validate
  const vehicle = vehicles.find(v => v.id === editingDuty.vehicleId);
  
  if (editingDuty.isAdhoc || !editingDuty.shift) {
    const allDuties = vehicle.shifts.flatMap(s => s.duties);
    // Exclude current duty from overlap check
    formErrors = validateVehicleDutyForm({ start, end, type, driverId }, allDuties, editingDuty.duty.id);
  } else {
    // Always exclude the duty being edited
    const excludeId = editingDuty.duty.id;
    formErrors = validateVehicleDutyFormInShift(
      { start, end, type, driverId }, 
      editingDuty.shift.duties, 
      editingDuty.shift.start, 
      editingDuty.shift.end, 
      excludeId
    );
  }
  
  renderDetailPanel();
}

function validateVehicleDutyForm(data, allDuties, excludeId = null) {
  const errors = {};
  
  if (isNaN(data.start) || isNaN(data.end)) {
    errors.time = 'Invalid time format (use HH:MM or HHMM, e.g., 07:30 or 0730)';
    return errors;
  }
  
  if (data.start < 0 || data.start > 24 || data.end < 0 || data.end > 24) {
    errors.time = 'Time must be between 00:00 and 24:00';
    return errors;
  }
  
  const startMins = toMinutes(data.start);
  const endMins = toMinutes(data.end);
  
  if (startMins >= endMins) {
    errors.time = 'End time must be after start time';
    return errors;
  }
  
  const overlap = allDuties.find(d => {
    if (excludeId && d.id === excludeId) return false; // Skip the duty being edited
    const dStartMins = toMinutes(d.start);
    const dEndMins = toMinutes(d.end);
    return (startMins < dEndMins && endMins > dStartMins);
  });
  
  if (overlap) {
    errors.overlap = `Overlaps with duty at ${formatTime(overlap.start)}-${formatTime(overlap.end)}`;
  }
  
  // Driver is optional for all duty types
  
  return errors;
}

function validateVehicleDutyFormInShift(data, duties, shiftStart, shiftEnd, excludeId) {
  const errors = {};
  
  if (isNaN(data.start) || isNaN(data.end)) {
    errors.time = 'Invalid time format (use HH:MM or HHMM, e.g., 07:30 or 0730)';
    return errors;
  }
  
  if (data.start < 0 || data.start > 24 || data.end < 0 || data.end > 24) {
    errors.time = 'Time must be between 00:00 and 24:00';
    return errors;
  }
  
  const startMins = toMinutes(data.start);
  const endMins = toMinutes(data.end);
  
  if (startMins >= endMins) {
    errors.time = 'End time must be after start time';
    return errors;
  }
  
  // No longer enforce shift boundaries - shift will auto-extend to fit duties
  
  const overlap = duties.find(d => {
    if (d.id === excludeId) return false;
    const dStartMins = toMinutes(d.start);
    const dEndMins = toMinutes(d.end);
    return (startMins < dEndMins && endMins > dStartMins);
  });
  
  if (overlap) {
    errors.overlap = `Overlaps with duty at ${formatTime(overlap.start)}-${formatTime(overlap.end)}`;
  }
  
  // Driver is optional for all duty types
  
  return errors;
}

function saveVehicleEdit() {
  if (!editingDuty || !editingDuty.isVehicleCentric) return;
  
  const startStr = document.getElementById('editStart')?.value;
  const endStr = document.getElementById('editEnd')?.value;
  const type = document.getElementById('editType')?.value;
  const driverId = document.getElementById('editDriver')?.value || null;
  const description = document.getElementById('editDesc')?.value || '';
  const locationName = document.getElementById('editLocation')?.value || null;
  const locationLat = parseFloat(document.getElementById('editLocationLat')?.value) || null;
  const locationLng = parseFloat(document.getElementById('editLocationLng')?.value) || null;
  
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  
  const selectedDriver = driverId ? drivers.find(d => d.id === driverId) : null;
  
  const vehicle = vehicles.find(v => v.id === editingDuty.vehicleId);
  
  // Final validation
  if (editingDuty.isAdhoc || !editingDuty.shift) {
    const allDuties = vehicle.shifts.flatMap(s => s.duties);
    // Exclude current duty from overlap check
    formErrors = validateVehicleDutyForm({ start, end, type, driverId }, allDuties, editingDuty.duty.id);
  } else {
    // Always exclude the duty being edited
    const excludeId = editingDuty.duty.id;
    formErrors = validateVehicleDutyFormInShift(
      { start, end, type, driverId }, 
      editingDuty.shift.duties, 
      editingDuty.shift.start, 
      editingDuty.shift.end, 
      excludeId
    );
  }
  
  if (Object.keys(formErrors).length > 0) {
    renderDetailPanel();
    return;
  }
  
  const updatedDuty = { 
    id: editingDuty.duty.id, 
    type, 
    start, 
    end, 
    description, 
    driver: selectedDriver ? selectedDriver.name : null,
    driverId: driverId,
    locationName,
    locationLat,
    locationLng
  };
  
  if (editingDuty.isNew) {
    if (editingDuty.isAdhoc || !editingDuty.shift) {
      const newShift = {
        id: `vshift-adhoc-${Date.now()}`,
        name: `ADHOC ${String(Math.floor(Math.random() * 900) + 100)}`,
        type: 'adhoc',
        start: start,
        end: end,
        duties: [updatedDuty]
      };
      vehicle.shifts.push(newShift);
      vehicle.shifts.sort((a, b) => a.start - b.start);
      
      if (vehicle.status === 'available') {
        vehicle.status = 'inuse';
      }
      
      showToast('Adhoc duty created');
    } else {
      editingDuty.shift.duties.push(updatedDuty);
      editingDuty.shift.duties.sort((a, b) => a.start - b.start);
      
      // Auto-extend shift boundaries to fit the new duty
      updateShiftBounds(editingDuty.shift);
      
      showToast('Duty added successfully');
    }
  } else {
    const shift = vehicle.shifts.find(s => s.id === editingDuty.shiftId);
    shift.duties[editingDuty.dutyIdx] = updatedDuty;
    shift.duties.sort((a, b) => a.start - b.start);
    
    // Auto-extend shift boundaries to fit the updated duty
    updateShiftBounds(shift);
    
    showToast('Duty updated successfully');
  }
  
  editingDuty = null;
  formErrors = {};
  
  renderAll();
}

function generateDutiesWithoutVehicles(shiftStart, shiftEnd, isCharter = false) {
  const duties = [];
  let currentTime = shiftStart;
  
  if (isCharter) {
    const pickupLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const destLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    
    duties.push({ id: `d-${Date.now()}-1`, type: 'dead', start: currentTime, end: currentTime + 0.5, description: `Dead run to ${pickupLoc}`, vehicle: null });
    currentTime += 0.5;
    duties.push({ id: `d-${Date.now()}-2`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: `Charter pickup`, vehicle: null });
    currentTime += 0.25;
    duties.push({ id: `d-${Date.now()}-3`, type: 'driving', start: currentTime, end: currentTime + 1, description: `${pickupLoc} → ${destLoc}`, vehicle: null });
    currentTime += 1;
    
    if (shiftEnd - currentTime > 2) {
      duties.push({ id: `d-${Date.now()}-4`, type: 'waiting', start: currentTime, end: shiftEnd - 1.25, description: `Waiting at ${destLoc}`, vehicle: null });
      currentTime = shiftEnd - 1.25;
    }
    
    duties.push({ id: `d-${Date.now()}-5`, type: 'driving', start: currentTime, end: currentTime + 0.75, description: `Return to ${pickupLoc}`, vehicle: null });
    currentTime += 0.75;
    duties.push({ id: `d-${Date.now()}-6`, type: 'dead', start: currentTime, end: shiftEnd, description: `Dead run to depot`, vehicle: null });
  } else {
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    const totalDuration = shiftEnd - shiftStart;
    
    duties.push({ id: `d-${Date.now()}-1`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Sign on, pre-trip', vehicle: null });
    currentTime += 0.25;
    
    const firstDriveEnd = currentTime + Math.min(2 + Math.random(), (shiftEnd - currentTime) / 2);
    duties.push({ id: `d-${Date.now()}-2`, type: 'driving', start: currentTime, end: firstDriveEnd, description: `${route} - Outbound`, vehicle: null });
    currentTime = firstDriveEnd;
    
    duties.push({ id: `d-${Date.now()}-3`, type: 'oov', start: currentTime, end: currentTime + 0.25, description: 'Turnaround', vehicle: null });
    currentTime += 0.25;
    
    const secondDriveEnd = currentTime + Math.min(2, shiftEnd - currentTime - 1.5);
    if (secondDriveEnd > currentTime + 0.5) {
      duties.push({ id: `d-${Date.now()}-4`, type: 'driving', start: currentTime, end: secondDriveEnd, description: `${route} - Inbound`, vehicle: null });
      currentTime = secondDriveEnd;
    }
    
    if (totalDuration > 4 && currentTime < shiftEnd - 1.5) {
      duties.push({ id: `d-${Date.now()}-5`, type: 'break', start: currentTime, end: currentTime + 0.5, description: 'Meal break', vehicle: null });
      currentTime += 0.5;
      
      if (currentTime < shiftEnd - 0.5) {
        duties.push({ id: `d-${Date.now()}-6`, type: 'driving', start: currentTime, end: shiftEnd - 0.25, description: `${route} - Final`, vehicle: null });
        currentTime = shiftEnd - 0.25;
      }
    }
    
    if (currentTime < shiftEnd) {
      duties.push({ id: `d-${Date.now()}-7`, type: 'oov', start: currentTime, end: shiftEnd, description: 'Sign off', vehicle: null });
    }
  }
  
  return duties;
}

// ========================================
// AI ASSISTANT
// ========================================

let aiConversation = [];

function toggleAIAssistant() {
  const modal = document.getElementById('aiAssistant');
  const overlay = document.getElementById('aiModalOverlay');
  const isOpen = modal.classList.contains('show');
  
  modal.classList.toggle('show');
  overlay.classList.toggle('show');
  
  if (!isOpen) {
    document.getElementById('aiInput').focus();
  }
}

function getDispatchContext() {
  // Summarize current state for the AI
  const workingDrivers = drivers.filter(d => d.status === 'working');
  const availableDrivers = drivers.filter(d => d.status === 'available');
  const onLeaveDrivers = drivers.filter(d => d.status === 'leave');
  
  const inUseVehicles = vehicles.filter(v => v.status === 'inuse');
  const availableVehicles = vehicles.filter(v => v.status === 'available');
  const maintVehicles = vehicles.filter(v => v.status === 'maintenance');
  
  // Get some driver details
  const driverSummary = drivers.slice(0, 20).map(d => ({
    id: d.id,
    name: d.fullName || d.name,
    status: d.status,
    shifts: d.shifts.map(s => ({
      name: s.name,
      time: `${formatTime(s.start)}-${formatTime(s.end)}`,
      duties: s.duties.length
    }))
  }));
  
  // Get vehicle details
  const vehicleSummary = vehicles.slice(0, 20).map(v => ({
    id: v.id,
    rego: v.rego,
    capacity: v.capacity,
    status: v.status
  }));
  
  return {
    date: formatDate(currentDate),
    summary: {
      drivers: {
        total: drivers.length,
        working: workingDrivers.length,
        available: availableDrivers.length,
        onLeave: onLeaveDrivers.length
      },
      vehicles: {
        total: vehicles.length,
        inUse: inUseVehicles.length,
        available: availableVehicles.length,
        maintenance: maintVehicles.length
      },
      unassignedJobs: unassignedJobs.length
    },
    drivers: driverSummary,
    vehicles: vehicleSummary,
    unassignedJobs: unassignedJobs.map(j => ({
      id: j.id,
      name: j.name,
      time: `${formatTime(j.start)}-${formatTime(j.end)}`,
      type: j.type
    }))
  };
}

async function sendAIQuery() {
  const input = document.getElementById('aiInput');
  const query = input.value.trim();
  
  if (!query) return;
  
  input.value = '';
  input.disabled = true;
  document.querySelector('.ai-send').disabled = true;
  
  // Add user message
  addAIMessage(query, 'user');
  
  // Add loading indicator
  const loadingId = addAIMessage('', 'loading');
  
  try {
    const context = getDispatchContext();
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are Batman - the dispatch assistant. You watch over the fleet from the shadows. You help dispatchers with queries about drivers, vehicles, shifts, and scheduling.

Current dispatch data:
${JSON.stringify(context, null, 2)}

Guidelines:
- Be concise and practical - dispatchers are busy
- Occasionally use subtle Batman references (Gotham, "I'm Batman", the night, etc.) but don't overdo it
- Use Australian English (e.g., "G'day", "arvo", "rego")
- Reference specific driver names, vehicle IDs, and times when relevant
- If asked about availability, check the status fields and shift times
- Format times in 24-hour format
- If you can't find specific data, say so
- Don't make up information that isn't in the context`,
        messages: [
          ...aiConversation,
          { role: 'user', content: query }
        ]
      })
    });
    
    const data = await response.json();
    
    // Remove loading indicator
    removeAIMessage(loadingId);
    
    if (data.content && data.content[0]) {
      const reply = data.content[0].text;
      addAIMessage(reply, 'assistant');
      
      // Update conversation history (keep last 10 messages)
      aiConversation.push({ role: 'user', content: query });
      aiConversation.push({ role: 'assistant', content: reply });
      if (aiConversation.length > 20) {
        aiConversation = aiConversation.slice(-20);
      }
    } else if (data.error) {
      addAIMessage(`Error: ${data.error.message}`, 'assistant');
    }
  } catch (error) {
    removeAIMessage(loadingId);
    addAIMessage(`Sorry, I couldn't process that request. Error: ${error.message}`, 'assistant');
  }
  
  input.disabled = false;
  document.querySelector('.ai-send').disabled = false;
  input.focus();
}

function addAIMessage(content, type) {
  const container = document.getElementById('aiMessages');
  const id = `ai-msg-${Date.now()}`;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-message ${type}`;
  msgDiv.id = id;
  
  if (type === 'loading') {
    msgDiv.innerHTML = `
      <div class="ai-message-content">
        <div class="ai-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  } else {
    // Convert markdown-style lists and formatting to HTML
    let formattedContent = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n- /g, '<br>• ')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
    
    msgDiv.innerHTML = `<div class="ai-message-content">${formattedContent}</div>`;
  }
  
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  
  return id;
}

function removeAIMessage(id) {
  const msg = document.getElementById(id);
  if (msg) msg.remove();
}


// ============================================
// DISPATCH TOGGLE FUNCTIONS
// ============================================

async function toggleBlockDispatch(blockId, shiftId, include) {
  try {
    const result = await apiRequest('/roster/toggle-dispatch', {
      method: 'POST',
      body: {
        roster_id: currentRosterId,
        duty_block_id: blockId,
        shift_template_id: shiftId,
        date: formatDateISO(currentRosterDate),
        include: include
      }
    });
    
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    showToast(include ? 'Block included in dispatch' : 'Block omitted from dispatch');
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Toggle failed', 'error');
  }
}

async function toggleDayDispatch(include) {
  try {
    const result = await apiRequest('/roster/toggle-dispatch-day', {
      method: 'POST',
      body: {
        roster_id: currentRosterId,
        date: formatDateISO(currentRosterDate),
        include: include
      }
    });
    
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    showToast(result.message || (include ? 'All included' : 'All omitted'));
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Toggle failed', 'error');
  }
}

async function toggleRosterDispatch(include) {
  if (!confirm(`This will ${include ? 'include' : 'omit'} ALL unassigned blocks for the ENTIRE roster period. Continue?`)) {
    return;
  }
  
  try {
    showToast('Processing...', 'info');
    
    const result = await apiRequest('/roster/toggle-dispatch-all', {
      method: 'POST',
      body: {
        roster_id: currentRosterId,
        include: include
      }
    });
    
    if (result.error) {
      showToast(result.error, 'error');
      return;
    }
    
    showToast(result.message || (include ? 'All included' : 'All omitted'), 'success');
    await loadDayView();
  } catch (err) {
    showToast(err.message || 'Toggle failed', 'error');
  }
}

function showBlockInfo(blockId) {
  if (!dayViewData) return;
  const allBlocks = [...dayViewData.unassigned, ...Object.values(dayViewData.by_driver).flat()];
  const block = allBlocks.find(b => b.id === blockId);
  if (block) {
    showToast(`${block.shift_code} / ${block.block_name}: ${formatDecimalTime(block.start_time)} - ${formatDecimalTime(block.end_time)}`);
  }
}

// ============================================
// CONNECTED BLOCKS MODAL
// ============================================

function showConnectedModal() {
  document.getElementById('connectedModalOverlay').classList.add('show');
}

function closeConnectedModal() {
  document.getElementById('connectedModalOverlay').classList.remove('show');
  pendingAssignment = null;
}

async function confirmConnected(includeAll) {
  if (!pendingAssignment) return;
  const { blockId, shiftId, driverId } = pendingAssignment;
  closeConnectedModal();
  await doAssign(blockId, shiftId, driverId, includeAll);
}


// ============================================
// DISPATCH COMMIT FUNCTIONALITY
// ============================================

let currentCommitStatus = null;

async function loadCommitStatus() {
  try {
    const dateStr = formatDateISO(currentDate);
    const result = await apiRequest(`/dispatch/commit-status/${dateStr}`);
    currentCommitStatus = result.data;
    updateCommitUI();
  } catch (err) {
    console.warn('Failed to load commit status:', err);
    currentCommitStatus = null;
    updateCommitUI();
  }
}

function updateCommitUI() {
  const indicator = document.getElementById('commitIndicator');
  const statusText = document.getElementById('commitStatusText');
  const btnCommit = document.getElementById('btnCommitDay');
  const btnUncommit = document.getElementById('btnUncommit');
  
  if (!indicator || !statusText) return;
  
  if (!currentCommitStatus) {
    indicator.className = 'commit-indicator';
    statusText.textContent = 'Not committed';
    if (btnCommit) btnCommit.style.display = '';
    if (btnUncommit) btnUncommit.style.display = 'none';
    return;
  }
  
  if (currentCommitStatus.is_fully_committed) {
    indicator.className = 'commit-indicator committed';
    const commitTime = new Date(currentCommitStatus.all_commit.committed_at).toLocaleTimeString();
    statusText.textContent = `Committed at ${commitTime}`;
    if (btnCommit) btnCommit.style.display = 'none';
    if (btnUncommit) btnUncommit.style.display = '';
  } else if (currentCommitStatus.committed_employee_ids?.length > 0) {
    indicator.className = 'commit-indicator partial';
    statusText.textContent = `${currentCommitStatus.committed_employee_ids.length} driver(s) committed`;
    if (btnCommit) btnCommit.style.display = '';
    if (btnUncommit) btnUncommit.style.display = '';
  } else {
    indicator.className = 'commit-indicator';
    statusText.textContent = 'Not committed';
    if (btnCommit) btnCommit.style.display = '';
    if (btnUncommit) btnUncommit.style.display = 'none';
  }
}

function showCommitModal() {
  // Populate driver dropdown
  const driverSelect = document.getElementById('commitDriver');
  if (driverSelect && drivers) {
    const workingDrivers = drivers.filter(d => d.status === 'working');
    driverSelect.innerHTML = '<option value="">-- Select Driver --</option>' +
      workingDrivers.map(d => `<option value="${d.id}">${d.fullName}</option>`).join('');
  }
  
  // Reset form
  document.getElementById('commitScope').value = 'all';
  document.getElementById('commitDriverSelect').style.display = 'none';
  document.getElementById('commitNotes').value = '';
  
  updateCommitPreview();
  document.getElementById('commitModalOverlay').classList.add('show');
}

function closeCommitModal() {
  document.getElementById('commitModalOverlay').classList.remove('show');
}

function updateCommitPreview() {
  const scope = document.getElementById('commitScope').value;
  const driverSelectDiv = document.getElementById('commitDriverSelect');
  const previewContent = document.getElementById('commitPreviewContent');
  
  // Show/hide driver dropdown
  driverSelectDiv.style.display = scope === 'individual' ? 'block' : 'none';
  
  // Calculate preview
  if (scope === 'all') {
    const workingDrivers = drivers ? drivers.filter(d => d.status === 'working') : [];
    let totalHours = 0;
    let totalDuties = 0;
    
    workingDrivers.forEach(driver => {
      (driver.shifts || []).forEach(shift => {
        (shift.duties || []).forEach(duty => {
          totalDuties++;
          totalHours += (duty.end - duty.start);
        });
      });
    });
    
    previewContent.innerHTML = `
      <div class="commit-preview-item">
        <span>Drivers</span>
        <span>${workingDrivers.length}</span>
      </div>
      <div class="commit-preview-item">
        <span>Duty lines</span>
        <span>${totalDuties}</span>
      </div>
      <div class="commit-preview-item commit-preview-total">
        <span>Total hours</span>
        <span>${totalHours.toFixed(1)}</span>
      </div>
    `;
  } else {
    previewContent.innerHTML = `
      <div style="color: var(--text-muted); font-size: 13px;">
        Select a driver to see preview
      </div>
    `;
    
    const driverId = document.getElementById('commitDriver').value;
    if (driverId) {
      const driver = drivers.find(d => d.id === driverId);
      if (driver) {
        let totalHours = 0;
        let totalDuties = 0;
        
        (driver.shifts || []).forEach(shift => {
          (shift.duties || []).forEach(duty => {
            totalDuties++;
            totalHours += (duty.end - duty.start);
          });
        });
        
        previewContent.innerHTML = `
          <div class="commit-preview-item">
            <span>Driver</span>
            <span>${driver.fullName}</span>
          </div>
          <div class="commit-preview-item">
            <span>Duty lines</span>
            <span>${totalDuties}</span>
          </div>
          <div class="commit-preview-item commit-preview-total">
            <span>Total hours</span>
            <span>${totalHours.toFixed(1)}</span>
          </div>
        `;
      }
    }
  }
}

async function executeCommit() {
  const scope = document.getElementById('commitScope').value;
  const notes = document.getElementById('commitNotes').value;
  const dateStr = formatDateISO(currentDate);
  
  const payload = {
    date: dateStr,
    scope: scope,
    notes: notes || null
  };
  
  if (scope === 'individual') {
    const driverId = document.getElementById('commitDriver').value;
    if (!driverId) {
      showToast('Please select a driver', 'error');
      return;
    }
    payload.employee_id = driverId;
  }
  
  try {
    const result = await apiRequest('/dispatch/commit', { method: 'POST', body: payload });
    closeCommitModal();
    showToast(`Day committed - ${result.data.pay_records_created} pay records created`, 'success');
    await loadCommitStatus();
  } catch (err) {
    showToast(err.message || 'Failed to commit', 'error');
  }
}

async function uncommitDay() {
  if (!currentCommitStatus) return;
  
  let commitToRemove = null;
  
  if (currentCommitStatus.is_fully_committed) {
    commitToRemove = currentCommitStatus.all_commit;
  } else if (currentCommitStatus.individual_commits?.length === 1) {
    commitToRemove = currentCommitStatus.individual_commits[0];
  } else if (currentCommitStatus.individual_commits?.length > 1) {
    // Multiple individual commits - need to pick which one
    showToast('Multiple individual commits exist. Please use the employee pay records to manage.', 'info');
    return;
  }
  
  if (!commitToRemove) {
    showToast('No commit found to remove', 'error');
    return;
  }
  
  if (!confirm('Are you sure you want to uncommit? This will remove generated pay records.')) {
    return;
  }
  
  try {
    await apiRequest(`/dispatch/commit/${commitToRemove.id}`, { method: 'DELETE' });
    showToast('Day uncommitted', 'success');
    await loadCommitStatus();
  } catch (err) {
    showToast(err.message || 'Failed to uncommit', 'error');
  }
}

// Commit status is now loaded with main dispatch data
