const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
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

  // Audit
  getAuditLog: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/settings/audit${query ? `?${query}` : ''}`);
  },
};
