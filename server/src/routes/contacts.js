const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');

const router = express.Router();

// List all contacts
router.get('/', (req, res) => {
  const db = getDb();
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY name').all();
  const parsed = contacts.map((c) => ({
    ...c,
    preferences: JSON.parse(c.preferences || '{}'),
    constraints: JSON.parse(c.constraints || '{}'),
  }));
  res.json(parsed);
});

// Get single contact with gift history
router.get('/:id', (req, res) => {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const events = db.prepare('SELECT * FROM events WHERE contact_id = ? ORDER BY date DESC').all(req.params.id);
  const giftHistory = db.prepare(`
    SELECT gr.*, e.name as event_name, e.date as event_date
    FROM gift_recommendations gr
    JOIN events e ON gr.event_id = e.id
    WHERE e.contact_id = ? AND gr.status = 'purchased'
    ORDER BY e.date DESC
  `).all(req.params.id);

  res.json({
    ...contact,
    preferences: JSON.parse(contact.preferences || '{}'),
    constraints: JSON.parse(contact.constraints || '{}'),
    events,
    giftHistory,
  });
});

// Create contact
router.post('/', (req, res) => {
  const db = getDb();
  const { name, email, phone, relationship, preferences, constraints, notes } = req.body;

  if (!name || !relationship) {
    return res.status(400).json({ error: 'Name and relationship are required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO contacts (id, name, email, phone, relationship, preferences, constraints, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email || null, phone || null, relationship,
    JSON.stringify(preferences || {}), JSON.stringify(constraints || {}), notes || '');

  logAudit('create', 'contact', id, { name, relationship });

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  res.status(201).json({
    ...contact,
    preferences: JSON.parse(contact.preferences || '{}'),
    constraints: JSON.parse(contact.constraints || '{}'),
  });
});

// Update contact
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const { name, email, phone, relationship, preferences, constraints, notes } = req.body;

  db.prepare(`
    UPDATE contacts SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      relationship = COALESCE(?, relationship),
      preferences = COALESCE(?, preferences),
      constraints = COALESCE(?, constraints),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name || null, email !== undefined ? email : null, phone !== undefined ? phone : null,
    relationship || null,
    preferences ? JSON.stringify(preferences) : null,
    constraints ? JSON.stringify(constraints) : null,
    notes !== undefined ? notes : null,
    req.params.id
  );

  logAudit('update', 'contact', req.params.id, { changes: req.body });

  const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    preferences: JSON.parse(updated.preferences || '{}'),
    constraints: JSON.parse(updated.constraints || '{}'),
  });
});

// Delete contact
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  logAudit('delete', 'contact', req.params.id, { name: existing.name });

  res.json({ message: 'Contact deleted' });
});

module.exports = router;
