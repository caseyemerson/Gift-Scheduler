const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');

const router = express.Router();

// Check emergency stop before any approval
function checkEmergencyStop(req, res, next) {
  const db = getDb();
  const setting = db.prepare("SELECT value FROM global_settings WHERE key = 'emergency_stop'").get();
  if (setting && setting.value === 'true') {
    return res.status(403).json({
      error: 'Emergency stop is active. All purchasing is disabled.',
      emergency_stop: true,
    });
  }
  next();
}

// Submit approval for an event (gift + card)
router.post('/', checkEmergencyStop, (req, res) => {
  const db = getDb();
  const { event_id, gift_recommendation_id, card_message_id, approved_by, status, notes } = req.body;

  if (!event_id || !approved_by || !status) {
    return res.status(400).json({ error: 'event_id, approved_by, and status are required' });
  }

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Validate gift recommendation if provided
  if (gift_recommendation_id) {
    const gift = db.prepare('SELECT * FROM gift_recommendations WHERE id = ?').get(gift_recommendation_id);
    if (!gift) return res.status(404).json({ error: 'Gift recommendation not found' });

    // Check budget compliance
    const budget = db.prepare('SELECT * FROM budgets WHERE category = ?').get(event.type);
    const override = db.prepare(
      'SELECT * FROM budget_overrides WHERE budget_id = ? AND contact_id = ?'
    ).get(budget?.id, event.contact_id);
    const effectiveBudget = override ? override.amount : (budget ? budget.default_amount : 50);

    if (gift.price > effectiveBudget) {
      logAudit('budget_warning', 'approval', null, {
        event_id,
        gift_price: gift.price,
        budget: effectiveBudget,
      });
      // Allow but warn
      res.setHeader('X-Budget-Warning', `Gift price $${gift.price} exceeds budget $${effectiveBudget}`);
    }
  }

  // Validate card message if provided
  if (card_message_id) {
    const card = db.prepare('SELECT * FROM card_messages WHERE id = ?').get(card_message_id);
    if (!card) return res.status(404).json({ error: 'Card message not found' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO approvals (id, event_id, gift_recommendation_id, card_message_id, approved_by, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, event_id, gift_recommendation_id || null, card_message_id || null, approved_by, status, notes || '');

  // Update gift status
  if (gift_recommendation_id && status === 'approved') {
    db.prepare("UPDATE gift_recommendations SET status = 'approved' WHERE id = ?").run(gift_recommendation_id);
  } else if (gift_recommendation_id && status === 'rejected') {
    db.prepare("UPDATE gift_recommendations SET status = 'rejected' WHERE id = ?").run(gift_recommendation_id);
  }

  // Select card message
  if (card_message_id && status === 'approved') {
    db.prepare('UPDATE card_messages SET selected = 0 WHERE event_id = ?').run(event_id);
    db.prepare('UPDATE card_messages SET selected = 1 WHERE id = ?').run(card_message_id);
  }

  logAudit(status === 'approved' ? 'approve' : 'reject', 'approval', id, {
    event_id,
    gift_recommendation_id,
    card_message_id,
    approved_by,
    notes,
  });

  // Create notification
  const notifId = uuidv4();
  const notifMessage = status === 'approved'
    ? `Gift approved for event. Ready to place order.`
    : `Gift rejected for event. Please select an alternative.`;
  db.prepare(`
    INSERT INTO notifications (id, event_id, type, message)
    VALUES (?, ?, 'approval_needed', ?)
  `).run(notifId, event_id, notifMessage);

  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
  res.status(201).json(approval);
});

// Get approvals for an event
router.get('/event/:eventId', (req, res) => {
  const db = getDb();
  const approvals = db.prepare(
    'SELECT * FROM approvals WHERE event_id = ? ORDER BY created_at DESC'
  ).all(req.params.eventId);
  res.json(approvals);
});

// Get all pending approvals
router.get('/pending', (req, res) => {
  const db = getDb();
  const pending = db.prepare(`
    SELECT a.*, e.name as event_name, e.date as event_date, c.name as contact_name
    FROM approvals a
    JOIN events e ON a.event_id = e.id
    JOIN contacts c ON e.contact_id = c.id
    WHERE a.status = 'pending'
    ORDER BY e.date ASC
  `).all();
  res.json(pending);
});

module.exports = router;
