const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('./database');

// Use AUTH_SECRET from env, or generate a random one (sessions won't persist across restarts)
let AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  AUTH_SECRET = crypto.randomBytes(64).toString('hex');
  console.warn('WARNING: AUTH_SECRET not set. Using a random secret — sessions will not persist across server restarts. Set AUTH_SECRET in your environment for production.');
}

const TOKEN_EXPIRY = '24h';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, token_version: user.token_version || 0 },
    AUTH_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  return jwt.verify(token, AUTH_SECRET);
}

// Middleware: require a valid JWT token
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);

    // Verify user still exists in the database
    const db = getDb();
    const user = db.prepare('SELECT id, username, role, token_version FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // Verify token version matches (tokens are invalidated on password change)
    if (payload.token_version !== undefined && payload.token_version !== user.token_version) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware: require admin role (must be used after requireAuth)
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { generateToken, verifyToken, requireAuth, requireAdmin };
