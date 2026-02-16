const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDb, closeDb } = require('./database');
const { requireAuth } = require('./middleware');

const authRouter = require('./routes/auth');
const contactsRouter = require('./routes/contacts');
const eventsRouter = require('./routes/events');
const budgetsRouter = require('./routes/budgets');
const giftsRouter = require('./routes/gifts');
const cardsRouter = require('./routes/cards');
const approvalsRouter = require('./routes/approvals');
const ordersRouter = require('./routes/orders');
const notificationsRouter = require('./routes/notifications');
const settingsRouter = require('./routes/settings');
const dashboardRouter = require('./routes/dashboard');
const integrationsRouter = require('./routes/integrations');
const backupRouter = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 3001;

// Determine allowed origin for CORS
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || (
  process.env.NODE_ENV === 'production'
    ? undefined  // In production with no explicit origin, only allow same-origin
    : 'http://localhost:5173'
);

// Middleware — security headers with Content Security Policy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// CORS — restricted to application origin only
app.use(cors({
  origin: ALLOWED_ORIGIN || false,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting — general API limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', apiLimiter);

// Stricter rate limits for auth endpoints (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', authLimiter);

// Stricter rate limits for sensitive operations
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests to this endpoint, please try again later' },
});
app.use('/api/backup', sensitiveLimiter);
app.use('/api/settings/emergency-stop', sensitiveLimiter);
app.use('/api/orders', sensitiveLimiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Public routes (no authentication required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);

// Authentication middleware — all routes below require a valid JWT
app.use('/api', requireAuth);

// Protected API routes
app.use('/api/contacts', contactsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/gifts', giftsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/backup', backupRouter);

// Serve static frontend in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start listening first so the health check endpoint is available immediately
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gift Scheduler API running on port ${PORT}`);

  // Initialize database after server is listening
  getDb();
  console.log('Database initialized');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

module.exports = app;
