/**
 * API Client
 * Handles all communication with the backend
 */

// API base URL - change for production
const API_BASE = 'https://dispatch-api.oliveri-john001.workers.dev/api';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  }

  // GET request
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  // POST request
  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  }

  // PUT request
  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  }

  // DELETE request
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // ============================================
  // EMPLOYEES
  // ============================================
  
  getEmployees(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.get(`/employees${query ? '?' + query : ''}`);
  }

  getEmployee(id) {
    return this.get(`/employees/${id}`);
  }

  createEmployee(data) {
    return this.post('/employees', data);
  }

  updateEmployee(id, data) {
    return this.put(`/employees/${id}`, data);
  }

  deleteEmployee(id) {
    return this.delete(`/employees/${id}`);
  }

  getEmployeeStatus(id, date) {
    return this.get(`/employees/${id}/status/${date}`);
  }

  setEmployeeStatus(id, date, data) {
    return this.put(`/employees/${id}/status/${date}`, data);
  }

  // ============================================
  // VEHICLES
  // ============================================
  
  getVehicles(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.get(`/vehicles${query ? '?' + query : ''}`);
  }

  getVehicle(id) {
    return this.get(`/vehicles/${id}`);
  }

  createVehicle(data) {
    return this.post('/vehicles', data);
  }

  updateVehicle(id, data) {
    return this.put(`/vehicles/${id}`, data);
  }

  deleteVehicle(id) {
    return this.delete(`/vehicles/${id}`);
  }

  getVehicleStatus(id, date) {
    return this.get(`/vehicles/${id}/status/${date}`);
  }

  setVehicleStatus(id, date, data) {
    return this.put(`/vehicles/${id}/status/${date}`, data);
  }

  // ============================================
  // SHIFT TEMPLATES
  // ============================================
  
  getShiftTemplates(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.get(`/shifts${query ? '?' + query : ''}`);
  }

  getShiftTemplate(id) {
    return this.get(`/shifts/${id}`);
  }

  createShiftTemplate(data) {
    return this.post('/shifts', data);
  }

  updateShiftTemplate(id, data) {
    return this.put(`/shifts/${id}`, data);
  }

  deleteShiftTemplate(id) {
    return this.delete(`/shifts/${id}`);
  }

  addShiftDuty(templateId, data) {
    return this.post(`/shifts/${templateId}/duties`, data);
  }

  updateShiftDuty(templateId, dutyId, data) {
    return this.put(`/shifts/${templateId}/duties/${dutyId}`, data);
  }

  deleteShiftDuty(templateId, dutyId) {
    return this.delete(`/shifts/${templateId}/duties/${dutyId}`);
  }

  duplicateShiftTemplate(id) {
    return this.post(`/shifts/${id}/duplicate`);
  }

  // ============================================
  // ROSTER
  // ============================================
  
  getRosterEntries(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.get(`/roster${query ? '?' + query : ''}`);
  }

  getRosterByDate(date) {
    return this.get(`/roster/date/${date}`);
  }

  getRosterWeek(date) {
    return this.get(`/roster/week/${date}`);
  }

  getRosterMonth(year, month) {
    return this.get(`/roster/month/${year}/${month}`);
  }

  getRosterEntry(id) {
    return this.get(`/roster/${id}`);
  }

  createRosterEntry(data) {
    return this.post('/roster', data);
  }

  updateRosterEntry(id, data) {
    return this.put(`/roster/${id}`, data);
  }

  deleteRosterEntry(id) {
    return this.delete(`/roster/${id}`);
  }

  assignRosterEntry(id, data) {
    return this.put(`/roster/${id}/assign`, data);
  }

  copyRosterDay(data) {
    return this.post('/roster/copy-day', data);
  }

  copyRosterWeek(data) {
    return this.post('/roster/copy-week', data);
  }

  bulkCreateRoster(entries) {
    return this.post('/roster/bulk', { entries });
  }

  addRosterDuty(entryId, data) {
    return this.post(`/roster/${entryId}/duties`, data);
  }

  updateRosterDuty(entryId, dutyId, data) {
    return this.put(`/roster/${entryId}/duties/${dutyId}`, data);
  }

  deleteRosterDuty(entryId, dutyId) {
    return this.delete(`/roster/${entryId}/duties/${dutyId}`);
  }

  // ============================================
  // DISPATCH
  // ============================================
  
  getDispatchDay(date) {
    return this.get(`/dispatch/${date}`);
  }

  assignDispatch(data) {
    return this.post('/dispatch/assign', data);
  }

  transferDispatch(data) {
    return this.post('/dispatch/transfer', data);
  }

  unassignDispatch(data) {
    return this.post('/dispatch/unassign', data);
  }

  updateDispatchDuty(dutyId, data) {
    return this.put(`/dispatch/duty/${dutyId}`, data);
  }

  addDispatchDuty(data) {
    return this.post('/dispatch/duty', data);
  }

  deleteDispatchDuty(dutyId) {
    return this.delete(`/dispatch/duty/${dutyId}`);
  }

  // ============================================
  // CONFIG
  // ============================================
  
  getDutyTypes() {
    return this.get('/config/duty-types');
  }

  getPayTypes() {
    return this.get('/config/pay-types');
  }

  getLocations() {
    return this.get('/config/locations');
  }

  getRoutes() {
    return this.get('/config/routes');
  }

  getDepots() {
    return this.get('/config/depots');
  }

  // ============================================
  // HEALTH
  // ============================================
  
  health() {
    return this.get('/health');
  }
}

// Export singleton instance
export const api = new ApiClient();
export default api;
