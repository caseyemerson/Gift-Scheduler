import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { api } from './api';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Events from './pages/Events';
import EventDetail from './pages/EventDetail';
import Budgets from './pages/Budgets';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import AuditLog from './pages/AuditLog';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { path: '/contacts', label: 'Contacts', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { path: '/events', label: 'Events', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { path: '/budgets', label: 'Budgets', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { path: '/orders', label: 'Orders', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { path: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { path: '/audit', label: 'Audit Log', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
];

export default function App() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emergencyStop, setEmergencyStop] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  async function loadStatus() {
    try {
      const [notifs, settings] = await Promise.all([
        api.getUnreadCount(),
        api.getSettings(),
      ]);
      setUnreadCount(notifs.unread);
      setEmergencyStop(settings.emergency_stop === 'true');
    } catch {
      // Server may not be ready yet
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Emergency stop banner */}
      {emergencyStop && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-center py-2 px-4 font-medium">
          EMERGENCY STOP ACTIVE - All purchasing disabled
          <Link to="/settings" className="ml-4 underline">Manage</Link>
        </div>
      )}

      {/* Mobile header */}
      <div className={`md:hidden flex items-center justify-between bg-white border-b px-4 py-3 ${emergencyStop ? 'mt-10' : ''}`}>
        <h1 className="text-lg font-bold text-primary-700">Gift Scheduler</h1>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={mobileMenuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>

      {/* Sidebar */}
      <nav className={`${mobileMenuOpen ? 'block' : 'hidden'} md:block w-full md:w-64 bg-white border-r border-gray-200 md:min-h-screen flex-shrink-0 ${emergencyStop ? 'md:pt-10' : ''}`}>
        <div className="hidden md:flex items-center gap-3 px-6 py-5 border-b">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
          <span className="font-bold text-lg text-gray-900">Gift Scheduler</span>
        </div>
        <div className="px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
                {item.label === 'Dashboard' && unreadCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className={`flex-1 p-4 md:p-8 overflow-auto ${emergencyStop ? 'md:pt-18' : ''}`}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audit" element={<AuditLog />} />
        </Routes>
      </main>
    </div>
  );
}
