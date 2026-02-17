const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');

const router = express.Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Helper: validate date format (YYYY-MM-DD)
function isValidDate(dateStr) {
  if (!dateStr) return true; // null/undefined dates are allowed
  return DATE_REGEX.test(dateStr);
}

// Helper: create events for a contact based on their dates
function createEventsForContact(db, contactId, contactName, { birthday, anniversary, other_date }) {
  const insertEvent = db.prepare(`
    INSERT INTO events (id, contact_id, type, name, date, recurring, lead_time_days, status)
    VALUES (?, ?, ?, ?, ?, 1, 14, 'upcoming')
  `);

  const created = [];

  if (birthday) {
    const eventId = uuidv4();
    insertEvent.run(eventId, contactId, 'birthday', `${contactName}'s Birthday`, birthday);
    logAudit('create', 'event', eventId, { name: `${contactName}'s Birthday`, auto_created: true });
    created.push(eventId);
  }

  if (anniversary) {
    const eventId = uuidv4();
    insertEvent.run(eventId, contactId, 'anniversary', `${contactName}'s Anniversary`, anniversary);
    logAudit('create', 'event', eventId, { name: `${contactName}'s Anniversary`, auto_created: true });
    created.push(eventId);
  }

  if (other_date) {
    const eventId = uuidv4();
    insertEvent.run(eventId, contactId, 'other', `${contactName}'s Special Day`, other_date);
    logAudit('create', 'event', eventId, { name: `${contactName}'s Special Day`, auto_created: true });
    created.push(eventId);
  }

  return created;
}

// Helper: build ownership filter for contacts queries
function ownershipFilter(req) {
  if (req.user.role === 'admin') {
    return { clause: '', params: [] };
  }
  return { clause: ' AND (c.user_id = ? OR c.user_id IS NULL)', params: [req.user.id] };
}

// List all contacts (scoped by user ownership)
router.get('/', (req, res) => {
  const db = getDb();
  let query = 'SELECT * FROM contacts c WHERE 1=1';
  const params = [];

  if (req.user.role !== 'admin') {
    query += ' AND (c.user_id = ? OR c.user_id IS NULL)';
    params.push(req.user.id);
  }

  query += ' ORDER BY c.name';
  const contacts = db.prepare(query).all(...params);
  const parsed = contacts.map((c) => ({
    ...c,
    preferences: JSON.parse(c.preferences || '{}'),
    constraints: JSON.parse(c.constraints || '{}'),
    default_gifts: JSON.parse(c.default_gifts || '{"card":true,"gift":false,"flowers":false}'),
  }));
  res.json(parsed);
});

// Get single contact with gift history (with ownership check)
router.get('/:id', (req, res) => {
  const db = getDb();
  const ownership = requireOwnership(db, req.params.id, req.user.id);
  if (ownership.error) return res.status(ownership.status).json({ error: ownership.error });
  const contact = ownership.contact;

  // Ownership check: non-admin users can only access their own contacts
  if (req.user.role !== 'admin' && contact.user_id && contact.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

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
    default_gifts: JSON.parse(contact.default_gifts || '{"card":true,"gift":false,"flowers":false}'),
    events,
    giftHistory,
  });
});

