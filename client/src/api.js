const API_BASE = '/api';

const TOKEN_KEY = 'gift_scheduler_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Global callback for auth failures — set by App.jsx
let onAuthFailure = null;
export function setAuthFailureHandler(handler) {
  onAuthFailure = handler;
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = getToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  if (response.status === 401) {
    clearToken();
    if (onAuthFailure) onAuthFailure();
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Authenticated file download helper (for backup export/download)
async function downloadFile(path, filename) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.status === 401) {
    clearToken();
    if (onAuthFailure) onAuthFailure();
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Download failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const api = {
  // Auth
  getAuthStatus: () => request('/auth/status'),
  setup: (data) => request('/auth/setup', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  changePassword: (data) => request('/auth/password', { method: 'PUT', body: data }),
  createUser: (data) => request('/auth/users', { method: 'POST', body: data }),

  // Dashboard
  getDashboard: () => request('/dashboard'),

  // Contacts
  getContacts: () => request('/contacts'),
  getContact: (id) => request(`/contacts/${id}`),
  createContact: (data) => request('/contacts', { method: 'POST', body: data }),
  updateContact: (id, data) => request(`/contacts/${id}`, { method: 'PUT', body: data }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
  importContacts: (contacts) => request('/contacts/import', { method: 'POST', body: { contacts } }),

  // Events
  getEvents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/events${query ? `?${query}` : ''}`);
  },
  getEvent: (id) => request(`/events/${id}`),
  createEvent: (data) => request('/events', { method: 'POST', body: data }),
  updateEvent: (id, data) => request(`/events/${id}`, { method: 'PUT', body: data }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),

  // Budgets
  getBudgets: () => request('/budgets'),
  getEffectiveBudget: (contactId, category) =>
    request(`/budgets/effective?contact_id=${contactId}&category=${category}`),
  updateBudget: (id, data) => request(`/budgets/${id}`, { method: 'PUT', body: data }),
  setBudgetOverride: (data) => request('/budgets/overrides', { method: 'POST', body: data }),
  deleteBudgetOverride: (id) => request(`/budgets/overrides/${id}`, { method: 'DELETE' }),

  // Gifts
  generateRecommendations: (eventId) =>
    request(`/gifts/recommend/${eventId}`, { method: 'POST' }),
  getEventRecommendations: (eventId) => request(`/gifts/event/${eventId}`),
  updateGiftStatus: (id, status) =>
    request(`/gifts/${id}/status`, { method: 'PUT', body: { status } }),

  // Cards
  generateCardMessages: (eventId, tones) =>
    request(`/cards/generate/${eventId}`, { method: 'POST', body: { tones } }),
  getEventCards: (eventId) => request(`/cards/event/${eventId}`),
  selectCard: (id) => request(`/cards/${id}/select`, { method: 'PUT' }),
  updateCard: (id, message) => request(`/cards/${id}`, { method: 'PUT', body: { message } }),

  // Approvals
  submitApproval: (data) => request('/approvals', { method: 'POST', body: data }),
  getEventApprovals: (eventId) => request(`/approvals/event/${eventId}`),
  getPendingApprovals: () => request('/approvals/pending'),

  // Orders
  createOrder: (data) => request('/orders', { method: 'POST', body: data }),
  getOrders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/orders${query ? `?${query}` : ''}`);
  },
  getOrder: (id) => request(`/orders/${id}`),
  updateOrderStatus: (id, data) => request(`/orders/${id}/status`, { method: 'PUT', body: data }),

  // Notifications
  getNotifications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/notifications${query ? `?${query}` : ''}`);
  },
  getUnreadCount: () => request('/notifications/count'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
  markAllRead: () => request('/notifications/read-all', { method: 'PUT' }),

  // Settings
  getSettings: () => request('/settings'),
  updateSetting: (key, value) => request(`/settings/${key}`, { method: 'PUT', body: { value } }),
  emergencyStop: (activate) =>
    request('/settings/emergency-stop', { method: 'POST', body: { activate } }),
  getAutonomySettings: () => request('/settings/autonomy'),
  setAutonomySetting: (data) => request('/settings/autonomy', { method: 'POST', body: data }),
  updateAutonomySetting: (id, data) =>
    request(`/settings/autonomy/${id}`, { method: 'PUT', body: data }),

  // Integrations
  getIntegrations: () => request('/integrations'),
  getIntegration: (provider) => request(`/integrations/${provider}`),

  // Backup
  getBackupStatus: () => request('/backup/status'),
  exportBackupJson: () => downloadFile('/backup/export', `gift-scheduler-backup-${new Date().toISOString().split('T')[0]}.json`),
  downloadBackupSqlite: () => downloadFile('/backup/download', `gift-scheduler-${new Date().toISOString().split('T')[0]}.db`),
  restoreBackup: (data) => request('/backup/restore', { method: 'POST', body: data }),

  // Audit
  getAuditLog: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/settings/audit${query ? `?${query}` : ''}`);
  },
};
