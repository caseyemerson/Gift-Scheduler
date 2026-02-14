import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    try {
      const [dashboard, notifs] = await Promise.all([
        api.getDashboard(),
        api.getNotifications({ limit: '10' }),
      ]);
      setData(dashboard);
      setNotifications(notifs);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    await api.markAllRead();
    setNotifications(notifications.map(n => ({ ...n, read: 1 })));
  }

  if (loading) return <LoadingSpinner />;
  if (!data) return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Failed to load dashboard</div>;

  const daysUntil = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Contacts" value={data.totalContacts} color="blue" />
        <StatCard label="Upcoming Events" value={data.upcomingEvents.length} color="purple" />
        <StatCard label="Active Orders" value={data.activeOrders.length} color="orange" />
        <StatCard label="Total Spent" value={`$${data.totalSpent.toFixed(2)}`} color="green" />
      </div>

      {/* Events needing action */}
      {data.eventsNeedingAction.length > 0 && (
        <div className="card border-l-4 border-l-amber-500">
          <h2 className="text-lg font-semibold mb-3">Events Needing Action</h2>
          <div className="space-y-2">
            {data.eventsNeedingAction.map(event => (
              <Link key={event.id} to={`/events/${event.id}`}
                className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                <div>
                  <span className="font-medium">{event.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-2">for {event.contact_name}</span>
                </div>
                <div className="text-sm">
                  <span className={`font-medium ${daysUntil(event.date) <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                    {daysUntil(event.date)} days away
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upcoming events */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Upcoming Events</h2>
            <Link to="/events" className="text-sm text-primary-600 hover:text-primary-700">View all</Link>
          </div>
          {data.upcomingEvents.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No upcoming events</p>
          ) : (
            <div className="space-y-3">
              {data.upcomingEvents.slice(0, 5).map(event => (
                <Link key={event.id} to={`/events/${event.id}`}
                  className="flex items-center justify-between py-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-2 -mx-2 transition-colors">
                  <div className="flex items-center gap-3">
                    <EventIcon type={event.type} />
                    <div>
                      <div className="font-medium text-sm">{event.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{event.contact_name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{new Date(event.date).toLocaleDateString()}</div>
                    <div className={`text-xs ${daysUntil(event.date) <= 7 ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                      {daysUntil(event.date)}d
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Active orders */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Active Orders</h2>
            <Link to="/orders" className="text-sm text-primary-600 hover:text-primary-700">View all</Link>
          </div>
          {data.activeOrders.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No active orders</p>
          ) : (
            <div className="space-y-3">
              {data.activeOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-sm">{order.gift_name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">for {order.contact_name}</div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Notifications</h2>
          {notifications.some(n => !n.read) && (
            <button onClick={markAllRead} className="text-sm text-primary-600 hover:text-primary-700">
              Mark all read
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No notifications</p>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <div key={n.id} className={`flex items-start gap-3 p-3 rounded-lg text-sm ${n.read ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
                <NotificationIcon type={n.type} />
                <div className="flex-1">
                  <p className={n.read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100 font-medium'}>{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}

function EventIcon({ type }) {
  const icons = {
    birthday: { bg: 'bg-pink-100 dark:bg-pink-900/30', color: 'text-pink-600 dark:text-pink-400', d: 'M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0A1.75 1.75 0 013 15.546V12a1 1 0 011-1h16a1 1 0 011 1v3.546zM12 3v4m-4-1l4 1m4-1l-4 1' },
    anniversary: { bg: 'bg-red-100 dark:bg-red-900/30', color: 'text-red-600 dark:text-red-400', d: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
    holiday: { bg: 'bg-green-100 dark:bg-green-900/30', color: 'text-green-600 dark:text-green-400', d: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
    other: { bg: 'bg-gray-100 dark:bg-gray-700', color: 'text-gray-600 dark:text-gray-400', d: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7' },
  };
  const icon = icons[type] || icons.other;
  return (
    <div className={`w-8 h-8 rounded-full ${icon.bg} flex items-center justify-center flex-shrink-0`}>
      <svg className={`w-4 h-4 ${icon.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon.d} />
      </svg>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-gray-100 text-gray-700',
    ordered: 'bg-blue-100 text-blue-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    issue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`badge ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

function NotificationIcon({ type }) {
  const icons = {
    event_reminder: 'text-blue-500',
    approval_needed: 'text-amber-500',
    delivery_issue: 'text-red-500',
    delivery_confirmed: 'text-green-500',
    budget_warning: 'text-orange-500',
    emergency_stop: 'text-red-600',
  };
  return (
    <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${icons[type] || 'text-gray-400'}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}
