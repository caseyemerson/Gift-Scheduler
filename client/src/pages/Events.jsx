import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [form, setForm] = useState({
    contact_id: '', type: 'birthday', name: '', date: '', recurring: true, lead_time_days: 14,
  });

  useEffect(() => { loadData(); }, [filter]);

  async function loadData() {
    try {
      const params = {};
      if (filter === 'upcoming') params.upcoming = 'true';
      if (filter !== 'all' && filter !== 'upcoming') params.status = filter;

      const [eventsData, contactsData] = await Promise.all([
        api.getEvents(params),
        api.getContacts(),
      ]);
      setEvents(eventsData);
      setContacts(contactsData);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await api.createEvent({
        ...form,
        recurring: form.recurring ? 1 : 0,
        lead_time_days: parseInt(form.lead_time_days),
      });
      setShowForm(false);
      setForm({ contact_id: '', type: 'birthday', name: '', date: '', recurring: true, lead_time_days: 14 });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  function autoName() {
    const contact = contacts.find(c => c.id === form.contact_id);
    if (contact && form.type) {
      const typeName = form.type.charAt(0).toUpperCase() + form.type.slice(1);
      setForm({ ...form, name: `${contact.name}'s ${typeName}` });
    }
  }

  // Auto-fill date from contact's birthday/anniversary when type and contact change
  function handleContactOrTypeChange(newContactId, newType) {
    const updated = { ...form, contact_id: newContactId, type: newType };
    const contact = contacts.find(c => c.id === newContactId);
    if (contact) {
      if (newType === 'birthday' && contact.birthday) {
        updated.date = contact.birthday;
      } else if (newType === 'anniversary' && contact.anniversary) {
        updated.date = contact.anniversary;
      }
    }
    setForm(updated);
  }

  const daysUntil = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Events</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ Add Event'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4">
          <h2 className="text-lg font-semibold">New Event</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Contact *</label>
              <select className="input" value={form.contact_id}
                onChange={e => handleContactOrTypeChange(e.target.value, form.type)} required>
                <option value="">Select contact...</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type *</label>
              <select className="input" value={form.type}
                onChange={e => handleContactOrTypeChange(form.contact_id, e.target.value)}>
                <option value="birthday">Birthday</option>
                <option value="anniversary">Anniversary</option>
                <option value="holiday">Holiday</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Event Name *</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})} required />
                <button type="button" onClick={autoName} className="btn-secondary text-xs">Auto</button>
              </div>
            </div>
            <div>
              <label className="label">Date *</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm({...form, date: e.target.value})} required />
            </div>
            <div>
              <label className="label">Lead Time (days)</label>
              <input className="input" type="number" min="1" max="90" value={form.lead_time_days}
                onChange={e => setForm({...form, lead_time_days: e.target.value})} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="recurring" checked={form.recurring}
                onChange={e => setForm({...form, recurring: e.target.checked})}
                className="w-4 h-4 text-primary-600 rounded" />
              <label htmlFor="recurring" className="text-sm">Recurring annually</label>
            </div>
          </div>
          <button type="submit" className="btn-primary">Create Event</button>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['upcoming', 'all', 'in_progress', 'completed', 'missed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
            }`}>
            {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No events found. Add your first event to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const days = daysUntil(event.date);
            return (
              <Link key={event.id} to={`/events/${event.id}`}
                className="card flex items-center justify-between hover:shadow-md transition-shadow block">
                <div className="flex items-center gap-4">
                  <EventTypeIcon type={event.type} />
                  <div>
                    <h3 className="font-semibold">{event.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {event.contact_name} &middot; {new Date(event.date).toLocaleDateString()}
                      {event.recurring ? ' (recurring)' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <StatusBadge status={event.status} />
                  {days >= 0 && (
                    <span className={`text-sm font-medium ${days <= 7 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      {days}d
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EventTypeIcon({ type }) {
  const configs = {
    birthday: { bg: 'bg-pink-100 dark:bg-pink-900/30', emoji: 'text-pink-600 dark:text-pink-400' },
    anniversary: { bg: 'bg-red-100 dark:bg-red-900/30', emoji: 'text-red-600 dark:text-red-400' },
    holiday: { bg: 'bg-green-100 dark:bg-green-900/30', emoji: 'text-green-600 dark:text-green-400' },
    other: { bg: 'bg-gray-100 dark:bg-gray-700', emoji: 'text-gray-600 dark:text-gray-400' },
  };
  const labels = { birthday: 'B', anniversary: 'A', holiday: 'H', other: 'O' };
  const config = configs[type] || configs.other;
  return (
    <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
      <span className={`font-bold ${config.emoji}`}>{labels[type]}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    upcoming: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    missed: 'bg-red-100 text-red-700',
  };
  return <span className={`badge ${styles[status] || 'bg-gray-100 text-gray-700'}`}>{status}</span>;
}
