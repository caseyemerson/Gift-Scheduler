const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Dashboard summary
router.get('/', (req, res) => {
  const db = getDb();

  const totalContacts = db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;

  const upcomingEvents = db.prepare(`
    SELECT e.*, c.name as contact_name, c.relationship
    FROM events e
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.date >= date('now')
    ORDER BY e.date ASC
    LIMIT 10
  `).all();

  const eventsNeedingAction = db.prepare(`
    SELECT e.*, c.name as contact_name
    FROM events e
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.status IN ('upcoming', 'in_progress')
    AND e.date >= date('now')
    AND e.date <= date('now', '+' || e.lead_time_days || ' days')
    ORDER BY e.date ASC
  `).all();

  const activeOrders = db.prepare(`
    SELECT o.*, gr.name as gift_name, e.name as event_name, c.name as contact_name
    FROM orders o
    JOIN gift_recommendations gr ON o.gift_recommendation_id = gr.id
    JOIN events e ON o.event_id = e.id
    JOIN contacts c ON e.contact_id = c.id
    WHERE o.status IN ('ordered', 'shipped')
    ORDER BY o.estimated_delivery ASC
  `).all();

  const recentDeliveries = db.prepare(`
    SELECT o.*, gr.name as gift_name, e.name as event_name, c.name as contact_name
    FROM orders o
    JOIN gift_recommendations gr ON o.gift_recommendation_id = gr.id
    JOIN events e ON o.event_id = e.id
    JOIN contacts c ON e.contact_id = c.id
    WHERE o.status = 'delivered'
    ORDER BY o.actual_delivery DESC
    LIMIT 5
  `).all();

  const unreadNotifications = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get().count;

  const emergencyStop = db.prepare("SELECT value FROM global_settings WHERE key = 'emergency_stop'").get();

  const totalSpent = db.prepare(`
    SELECT COALESCE(SUM(gr.price), 0) as total
    FROM orders o
    JOIN gift_recommendations gr ON o.gift_recommendation_id = gr.id
    WHERE o.status NOT IN ('cancelled')
  `).get().total;

  const ordersByStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM orders GROUP BY status
  `).all();

  res.json({
    totalContacts,
    upcomingEvents,
    eventsNeedingAction,
    activeOrders,
    recentDeliveries,
    unreadNotifications,
    emergencyStop: emergencyStop ? emergencyStop.value === 'true' : false,
    totalSpent: Math.round(totalSpent * 100) / 100,
    ordersByStatus,
  });
});

module.exports = router;
