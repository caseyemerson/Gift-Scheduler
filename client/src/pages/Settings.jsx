import React, { useState, useEffect } from 'react';
import { api } from '../api';

function IntegrationCard({ integration }) {
  const configured = integration.status === 'configured';
  return (
    <div className={`flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border ${configured ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{integration.label}</span>
          {integration.active && (
            <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded">active</span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{integration.description}</p>
        {configured && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {Object.entries(integration.variables).filter(([, v]) => v.set).map(([key, v]) => (
              <span key={key} className="text-xs text-gray-400 dark:text-gray-500 font-mono">{key.split('_').pop().toLowerCase()}: {v.masked}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        {configured ? (
          <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">Connected</span>
        ) : (
          integration.signupUrl ? (
            <a href={integration.signupUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Get API key</a>
          ) : (
            <span className="text-xs text-gray-400">Not configured</span>
          )
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [autonomy, setAutonomy] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [integrations, setIntegrations] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [showAutonomyForm, setShowAutonomyForm] = useState(false);
  const [autonomyForm, setAutonomyForm] = useState({
    contact_id: '', event_type: '', level: 'manual', max_budget: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [settingsData, autonomyData, contactsData, integrationsData, backupData] = await Promise.all([
        api.getSettings(),
        api.getAutonomySettings(),
        api.getContacts(),
        api.getIntegrations(),
        api.getBackupStatus(),
      ]);
      setSettings(settingsData);
      setAutonomy(autonomyData);
      setContacts(contactsData);
      setIntegrations(integrationsData);
      setBackupStatus(backupData);
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

  async function handleRestore(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Restore from backup? This will replace ALL current data with the backup contents.')) {
      e.target.value = '';
      return;
    }

    setRestoreLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api.restoreBackup(data);
      alert(`Restored ${result.total_rows} rows successfully.`);
      loadData();
    } catch (err) {
      alert('Restore failed: ' + err.message);
    } finally {
      setRestoreLoading(false);
      e.target.value = '';
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const isEmergencyActive = settings.emergency_stop === 'true';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Emergency Stop */}
      <div className={`card border-2 ${isEmergencyActive ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-gray-200 dark:border-gray-700'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <svg className={`w-6 h-6 ${isEmergencyActive ? 'text-red-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Emergency Stop
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
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
              <p className="text-sm text-gray-500 dark:text-gray-400">How many days before an event to start preparations</p>
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

      {/* Integrations */}
      {integrations && (
        <div className="card">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Integrations</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Connect to retailers, florists, shopping aggregators, and LLM providers. Set API keys as environment variables in Railway.</p>
          </div>

          {/* Retailers */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Retailers</h3>
            <div className="space-y-2">
              {integrations.retailers.map(r => (
                <IntegrationCard key={r.provider} integration={r} />
              ))}
            </div>
          </div>

          {/* Florists */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Florists</h3>
            <div className="space-y-2">
              {integrations.florists.map(f => (
                <IntegrationCard key={f.provider} integration={f} />
              ))}
            </div>
          </div>

          {/* Aggregators */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Shopping Aggregator</h3>
            <div className="space-y-2">
              {integrations.aggregators.map(a => (
                <IntegrationCard key={a.provider} integration={a} />
              ))}
            </div>
          </div>

          {/* LLM */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Card Message AI
              {integrations.llm.active_provider ? '' : ' (using templates)'}
            </h3>
            {!integrations.llm.active_provider && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-2">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  No LLM provider configured. Card messages use built-in templates. Add an API key to enable AI-generated messages.
                </p>
              </div>
            )}
            <div className="space-y-2">
              {integrations.llm.providers.map(p => (
                <IntegrationCard key={p.provider} integration={p} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Backup & Restore */}
      <div className="card">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Backup & Restore</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Export your data for safekeeping or restore from a previous backup.</p>
        </div>

        {backupStatus && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 mb-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Database: <span className="font-medium text-gray-700 dark:text-gray-300">{backupStatus.file_size_human || 'N/A'}</span></span>
              <span className="text-gray-500 dark:text-gray-400">Contacts: <span className="font-medium text-gray-700 dark:text-gray-300">{backupStatus.table_counts?.contacts || 0}</span></span>
              <span className="text-gray-500 dark:text-gray-400">Events: <span className="font-medium text-gray-700 dark:text-gray-300">{backupStatus.table_counts?.events || 0}</span></span>
              <span className="text-gray-500 dark:text-gray-400">Orders: <span className="font-medium text-gray-700 dark:text-gray-300">{backupStatus.table_counts?.orders || 0}</span></span>
              <span className="text-gray-500 dark:text-gray-400">Total rows: <span className="font-medium text-gray-700 dark:text-gray-300">{backupStatus.total_rows || 0}</span></span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button onClick={() => api.exportBackupJson().catch(err => alert(err.message))} className="btn-primary text-sm">
            Export JSON
          </button>
          <button onClick={() => api.downloadBackupSqlite().catch(err => alert(err.message))} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Download SQLite
          </button>
          <label className={`px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${restoreLoading ? 'opacity-50 pointer-events-none' : ''}`}>
            {restoreLoading ? 'Restoring...' : 'Restore from JSON'}
            <input type="file" accept=".json" onChange={handleRestore} className="hidden" disabled={restoreLoading} />
          </label>
        </div>
      </div>

      {/* Autonomy Settings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Autonomy Settings</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Control how much the system can do without your approval</p>
          </div>
          <button onClick={() => setShowAutonomyForm(!showAutonomyForm)} className="btn-primary text-sm">
            {showAutonomyForm ? 'Cancel' : '+ Add Rule'}
          </button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>MVP Mode:</strong> All purchases require explicit approval regardless of autonomy settings.
            These settings will take effect in future versions.
          </p>
        </div>

        {showAutonomyForm && (
          <form onSubmit={handleAddAutonomy} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 space-y-4">
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
          <p className="text-gray-500 dark:text-gray-400 text-sm">No autonomy rules configured. Default: manual approval for everything.</p>
        ) : (
          <div className="space-y-2">
            {autonomy.map(rule => (
              <div key={rule.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3">
                <div>
                  <div className="font-medium text-sm">
                    {rule.contact_name || 'All contacts'} / {rule.event_type || 'All types'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Level: <span className="capitalize">{rule.level.replace('_', ' ')}</span>
                    {rule.max_budget && ` | Max: $${rule.max_budget}`}
                  </div>
                </div>
                <span className={`badge ${
                  rule.level === 'manual' ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' :
                  rule.level === 'auto_recommend' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                  'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
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
              <p className="text-sm text-gray-600 dark:text-gray-400">System generates recommendations and drafts. You approve everything before any action is taken.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-3 h-3 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium">Auto Recommend</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">System automatically generates recommendations when events approach lead time. You still approve purchases.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-3 h-3 bg-amber-400 rounded-full mt-1.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium">Auto Purchase (Future)</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">System automatically selects and purchases gifts within defined budget limits. Emergency stop can override at any time.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
