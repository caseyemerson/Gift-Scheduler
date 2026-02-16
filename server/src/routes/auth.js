const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { generateToken, requireAuth } = require('../middleware');
const { logAudit } = require('../audit');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

// GET /api/auth/status — check if setup is required or if user is authenticated
router.get('/status', (req, res) => {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

  if (userCount === 0) {
    return res.json({ setup_required: true, authenticated: false });
  }

  // Check if a valid token was provided
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { verifyToken } = require('../middleware');
      const payload = verifyToken(token);
      const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(payload.id);
      if (user) {
        return res.json({
          setup_required: false,
          authenticated: true,
          user: { id: user.id, username: user.username, role: user.role },
        });
      }
    } catch {
      // Token invalid or expired — fall through to unauthenticated
    }
  }

  res.json({ setup_required: false, authenticated: false });
});

// POST /api/auth/setup — create the first admin user (only when no users exist)
router.post('/setup', async (req, res) => {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

  if (userCount > 0) {
    return res.status(400).json({ error: 'Setup already completed. Use login instead.' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, alphanumeric and underscores only' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'admin')
  `).run(id, username, passwordHash);

  logAudit('create_user', 'user', id, { username, role: 'admin', source: 'setup' });

  const token = generateToken({ id, username, role: 'admin', token_version: 0 });

  res.status(201).json({
    message: 'Admin account created',
    token,
    user: { id, username, role: 'admin' },
  });
});

// POST /api/auth/login — authenticate and return JWT
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  logAudit('login', 'user', user.id, { username: user.username });

  const token = generateToken({ id: user.id, username: user.username, role: user.role, token_version: user.token_version });

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

// PUT /api/auth/password — change password (requires auth)
router.put('/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  const newTokenVersion = (user.token_version || 0) + 1;
  db.prepare("UPDATE users SET password_hash = ?, token_version = ?, updated_at = datetime('now') WHERE id = ?")
    .run(passwordHash, newTokenVersion, req.user.id);

  logAudit('change_password', 'user', req.user.id, { username: req.user.username });

  // Issue a new token with the updated version so the current session remains valid
  const token = generateToken({ id: user.id, username: user.username, role: user.role, token_version: newTokenVersion });

  res.json({ message: 'Password updated', token });
});

// POST /api/auth/users — create a new user (admin only)
router.post('/users', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, alphanumeric and underscores only' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const userRole = (role === 'admin' || role === 'user') ? role : 'user';

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)
  `).run(id, username, passwordHash, userRole);

  logAudit('create_user', 'user', id, { username, role: userRole, created_by: req.user.username });

  res.status(201).json({
    message: 'User created',
    user: { id, username, role: userRole },
  });
});

module.exports = router;
