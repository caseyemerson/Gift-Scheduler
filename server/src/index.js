const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { getDb, closeDb } = require('./database');

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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
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

// Initialize database on startup
getDb();
console.log('Database initialized');

const server = app.listen(PORT, () => {
  console.log(`Gift Scheduler API running on port ${PORT}`);
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
