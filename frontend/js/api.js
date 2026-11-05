// =====================================================================
// CivicSphere Karnataka - REST API Client for Render Backend
// Provides automatic fallback & offline resilience
// =====================================================================

import { Config } from './config.js';

let isBackendOnline = false;
let backendCheckDone = false;

export const ApiClient = {
  get isOnline() {
    return isBackendOnline;
  },

  async request(endpoint, options = {}) {
    const url = `${Config.apiBaseUrl}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders, ...(options.headers || {}) }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      isBackendOnline = true;
      ApiClient.updateBackendStatusUI(true);
      return await response.json();
    } catch (err) {
      console.warn(`[CivicSphere API] Request failed for ${endpoint}:`, err.message);
      isBackendOnline = false;
      ApiClient.updateBackendStatusUI(false);
      throw err;
    }
  },

  async checkHealth() {
    try {
      const res = await fetch(`${Config.apiBaseUrl}/api/health`, { method: 'GET' });
      isBackendOnline = res.ok;
      backendCheckDone = true;
      ApiClient.updateBackendStatusUI(isBackendOnline);
      return isBackendOnline;
    } catch {
      isBackendOnline = false;
      backendCheckDone = true;
      ApiClient.updateBackendStatusUI(false);
      return false;
    }
  },

  async getComplaints(params = {}) {
    const query = new URLSearchParams(params).toString();
    const ep = `/api/complaints${query ? `?${query}` : ''}`;
    return await ApiClient.request(ep, { method: 'GET' });
  },

  async getComplaintById(id) {
    return await ApiClient.request(`/api/complaints/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  async createComplaint(payload) {
    return await ApiClient.request('/api/complaints', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async updateStatus(id, status, resolutionNote = null, officer = null) {
    return await ApiClient.request(`/api/complaints/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolution_note: resolutionNote, officer })
    });
  },

  async getAnalytics() {
    return await ApiClient.request('/api/analytics', { method: 'GET' });
  },

  async resolveVoiceIntent(query, language = 'en-IN') {
    return await ApiClient.request('/api/voice/intent', {
      method: 'POST',
      body: JSON.stringify({ query, language })
    });
  },

  updateBackendStatusUI(online) {
    const dot = document.getElementById('backend-status-dot');
    const label = document.getElementById('backend-status-label');
    if (dot) {
      dot.style.background = online ? '#22c55e' : '#f59e0b';
      dot.title = online ? `Backend Connected: ${Config.apiBaseUrl}` : `Backend Offline/Cold-Start. Running on local cache.`;
    }
    if (label) {
      label.textContent = online ? 'API Live' : 'API Offline (Local Cache)';
    }
  }
};

window.CivicApi = ApiClient;
