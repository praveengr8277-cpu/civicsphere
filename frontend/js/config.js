// =====================================================================
// CivicSphere Karnataka - API Configuration & Dynamic URL Resolution
// Auto-detects Localhost vs Production (Render / Vercel)
// =====================================================================

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Default Render URL (users can configure this via the API settings popup)
const DEFAULT_PRODUCTION_RENDER_URL = 'https://civicsphere-api.onrender.com';

export const Config = {
  // Saved custom URL from localStorage, or localhost when running locally, or default Render URL
  get apiBaseUrl() {
    const saved = localStorage.getItem('civicsphere_api_url');
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '');
    if (isLocalhost) return 'http://localhost:8000';
    return DEFAULT_PRODUCTION_RENDER_URL;
  },

  setApiUrl(url) {
    if (!url || !url.trim()) {
      localStorage.removeItem('civicsphere_api_url');
    } else {
      localStorage.setItem('civicsphere_api_url', url.trim().replace(/\/+$/, ''));
    }
    window.location.reload();
  },

  isLocalhost
};

// Expose globally for UI modals
window.CivicConfig = Config;
window.saveCustomApiUrl = (url) => Config.setApiUrl(url);
window.resetDefaultApiUrl = () => {
  localStorage.removeItem('civicsphere_api_url');
  window.location.reload();
};