// Create contact
router.post('/', (req, res) => {
  const db = getDb();
  const { name, email, phone, relationship, birthday, anniversary, other_date, default_gifts, preferences, constraints, notes } = req.body;

  if (!name || !relationship) {
    return res.status(400).json({ error: 'Name and relationship are required' });
  }

  if (!birthday && !anniversary && !other_date) {
    return res.status(400).json({ error: 'At least one date (birthday, anniversary, or other) is required' });
  }

  // Validate date formats (L3)
  for (const [field, value] of [['birthday', birthday], ['anniversary', anniversary], ['other_date', other_date]]) {
    if (value && !isValidDate(value)) {
      return res.status(400).json({ error: `${field} must be in YYYY-MM-DD format` });
    }
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO contacts (id, name, email, phone, relationship, birthday, anniversary, other_date, default_gifts, preferences, constraints, notes, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, email || null, phone || null, relationship,
    birthday || null, anniversary || null, other_date || null,
    JSON.stringify(default_gifts || { card: true, gift: false, flowers: false }),
    JSON.stringify(preferences || {}), JSON.stringify(constraints || {}), notes || '',
    req.user.id);

  logAudit('create', 'contact', id, { name, relationship });

  // Auto-create events for each date
  createEventsForContact(db, id, name, { birthday, anniversary, other_date });

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  const events = db.prepare('SELECT * FROM events WHERE contact_id = ? ORDER BY date DESC').all(id);
  res.status(201).json({
    ...contact,
    preferences: JSON.parse(contact.preferences || '{}'),
    constraints: JSON.parse(contact.constraints || '{}'),
    default_gifts: JSON.parse(contact.default_gifts || '{"card":true,"gift":false,"flowers":false}'),
    events,
  });
});

// Update contact
router.put('/:id', (req, res) => {
  const db = getDb();
  const ownership = requireOwnership(db, req.params.id, req.user.id);
  if (ownership.error) return res.status(ownership.status).json({ error: ownership.error });
  const existing = ownership.contact;

  // Ownership check
  if (req.user.role !== 'admin' && existing.user_id && existing.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, email, phone, relationship, birthday, anniversary, other_date, default_gifts, preferences, constraints, notes } = req.body;

  // Validate date formats (L3)
  for (const [field, value] of [['birthday', birthday], ['anniversary', anniversary], ['other_date', other_date]]) {
    if (value && !isValidDate(value)) {
      return res.status(400).json({ error: `${field} must be in YYYY-MM-DD format` });
    }
  }

  db.prepare(`
    UPDATE contacts SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      relationship = COALESCE(?, relationship),
      birthday = ?,
      anniversary = ?,
      other_date = ?,
      default_gifts = COALESCE(?, default_gifts),
      preferences = COALESCE(?, preferences),
      constraints = COALESCE(?, constraints),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name || null, email !== undefined ? email : null, phone !== undefined ? phone : null,
    relationship || null,
    birthday !== undefined ? (birthday || null) : existing.birthday,
    anniversary !== undefined ? (anniversary || null) : existing.anniversary,
    other_date !== undefined ? (other_date || null) : existing.other_date,
    default_gifts ? JSON.stringify(default_gifts) : null,
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
    default_gifts: JSON.parse(updated.default_gifts || '{"card":true,"gift":false,"flowers":false}'),
  });
});

// Bulk import contacts from CSV or vCard data
router.post('/import', (req, res) => {
  const db = getDb();
  const { contacts: importData } = req.body;

  if (!importData || !Array.isArray(importData) || importData.length === 0) {
    return res.status(400).json({ error: 'No contacts provided for import' });
  }

  const MAX_IMPORT_BATCH = 500;
  if (importData.length > MAX_IMPORT_BATCH) {
    return res.status(400).json({
      error: `Import batch too large. Maximum ${MAX_IMPORT_BATCH} contacts per request (received ${importData.length}).`,
    });
  }

  const imported = [];
  const errors = [];

  const insertStmt = db.prepare(`
    INSERT INTO contacts (id, name, email, phone, relationship, birthday, anniversary, other_date, default_gifts, preferences, constraints, notes, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importMany = db.transaction((rows) => {
    for (const contact of rows) {
      if (!contact.name) {
        errors.push({ contact, error: 'Name is required' });
        continue;
      }
      // For import, we don't require dates since the data may be sparse
      const id = uuidv4();
      try {
        const defaultGifts = contact.default_gifts || { card: true, gift: false, flowers: false };
        insertStmt.run(
          id,
          contact.name,
          contact.email || null,
          contact.phone || null,
          contact.relationship || 'friend',
          contact.birthday || null,
          contact.anniversary || null,
          contact.other_date || null,
          JSON.stringify(defaultGifts),
          JSON.stringify(contact.preferences || {}),
          JSON.stringify(contact.constraints || {}),
          contact.notes || '',
          req.user.id
        );
        // Auto-create events for imported contacts that have dates
        createEventsForContact(db, id, contact.name, {
          birthday: contact.birthday,
          anniversary: contact.anniversary,
          other_date: contact.other_date,
        });
        imported.push({ id, name: contact.name });
        logAudit('create', 'contact', id, { name: contact.name, source: 'bulk_import' });
      } catch (err) {
        errors.push({ contact: contact.name, error: err.message });
      }
    }
  });

  importMany(importData);

  res.status(201).json({
    imported: imported.length,
    errors: errors.length,
    details: { imported, errors },
  });
});

// Delete contact
router.delete('/:id', (req, res) => {
  const db = getDb();
  const ownership = requireOwnership(db, req.params.id, req.user.id);
  if (ownership.error) return res.status(ownership.status).json({ error: ownership.error });
  const existing = ownership.contact;

  // Ownership check
  if (req.user.role !== 'admin' && existing.user_id && existing.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  logAudit('delete', 'contact', req.params.id, { name: existing.name });

  res.json({ message: 'Contact deleted' });
});

module.exports = router;
