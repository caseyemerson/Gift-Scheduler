import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadContact(); }, [id]);

  async function loadContact() {
    try {
      const data = await api.getContact(id);
      setContact(data);
      setForm(data);
    } catch (err) {
      console.error('Failed to load contact:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      await api.updateContact(id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        relationship: form.relationship,
        preferences: form.preferences,
        constraints: form.constraints,
        notes: form.notes,
      });
      setEditing(false);
      loadContact();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${contact.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteContact(id);
      navigate('/contacts');
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!contact) return <div className="text-center py-12 text-gray-500">Contact not found</div>;

  const interestOptions = ['tech', 'books', 'food', 'coffee', 'music', 'fitness', 'home', 'self-care', 'fashion', 'games', 'plants', 'art', 'wine', 'cooking', 'travel'];

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/contacts" className="text-sm text-primary-600 hover:text-primary-700 mb-4 inline-block">&larr; Back to Contacts</Link>

      <div className="card mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            {editing ? (
              <input className="input text-xl font-bold" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            ) : (
              <h1 className="text-2xl font-bold">{contact.name}</h1>
            )}
            <p className="text-gray-500 capitalize mt-1">{contact.relationship}</p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={handleSave} className="btn-primary">Save</button>
                <button onClick={() => { setEditing(false); setForm(contact); }} className="btn-secondary">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="btn-secondary">Edit</button>
                <button onClick={handleDelete} className="btn-danger">Delete</button>
              </>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            {editing ? (
              <input className="input" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
            ) : (
              <p className="text-gray-700">{contact.email || 'Not set'}</p>
            )}
          </div>
          <div>
            <label className="label">Phone</label>
            {editing ? (
              <input className="input" value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} />
            ) : (
              <p className="text-gray-700">{contact.phone || 'Not set'}</p>
            )}
          </div>
        </div>

        {editing && (
          <div className="mt-4">
            <label className="label">Interests</label>
            <div className="flex flex-wrap gap-2">
              {interestOptions.map(interest => (
                <button key={interest} type="button"
                  onClick={() => {
                    const interests = form.preferences?.interests || [];
                    const updated = interests.includes(interest) ? interests.filter(i => i !== interest) : [...interests, interest];
                    setForm({...form, preferences: {...form.preferences, interests: updated}});
                  }}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    (form.preferences?.interests || []).includes(interest)
                      ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {interest}
                </button>
              ))}
            </div>
          </div>
        )}

        {!editing && contact.preferences?.interests?.length > 0 && (
          <div className="mt-4">
            <label className="label">Interests</label>
            <div className="flex flex-wrap gap-2">
              {contact.preferences.interests.map(i => (
                <span key={i} className="badge bg-primary-50 text-primary-700">{i}</span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <label className="label">Notes</label>
          {editing ? (
            <textarea className="input" rows={3} value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
          ) : (
            <p className="text-gray-700">{contact.notes || 'No notes'}</p>
          )}
        </div>
      </div>

      {/* Events */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Events</h2>
          <Link to={`/events?contact=${id}`} className="btn-primary text-sm">+ Add Event</Link>
        </div>
        {contact.events?.length === 0 ? (
          <p className="text-gray-500 text-sm">No events for this contact</p>
        ) : (
          <div className="space-y-2">
            {contact.events?.map(event => (
              <Link key={event.id} to={`/events/${event.id}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div>
                  <span className="font-medium">{event.name}</span>
                  <span className="badge ml-2 bg-gray-200 text-gray-700">{event.type}</span>
                </div>
                <span className="text-sm text-gray-500">{new Date(event.date).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Gift History */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Gift History</h2>
        {contact.giftHistory?.length === 0 ? (
          <p className="text-gray-500 text-sm">No gifts sent yet</p>
        ) : (
          <div className="space-y-2">
            {contact.giftHistory?.map(gift => (
              <div key={gift.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{gift.name}</span>
                  <span className="text-sm text-gray-500 ml-2">{gift.event_name}</span>
                </div>
                <div className="text-right">
                  <span className="font-medium">${gift.price?.toFixed(2)}</span>
                  <span className="text-sm text-gray-500 ml-2">{gift.retailer}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
