import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadLogs(); }, [filter]);

  async function loadLogs() {
    try {
      const params = { limit: '200' };
      if (filter) params.entity_type = filter;
      const data = await api.getAuditLog(params);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  }

  const entityTypes = ['contact', 'event', 'budget', 'budget_override', 'gift_recommendation', 'card_message', 'approval', 'order', 'global_settings', 'autonomy_settings'];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !filter ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
          }`}>All</button>
        {entityTypes.map(type => (
          <button key={type} onClick={() => setFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === type ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
            }`}>{type.replace('_', ' ')}</button>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No audit entries found.</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Details</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-400">{log.entity_type}</span>
                      {log.entity_id && (
                        <span className="text-gray-400 dark:text-gray-500 text-xs ml-1 font-mono">{log.entity_id.slice(0, 8)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-gray-500 dark:text-gray-400">
                      {formatDetails(log.details)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{log.performed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }) {
  const colors = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    approve: 'bg-green-100 text-green-700',
    reject: 'bg-red-100 text-red-700',
    emergency_stop: 'bg-red-100 text-red-700',
    generate_recommendations: 'bg-purple-100 text-purple-700',
    generate_messages: 'bg-purple-100 text-purple-700',
    create_order: 'bg-blue-100 text-blue-700',
    update_status: 'bg-amber-100 text-amber-700',
    set_override: 'bg-blue-100 text-blue-700',
    set_autonomy: 'bg-amber-100 text-amber-700',
    select_message: 'bg-blue-100 text-blue-700',
    cancel_order: 'bg-red-100 text-red-700',
    budget_warning: 'bg-orange-100 text-orange-700',
  };
  return (
    <span className={`badge ${colors[action] || 'bg-gray-100 text-gray-700'}`}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function formatDetails(details) {
  if (!details || Object.keys(details).length === 0) return '-';
  const entries = Object.entries(details);
  return entries.map(([key, value]) => {
    if (typeof value === 'object') return `${key}: ${JSON.stringify(value)}`;
    return `${key}: ${value}`;
  }).join(', ');
}
