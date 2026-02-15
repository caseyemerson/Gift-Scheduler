import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const emptyForm = {
  name: '', email: '', phone: '', relationship: 'friend',
  birthday: '', anniversary: '', other_date: '',
  default_gifts: { card: true, gift: false, flowers: false },
  preferences: { interests: [], preferred_tones: ['warm'] },
  constraints: { avoid_categories: [] },
  notes: '',
};

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importResult, setImportResult] = useState(null);
  const [dateError, setDateError] = useState('');
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({ ...emptyForm });

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
    if (!form.birthday && !form.anniversary && !form.other_date) {
      setDateError('At least one date (birthday, anniversary, or other) is required.');
      return;
    }
    setDateError('');
    try {
      await api.createContact(form);
      setShowForm(false);
      setForm({ ...emptyForm });
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

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = values[i] || ''; });
      return {
        name: obj.name || obj.full_name || obj['full name'] || '',
        email: obj.email || obj.e_mail || '',
        phone: obj.phone || obj.telephone || obj.tel || obj.mobile || '',
        relationship: obj.relationship || 'friend',
        birthday: obj.birthday || obj.bday || obj['birth date'] || '',
        anniversary: obj.anniversary || '',
        other_date: obj.other_date || obj['other date'] || '',
        notes: obj.notes || '',
      };
    }).filter(c => c.name);
  }

  function parseVCard(text) {
    const cards = text.split('BEGIN:VCARD').filter(c => c.trim());
    return cards.map(card => {
      const lines = card.split('\n').map(l => l.trim());
      const get = (prefix) => {
        const line = lines.find(l => l.toUpperCase().startsWith(prefix.toUpperCase()));
        if (!line) return '';
        return line.substring(line.indexOf(':') + 1).trim();
      };
      const fn = get('FN');
      const n = get('N');
      const name = fn || (n ? n.split(';').filter(Boolean).reverse().join(' ') : '');
      const tel = get('TEL');
      const email = get('EMAIL');
      const bday = get('BDAY');
      let birthday = '';
      if (bday) {
        const clean = bday.replace(/-/g, '');
        if (clean.length === 8) {
          birthday = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
        }
      }
      return { name, email, phone: tel, relationship: 'friend', birthday, notes: '' };
    }).filter(c => c.name);
  }

  async function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    let parsed;
    if (file.name.endsWith('.vcf') || file.name.endsWith('.vcard') || text.includes('BEGIN:VCARD')) {
      parsed = parseVCard(text);
    } else {
      parsed = parseCSV(text);
    }
    if (parsed.length === 0) {
      alert('No contacts found in the file. Ensure it is a valid CSV or vCard (.vcf) file.');
      return;
    }
    try {
      const result = await api.importContacts(parsed);
      setImportResult(result);
      loadContacts();
    } catch (err) {
      alert(err.message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const relationships = ['friend', 'family', 'partner', 'colleague', 'acquaintance', 'other'];
  const interestOptions = ['tech', 'books', 'food', 'coffee', 'music', 'fitness', 'home', 'self-care', 'fashion', 'games', 'plants', 'art', 'wine', 'cooking', 'travel'];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowImport(!showImport); setShowForm(false); setImportResult(null); }} className="btn-secondary">
            {showImport ? 'Cancel' : 'Import'}
          </button>
          <button onClick={() => { setShowForm(!showForm); setShowImport(false); setDateError(''); }} className="btn-primary">
            {showForm ? 'Cancel' : '+ Add Contact'}
          </button>
        </div>
      </div>

      {/* Import section */}
      {showImport && (
        <div className="card mb-6 space-y-4">
          <h2 className="text-lg font-semibold">Bulk Import Contacts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Import contacts from a CSV file or a vCard (.vcf) file exported from your phone.
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-2">CSV format (first row must be headers):</p>
              <code className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 block">
                name, email, phone, relationship, birthday, anniversary, other_date, notes
              </code>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">vCard (.vcf):</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Export contacts from your phone's Contacts app as a .vcf file, then upload it here.
                On iPhone: Contacts &gt; Share &gt; Share VCF. On Android: Contacts &gt; Manage &gt; Export.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.vcf,.vcard,text/csv,text/vcard"
                onChange={handleFileImport}
                className="input"
              />
            </div>
          </div>
          {importResult && (
            <div className={`rounded-lg p-4 ${importResult.errors > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'}`}>
              <p className="font-medium">
                Imported {importResult.imported} contact{importResult.imported !== 1 ? 's' : ''} successfully.
                {importResult.errors > 0 && ` ${importResult.errors} failed.`}
              </p>
              {importResult.details?.errors?.length > 0 && (
                <ul className="text-sm mt-2 space-y-1">
                  {importResult.details.errors.map((err, i) => (
                    <li key={i} className="text-red-600 dark:text-red-400">{err.contact}: {err.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

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

          {/* Dates */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="label mb-0">Dates</label>
              <span className="text-xs text-gray-500 dark:text-gray-400">(at least one required)</span>
            </div>
            {dateError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-3 py-2 mb-3">
                {dateError}
              </div>
            )}
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Birthday</label>
                <input className="input" type="date" value={form.birthday} onChange={e => { setForm({...form, birthday: e.target.value}); setDateError(''); }} />
              </div>
              <div>
                <label className="label">Anniversary</label>
                <input className="input" type="date" value={form.anniversary} onChange={e => { setForm({...form, anniversary: e.target.value}); setDateError(''); }} />
              </div>
              <div>
                <label className="label">Other</label>
                <input className="input" type="date" value={form.other_date} onChange={e => { setForm({...form, other_date: e.target.value}); setDateError(''); }} />
              </div>
            </div>
          </div>

          {/* Default gift options */}
          <div>
            <label className="label">Default options for events</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Select what to send by default for this contact's events</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.default_gifts.card}
                  onChange={e => setForm({...form, default_gifts: {...form.default_gifts, card: e.target.checked}})}
                  className="w-4 h-4 text-primary-600 rounded" />
                <span className="text-sm">Card</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.default_gifts.gift}
                  onChange={e => setForm({...form, default_gifts: {...form.default_gifts, gift: e.target.checked}})}
                  className="w-4 h-4 text-primary-600 rounded" />
                <span className="text-sm">Gift</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.default_gifts.flowers}
                  onChange={e => setForm({...form, default_gifts: {...form.default_gifts, flowers: e.target.checked}})}
                  className="w-4 h-4 text-primary-600 rounded" />
                <span className="text-sm">Flowers</span>
              </label>
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
                      ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
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
          <p className="text-gray-500 dark:text-gray-400 mb-4">No contacts yet. Add your first contact to get started.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary">+ Add Contact</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map(contact => (
            <div key={contact.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <Link to={`/contacts/${contact.id}`} className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 hover:text-primary-600">{contact.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{contact.relationship}</p>
                </Link>
                <button onClick={() => handleDelete(contact.id, contact.name)}
                  className="text-gray-400 hover:text-red-500 p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              {contact.email && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{contact.email}</p>}
              {(contact.birthday || contact.anniversary || contact.other_date) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {contact.birthday && <span>Birthday: {new Date(contact.birthday + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                  {contact.anniversary && <span>Anniversary: {new Date(contact.anniversary + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                  {contact.other_date && <span>Other: {new Date(contact.other_date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                </div>
              )}
              {/* Default gift options badges */}
              {contact.default_gifts && (
                <div className="flex gap-1 mt-2">
                  {contact.default_gifts.card && <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Card</span>}
                  {contact.default_gifts.gift && <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Gift</span>}
                  {contact.default_gifts.flowers && <span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">Flowers</span>}
                </div>
              )}
              {contact.preferences?.interests?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {contact.preferences.interests.slice(0, 4).map(i => (
                    <span key={i} className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">{i}</span>
                  ))}
                  {contact.preferences.interests.length > 4 && (
                    <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">+{contact.preferences.interests.length - 4}</span>
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
