// ============================================
// API CLIENT
// ============================================
const API_BASE = 'https://dispatch-api.oliveri-john001.workers.dev/api';

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(url, config);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
