const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');

const router = express.Router();

// List all budgets with overrides
router.get('/', (req, res) => {
  const db = getDb();
  const budgets = db.prepare('SELECT * FROM budgets ORDER BY category').all();

  const result = budgets.map((b) => {
    const overrides = db.prepare(`
      SELECT bo.*, c.name as contact_name
      FROM budget_overrides bo
      JOIN contacts c ON bo.contact_id = c.id
      WHERE bo.budget_id = ?
    `).all(b.id);
    return { ...b, overrides };
  });

  res.json(result);
});

// Get effective budget for a contact and event type
router.get('/effective', (req, res) => {
  const db = getDb();
  const { contact_id, category } = req.query;

  if (!contact_id || !category) {
    return res.status(400).json({ error: 'contact_id and category are required' });
  }

  const budget = db.prepare('SELECT * FROM budgets WHERE category = ?').get(category);
  if (!budget) return res.status(404).json({ error: 'Budget category not found' });

  const override = db.prepare(
    'SELECT * FROM budget_overrides WHERE budget_id = ? AND contact_id = ?'
  ).get(budget.id, contact_id);

  res.json({
    category,
    amount: override ? override.amount : budget.default_amount,
    is_override: !!override,
    budget_id: budget.id,
  });
});

// Update default budget amount
router.put('/:id', (req, res) => {
  const db = getDb();
  const { default_amount } = req.body;

  if (default_amount === undefined || default_amount < 0) {
    return res.status(400).json({ error: 'Valid default_amount is required' });
  }

  const existing = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Budget not found' });

  db.prepare(`
    UPDATE budgets SET default_amount = ?, updated_at = datetime('now') WHERE id = ?
  `).run(default_amount, req.params.id);

  logAudit('update', 'budget', req.params.id, {
    category: existing.category,
    old_amount: existing.default_amount,
    new_amount: default_amount,
  });

  const updated = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Set budget override for a contact
router.post('/overrides', (req, res) => {
  const db = getDb();
  const { budget_id, contact_id, amount } = req.body;

  if (!budget_id || !contact_id || amount === undefined) {
    return res.status(400).json({ error: 'budget_id, contact_id, and amount are required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO budget_overrides (id, budget_id, contact_id, amount)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(budget_id, contact_id) DO UPDATE SET amount = ?, updated_at = datetime('now')
  `).run(id, budget_id, contact_id, amount, amount);

  logAudit('set_override', 'budget_override', id, { budget_id, contact_id, amount });

  res.status(201).json({ id, budget_id, contact_id, amount });
});

// Delete budget override
router.delete('/overrides/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM budget_overrides WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Override not found' });

  db.prepare('DELETE FROM budget_overrides WHERE id = ?').run(req.params.id);
  logAudit('delete', 'budget_override', req.params.id, existing);

  res.json({ message: 'Override deleted' });
});

module.exports = router;
