import React, { useState, useEffect } from 'react';
import { api } from '../api';

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [overrideForm, setOverrideForm] = useState({ budget_id: '', contact_id: '', amount: '' });
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [budgetsData, contactsData] = await Promise.all([
        api.getBudgets(),
        api.getContacts(),
      ]);
      setBudgets(budgetsData);
      setContacts(contactsData);
    } catch (err) {
      console.error('Failed to load budgets:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateBudget(id) {
    try {
      await api.updateBudget(id, { default_amount: parseFloat(editAmount) });
      setEditingId(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleAddOverride(e) {
    e.preventDefault();
    try {
      await api.setBudgetOverride({
        budget_id: overrideForm.budget_id,
        contact_id: overrideForm.contact_id,
        amount: parseFloat(overrideForm.amount),
      });
      setShowOverrideForm(false);
      setOverrideForm({ budget_id: '', contact_id: '', amount: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeleteOverride(id) {
    try {
      await api.deleteBudgetOverride(id);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Budgets</h1>
        <button onClick={() => setShowOverrideForm(!showOverrideForm)} className="btn-primary">
          {showOverrideForm ? 'Cancel' : '+ Add Override'}
        </button>
      </div>

      {showOverrideForm && (
        <form onSubmit={handleAddOverride} className="card mb-6 space-y-4">
          <h2 className="text-lg font-semibold">Add Budget Override</h2>
          <p className="text-sm text-gray-500">Set a custom budget for a specific contact and event category.</p>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label">Category</label>
              <select className="input" value={overrideForm.budget_id}
                onChange={e => setOverrideForm({...overrideForm, budget_id: e.target.value})} required>
                <option value="">Select...</option>
                {budgets.map(b => <option key={b.id} value={b.id}>{b.category}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Contact</label>
              <select className="input" value={overrideForm.contact_id}
                onChange={e => setOverrideForm({...overrideForm, contact_id: e.target.value})} required>
                <option value="">Select...</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount ($)</label>
              <input className="input" type="number" min="0" step="0.01" value={overrideForm.amount}
                onChange={e => setOverrideForm({...overrideForm, amount: e.target.value})} required />
            </div>
          </div>
          <button type="submit" className="btn-primary">Add Override</button>
        </form>
      )}

      <div className="space-y-6">
        {budgets.map(budget => (
          <div key={budget.id} className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold capitalize">{budget.category}</h2>
                <p className="text-sm text-gray-500">Default budget for {budget.category} events</p>
              </div>
              {editingId === budget.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">$</span>
                  <input className="input w-24" type="number" min="0" step="0.01"
                    value={editAmount} onChange={e => setEditAmount(e.target.value)} />
                  <button onClick={() => handleUpdateBudget(budget.id)} className="btn-primary text-sm">Save</button>
                  <button onClick={() => setEditingId(null)} className="btn-secondary text-sm">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">${budget.default_amount.toFixed(2)}</span>
                  <button onClick={() => { setEditingId(budget.id); setEditAmount(budget.default_amount); }}
                    className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {budget.overrides?.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Per-Person Overrides</h3>
                <div className="space-y-2">
                  {budget.overrides.map(override => (
                    <div key={override.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                      <span className="font-medium">{override.contact_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">${override.amount.toFixed(2)}</span>
                        <button onClick={() => handleDeleteOverride(override.id)}
                          className="text-gray-400 hover:text-red-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
