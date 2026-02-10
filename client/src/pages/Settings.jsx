import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [autonomy, setAutonomy] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [showAutonomyForm, setShowAutonomyForm] = useState(false);
  const [autonomyForm, setAutonomyForm] = useState({
    contact_id: '', event_type: '', level: 'manual', max_budget: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [settingsData, autonomyData, contactsData] = await Promise.all([
        api.getSettings(),
        api.getAutonomySettings(),
        api.getContacts(),
      ]);
      setSettings(settingsData);
      setAutonomy(autonomyData);
      setContacts(contactsData);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmergencyStop() {
    const isActive = settings.emergency_stop === 'true';
    const message = isActive
      ? 'Deactivate emergency stop and re-enable purchasing?'
      : 'ACTIVATE EMERGENCY STOP? This will disable all purchasing and cancel pending orders.';
    if (!confirm(message)) return;

    setEmergencyLoading(true);
    try {
      await api.emergencyStop(!isActive);
      loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setEmergencyLoading(false);
    }
  }

  async function handleUpdateLeadTime(value) {
    try {
      await api.updateSetting('default_lead_time_days', value);
      setSettings({ ...settings, default_lead_time_days: value });
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleAddAutonomy(e) {
    e.preventDefault();
    try {
      await api.setAutonomySetting({
        contact_id: autonomyForm.contact_id || null,
        event_type: autonomyForm.event_type || null,
        level: autonomyForm.level,
        max_budget: autonomyForm.max_budget ? parseFloat(autonomyForm.max_budget) : null,
      });
      setShowAutonomyForm(false);
      setAutonomyForm({ contact_id: '', event_type: '', level: 'manual', max_budget: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const isEmergencyActive = settings.emergency_stop === 'true';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Emergency Stop */}
      <div className={`card border-2 ${isEmergencyActive ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <svg className={`w-6 h-6 ${isEmergencyActive ? 'text-red-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Emergency Stop
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isEmergencyActive
                ? 'All purchasing is currently disabled. Pending orders have been cancelled.'
                : 'Immediately disable all purchasing and cancel pending orders.'}
            </p>
          </div>
          <button onClick={handleEmergencyStop} disabled={emergencyLoading}
            className={`px-6 py-3 rounded-lg font-bold transition-colors ${
              isEmergencyActive
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}>
            {emergencyLoading ? '...' : isEmergencyActive ? 'Deactivate' : 'ACTIVATE'}
          </button>
        </div>
      </div>

      {/* General Settings */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">General Settings</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium">Default Lead Time</label>
              <p className="text-sm text-gray-500">How many days before an event to start preparations</p>
            </div>
            <select className="input w-32" value={settings.default_lead_time_days || '14'}
              onChange={e => handleUpdateLeadTime(e.target.value)}>
              {[7, 10, 14, 21, 30].map(d => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Autonomy Settings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Autonomy Settings</h2>
            <p className="text-sm text-gray-500">Control how much the system can do without your approval</p>
          </div>
          <button onClick={() => setShowAutonomyForm(!showAutonomyForm)} className="btn-primary text-sm">
            {showAutonomyForm ? 'Cancel' : '+ Add Rule'}
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            <strong>MVP Mode:</strong> All purchases require explicit approval regardless of autonomy settings.
            These settings will take effect in future versions.
          </p>
        </div>

        {showAutonomyForm && (
          <form onSubmit={handleAddAutonomy} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Contact (optional)</label>
                <select className="input" value={autonomyForm.contact_id}
                  onChange={e => setAutonomyForm({...autonomyForm, contact_id: e.target.value})}>
                  <option value="">All contacts</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Event Type (optional)</label>
                <select className="input" value={autonomyForm.event_type}
                  onChange={e => setAutonomyForm({...autonomyForm, event_type: e.target.value})}>
                  <option value="">All types</option>
                  <option value="birthday">Birthday</option>
                  <option value="anniversary">Anniversary</option>
                  <option value="holiday">Holiday</option>
                </select>
              </div>
              <div>
                <label className="label">Level</label>
                <select className="input" value={autonomyForm.level}
                  onChange={e => setAutonomyForm({...autonomyForm, level: e.target.value})}>
                  <option value="manual">Manual - Approve everything</option>
                  <option value="auto_recommend">Auto Recommend - Auto-generate suggestions</option>
                  <option value="auto_purchase">Auto Purchase - Full automation (future)</option>
                </select>
              </div>
              <div>
                <label className="label">Max Budget ($)</label>
                <input className="input" type="number" min="0" step="0.01" value={autonomyForm.max_budget}
                  onChange={e => setAutonomyForm({...autonomyForm, max_budget: e.target.value})} placeholder="No limit" />
              </div>
            </div>
            <button type="submit" className="btn-primary">Add Rule</button>
          </form>
        )}

        {autonomy.length === 0 ? (
          <p className="text-gray-500 text-sm">No autonomy rules configured. Default: manual approval for everything.</p>
        ) : (
          <div className="space-y-2">
            {autonomy.map(rule => (
              <div key={rule.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <div>
                  <div className="font-medium text-sm">
                    {rule.contact_name || 'All contacts'} / {rule.event_type || 'All types'}
                  </div>
                  <div className="text-xs text-gray-500">
                    Level: <span className="capitalize">{rule.level.replace('_', ' ')}</span>
                    {rule.max_budget && ` | Max: $${rule.max_budget}`}
                  </div>
                </div>
                <span className={`badge ${
                  rule.level === 'manual' ? 'bg-gray-100 text-gray-700' :
                  rule.level === 'auto_recommend' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{rule.level.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Autonomy Level Explanation */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Autonomy Levels Explained</h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-3 h-3 bg-gray-400 rounded-full mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium">Manual (Current MVP)</h3>
              <p className="text-sm text-gray-600">System generates recommendations and drafts. You approve everything before any action is taken.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-3 h-3 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium">Auto Recommend</h3>
              <p className="text-sm text-gray-600">System automatically generates recommendations when events approach lead time. You still approve purchases.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-3 h-3 bg-amber-400 rounded-full mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium">Auto Purchase (Future)</h3>
              <p className="text-sm text-gray-600">System automatically selects and purchases gifts within defined budget limits. Emergency stop can override at any time.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
