const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

// Get all notifications
router.get('/', (req, res) => {
  const db = getDb();
  let query = 'SELECT * FROM notifications';
  const params = [];

  if (req.query.unread === 'true') {
    query += ' WHERE read = 0';
  }

  query += ' ORDER BY created_at DESC';

  if (req.query.limit) {
    query += ' LIMIT ?';
    params.push(parseInt(req.query.limit));
  }

  const notifications = db.prepare(query).all(...params);
  res.json(notifications);
});

// Get unread count
router.get('/count', (req, res) => {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get();
  res.json({ unread: result.count });
});

// Mark notification as read
router.put('/:id/read', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Marked as read' });
});

// Mark all as read
router.put('/read-all', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
  res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
