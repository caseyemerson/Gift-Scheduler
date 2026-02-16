const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');

const router = express.Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// List events with optional filters (scoped by contact ownership)
router.get('/', (req, res) => {
  const db = getDb();
  let query = `
    SELECT e.*, c.name as contact_name, c.relationship
    FROM events e
    JOIN contacts c ON e.contact_id = c.id
    WHERE 1=1
  `;
  const params = [];

  // Ownership scoping: non-admin users only see events for their own contacts
  if (req.user.role !== 'admin') {
    query += ' AND (c.user_id = ? OR c.user_id IS NULL)';
    params.push(req.user.id);
  }

  if (req.query.status) {
    query += ' AND e.status = ?';
    params.push(req.query.status);
  }
  if (req.query.type) {
    query += ' AND e.type = ?';
    params.push(req.query.type);
  }
  if (req.query.upcoming === 'true') {
    query += " AND e.date >= date('now')";
  }

  query += ' ORDER BY e.date ASC';

  if (req.query.limit) {
    const limit = parseInt(req.query.limit, 10);
    if (Number.isFinite(limit) && limit > 0) {
      query += ' LIMIT ?';
      params.push(Math.min(limit, 1000));
    }
  }

  const events = db.prepare(query).all(...params);
  res.json(events);
});

// Get single event with recommendations and messages
router.get('/:id', (req, res) => {
  const db = getDb();
  const event = db.prepare(`
    SELECT e.*, c.name as contact_name, c.relationship, c.preferences, c.constraints, c.user_id as contact_user_id
    FROM events e
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Ownership check
  if (req.user.role !== 'admin' && event.contact_user_id && event.contact_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const recommendations = db.prepare(
    'SELECT * FROM gift_recommendations WHERE event_id = ? ORDER BY price ASC'
  ).all(req.params.id);

  const cardMessages = db.prepare(
    'SELECT * FROM card_messages WHERE event_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  const approvals = db.prepare(
    'SELECT * FROM approvals WHERE event_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  const orders = db.prepare(
    'SELECT * FROM orders WHERE event_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  // Remove internal field from response
  const { contact_user_id, ...eventData } = event;

  res.json({
    ...eventData,
    preferences: JSON.parse(event.preferences || '{}'),
    constraints: JSON.parse(event.constraints || '{}'),
    recommendations,
    cardMessages,
    approvals,
    orders,
  });
});

// Create event
router.post('/', (req, res) => {
  const db = getDb();
  const { contact_id, type, name, date, recurring, lead_time_days } = req.body;

  if (!contact_id || !type || !name || !date) {
    return res.status(400).json({ error: 'contact_id, type, name, and date are required' });
  }

  // Validate date format
  if (date && !DATE_REGEX.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
  if (!contact) return res.status(400).json({ error: 'Contact not found' });

  // Ownership check on contact
  if (req.user.role !== 'admin' && contact.user_id && contact.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO events (id, contact_id, type, name, date, recurring, lead_time_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, contact_id, type, name, date, recurring !== undefined ? recurring : 1, lead_time_days || 14);

  logAudit('create', 'event', id, { contact_id, type, name, date });

  const event = db.prepare(`
    SELECT e.*, c.name as contact_name
    FROM events e JOIN contacts c ON e.contact_id = c.id
    WHERE e.id = ?
  `).get(id);
  res.status(201).json(event);
});

// Update event
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare(`
    SELECT e.*, c.user_id as contact_user_id
    FROM events e JOIN contacts c ON e.contact_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  // Ownership check
  if (req.user.role !== 'admin' && existing.contact_user_id && existing.contact_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { type, name, date, recurring, lead_time_days, status } = req.body;

  // Validate date format
  if (date && !DATE_REGEX.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }

  db.prepare(`
    UPDATE events SET
      type = COALESCE(?, type),
      name = COALESCE(?, name),
      date = COALESCE(?, date),
      recurring = COALESCE(?, recurring),
      lead_time_days = COALESCE(?, lead_time_days),
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    type || null, name || null, date || null,
    recurring !== undefined ? recurring : null,
    lead_time_days || null, status || null,
    req.params.id
  );

  logAudit('update', 'event', req.params.id, { changes: req.body });

  const updated = db.prepare(`
    SELECT e.*, c.name as contact_name
    FROM events e JOIN contacts c ON e.contact_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// Delete event
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare(`
    SELECT e.*, c.user_id as contact_user_id
    FROM events e JOIN contacts c ON e.contact_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  // Ownership check
  if (req.user.role !== 'admin' && existing.contact_user_id && existing.contact_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  logAudit('delete', 'event', req.params.id, { name: existing.name });

  res.json({ message: 'Event deleted' });
});

module.exports = router;
