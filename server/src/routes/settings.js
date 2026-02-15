const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');
const { requireAdmin } = require('../middleware');

const router = express.Router();

// Allowlist of valid setting keys — prevents arbitrary key injection
const ALLOWED_SETTINGS_KEYS = [
  'emergency_stop',
  'default_lead_time_days',
  'autonomy_global_level',
];

// Get all global settings
router.get('/', (req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM global_settings').all();
  const result = {};
  settings.forEach((s) => { result[s.key] = s.value; });
  res.json(result);
});

// Update a global setting (admin only, key must be in allowlist)
router.put('/:key', requireAdmin, (req, res) => {
  const db = getDb();
  const { value } = req.body;

  if (!ALLOWED_SETTINGS_KEYS.includes(req.params.key)) {
    return res.status(400).json({ error: 'Unknown setting key' });
  }

  if (value === undefined) return res.status(400).json({ error: 'Value is required' });

  db.prepare(`
    INSERT INTO global_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).run(req.params.key, String(value), String(value));

  logAudit('update_setting', 'global_settings', req.params.key, { value });

  res.json({ key: req.params.key, value: String(value) });
});

// Emergency stop (admin only)
router.post('/emergency-stop', requireAdmin, (req, res) => {
  const db = getDb();
  const { activate } = req.body;
  const value = activate ? 'true' : 'false';

  db.prepare("UPDATE global_settings SET value = ?, updated_at = datetime('now') WHERE key = 'emergency_stop'")
    .run(value);

  logAudit('emergency_stop', 'global_settings', 'emergency_stop', { activated: activate });

  if (activate) {
    // Cancel all pending orders
    const pendingOrders = db.prepare("SELECT * FROM orders WHERE status IN ('pending', 'ordered')").all();
    for (const order of pendingOrders) {
      db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(order.id);
      logAudit('cancel_order', 'order', order.id, { reason: 'Emergency stop activated' });
    }

    // Create emergency notification
    const notifId = uuidv4();
    db.prepare(`
      INSERT INTO notifications (id, type, message)
      VALUES (?, 'emergency_stop', 'EMERGENCY STOP ACTIVATED: All purchasing has been disabled and pending orders cancelled.')
    `).run(notifId);

    res.json({
      emergency_stop: true,
      cancelled_orders: pendingOrders.length,
      message: 'Emergency stop activated. All purchasing disabled.',
    });
  } else {
    const notifId = uuidv4();
    db.prepare(`
      INSERT INTO notifications (id, type, message)
      VALUES (?, 'emergency_stop', 'Emergency stop deactivated. Purchasing is now enabled.')
    `).run(notifId);

    res.json({
      emergency_stop: false,
      message: 'Emergency stop deactivated. Purchasing re-enabled.',
    });
  }
});

// Autonomy settings
router.get('/autonomy', (req, res) => {
  const db = getDb();
  const settings = db.prepare(`
    SELECT a.*, c.name as contact_name
    FROM autonomy_settings a
    LEFT JOIN contacts c ON a.contact_id = c.id
    ORDER BY a.created_at DESC
  `).all();
  res.json(settings);
});

router.post('/autonomy', requireAdmin, (req, res) => {
  const db = getDb();
  const { contact_id, event_type, level, max_budget } = req.body;

  if (!level || !['manual', 'auto_recommend', 'auto_purchase'].includes(level)) {
    return res.status(400).json({ error: 'Valid level is required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO autonomy_settings (id, contact_id, event_type, level, max_budget)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, contact_id || null, event_type || null, level, max_budget || null);

  logAudit('set_autonomy', 'autonomy_settings', id, { contact_id, event_type, level, max_budget });

  res.status(201).json({ id, contact_id, event_type, level, max_budget });
});

router.put('/autonomy/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { level, max_budget, enabled } = req.body;

  const existing = db.prepare('SELECT * FROM autonomy_settings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Autonomy setting not found' });

  db.prepare(`
    UPDATE autonomy_settings SET
      level = COALESCE(?, level),
      max_budget = COALESCE(?, max_budget),
      enabled = COALESCE(?, enabled),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(level || null, max_budget || null, enabled !== undefined ? enabled : null, req.params.id);

  logAudit('update_autonomy', 'autonomy_settings', req.params.id, { level, max_budget, enabled });

  const updated = db.prepare('SELECT * FROM autonomy_settings WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Audit log endpoint (admin only — contains operational details)
router.get('/audit', requireAdmin, (req, res) => {
  const db = getDb();
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (req.query.entity_type) {
    query += ' AND entity_type = ?';
    params.push(req.query.entity_type);
  }
  if (req.query.entity_id) {
    query += ' AND entity_id = ?';
    params.push(req.query.entity_id);
  }

  query += ' ORDER BY created_at DESC';
  query += ' LIMIT ?';
  params.push(parseInt(req.query.limit) || 100);

  const logs = db.prepare(query).all(...params);
  const parsed = logs.map((l) => ({
    ...l,
    details: JSON.parse(l.details || '{}'),
  }));
  res.json(parsed);
});

module.exports = router;
