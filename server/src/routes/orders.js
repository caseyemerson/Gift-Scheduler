const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');
const { requireAdmin } = require('../middleware');

const router = express.Router();

// Create order from approved gift (admin only)
router.post('/', requireAdmin, (req, res) => {
  const db = getDb();

  // Check emergency stop
  const emergencySetting = db.prepare("SELECT value FROM global_settings WHERE key = 'emergency_stop'").get();
  if (emergencySetting && emergencySetting.value === 'true') {
    return res.status(403).json({
      error: 'Emergency stop is active. All purchasing is disabled.',
      emergency_stop: true,
    });
  }

  const { gift_recommendation_id, event_id, approval_id } = req.body;

  if (!gift_recommendation_id || !event_id || !approval_id) {
    return res.status(400).json({ error: 'gift_recommendation_id, event_id, and approval_id are required' });
  }

  // Verify approval exists and is in 'approved' status
  const approval = db.prepare(
    "SELECT * FROM approvals WHERE id = ? AND status = 'approved'"
  ).get(approval_id);
  if (!approval) {
    return res.status(400).json({ error: 'Valid approval in approved status is required before ordering' });
  }

  const gift = db.prepare('SELECT * FROM gift_recommendations WHERE id = ?').get(gift_recommendation_id);
  if (!gift) return res.status(404).json({ error: 'Gift recommendation not found' });

  const id = uuidv4();
  const orderRef = `GS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const estimatedDelivery = gift.estimated_delivery;

  db.prepare(`
    INSERT INTO orders (id, gift_recommendation_id, event_id, approval_id, status, order_reference, estimated_delivery, ordered_at)
    VALUES (?, ?, ?, ?, 'ordered', ?, ?, datetime('now'))
  `).run(id, gift_recommendation_id, event_id, approval_id, orderRef, estimatedDelivery);

  // Update gift status to purchased
  db.prepare("UPDATE gift_recommendations SET status = 'purchased' WHERE id = ?").run(gift_recommendation_id);

  logAudit('create_order', 'order', id, {
    gift: gift.name,
    price: gift.price,
    retailer: gift.retailer,
    order_reference: orderRef,
  });

  // Create tracking notification
  const notifId = uuidv4();
  db.prepare(`
    INSERT INTO notifications (id, event_id, order_id, type, message)
    VALUES (?, ?, ?, 'delivery_confirmed', ?)
  `).run(notifId, event_id, id, `Order placed: ${gift.name} from ${gift.retailer}. Reference: ${orderRef}`);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.status(201).json(order);
});

// Get all orders
router.get('/', (req, res) => {
  const db = getDb();
  let query = `
    SELECT o.*, gr.name as gift_name, gr.price, gr.retailer,
           e.name as event_name, e.date as event_date, c.name as contact_name
    FROM orders o
    JOIN gift_recommendations gr ON o.gift_recommendation_id = gr.id
    JOIN events e ON o.event_id = e.id
    JOIN contacts c ON e.contact_id = c.id
  `;
  const params = [];

  if (req.query.status) {
    query += ' WHERE o.status = ?';
    params.push(req.query.status);
  }

  query += ' ORDER BY o.created_at DESC';

  const orders = db.prepare(query).all(...params);
  res.json(orders);
});

// Get single order
router.get('/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, gr.name as gift_name, gr.price, gr.retailer, gr.description as gift_description,
           e.name as event_name, e.date as event_date, c.name as contact_name
    FROM orders o
    JOIN gift_recommendations gr ON o.gift_recommendation_id = gr.id
    JOIN events e ON o.event_id = e.id
    JOIN contacts c ON e.contact_id = c.id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// Update order status
router.put('/:id/status', (req, res) => {
  const db = getDb();
  const { status, tracking_url, issue_description } = req.body;

  if (!['pending', 'ordered', 'shipped', 'delivered', 'issue', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  db.prepare(`
    UPDATE orders SET
      status = ?,
      tracking_url = COALESCE(?, tracking_url),
      issue_description = COALESCE(?, issue_description),
      actual_delivery = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE actual_delivery END,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(status, tracking_url || null, issue_description || null, status, req.params.id);

  logAudit('update_status', 'order', req.params.id, {
    old_status: existing.status,
    new_status: status,
  });

  // Create notification for issues
  if (status === 'issue') {
    const notifId = uuidv4();
    db.prepare(`
      INSERT INTO notifications (id, event_id, order_id, type, message)
      VALUES (?, ?, ?, 'delivery_issue', ?)
    `).run(notifId, existing.event_id, req.params.id,
      `Delivery issue with order ${existing.order_reference}: ${issue_description || 'Unknown issue'}`);
  }

  if (status === 'delivered') {
    // Update event status
    db.prepare("UPDATE events SET status = 'completed', updated_at = datetime('now') WHERE id = ?")
      .run(existing.event_id);

    const notifId = uuidv4();
    db.prepare(`
      INSERT INTO notifications (id, event_id, order_id, type, message)
      VALUES (?, ?, ?, 'delivery_confirmed', ?)
    `).run(notifId, existing.event_id, req.params.id,
      `Order ${existing.order_reference} has been delivered!`);
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json(updated);
});

module.exports = router;
