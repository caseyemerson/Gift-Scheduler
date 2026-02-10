import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', relationship: 'friend',
    preferences: { interests: [], preferred_tones: ['warm'] },
    constraints: { avoid_categories: [] },
    notes: '',
  });

  useEffect(() => { loadContacts(); }, []);

  async function loadContacts() {
    try {
      const data = await api.getContacts();
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await api.createContact(form);
      setShowForm(false);
      setForm({
        name: '', email: '', phone: '', relationship: 'friend',
        preferences: { interests: [], preferred_tones: ['warm'] },
        constraints: { avoid_categories: [] },
        notes: '',
      });
      loadContacts();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete contact "${name}"? This will also delete all their events.`)) return;
    try {
      await api.deleteContact(id);
      loadContacts();
    } catch (err) {
      alert(err.message);
    }
  }

  const relationships = ['friend', 'family', 'partner', 'colleague', 'acquaintance', 'other'];
  const interestOptions = ['tech', 'books', 'food', 'coffee', 'music', 'fitness', 'home', 'self-care', 'fashion', 'games', 'plants', 'art', 'wine', 'cooking', 'travel'];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Contact'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4">
          <h2 className="text-lg font-semibold">New Contact</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div>
              <label className="label">Relationship *</label>
              <select className="input" value={form.relationship} onChange={e => setForm({...form, relationship: e.target.value})}>
                {relationships.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="label">Interests</label>
            <div className="flex flex-wrap gap-2">
              {interestOptions.map(interest => (
                <button key={interest} type="button"
                  onClick={() => {
                    const interests = form.preferences.interests || [];
                    const updated = interests.includes(interest)
                      ? interests.filter(i => i !== interest)
                      : [...interests, interest];
                    setForm({...form, preferences: {...form.preferences, interests: updated}});
                  }}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    (form.preferences.interests || []).includes(interest)
                      ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {interest}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <button type="submit" className="btn-primary">Create Contact</button>
        </form>
      )}

      {contacts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No contacts yet. Add your first contact to get started.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Contact</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map(contact => (
            <div key={contact.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <Link to={`/contacts/${contact.id}`} className="flex-1">
                  <h3 className="font-semibold text-gray-900 hover:text-primary-600">{contact.name}</h3>
                  <p className="text-sm text-gray-500 capitalize">{contact.relationship}</p>
                </Link>
                <button onClick={() => handleDelete(contact.id, contact.name)}
                  className="text-gray-400 hover:text-red-500 p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              {contact.email && <p className="text-sm text-gray-500 mt-2">{contact.email}</p>}
              {contact.preferences?.interests?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {contact.preferences.interests.slice(0, 4).map(i => (
                    <span key={i} className="badge bg-gray-100 text-gray-600">{i}</span>
                  ))}
                  {contact.preferences.interests.length > 4 && (
                    <span className="badge bg-gray-100 text-gray-600">+{contact.preferences.interests.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
