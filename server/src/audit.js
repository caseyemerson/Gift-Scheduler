const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');

// PII fields that should never be logged as values in audit details
const PII_FIELDS = ['email', 'phone', 'birthday', 'anniversary', 'other_date'];

// Sanitize details object: replace PII field values with "[redacted]"
// while preserving the fact that the field was changed
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return details;

  const sanitized = {};
  for (const [key, value] of Object.entries(details)) {
    if (PII_FIELDS.includes(key)) {
      sanitized[key] = '[redacted]';
    } else if (key === 'changes' && typeof value === 'object') {
      // For update operations that log { changes: req.body },
      // sanitize the nested object and only log which PII fields changed
      sanitized[key] = sanitizeDetails(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function logAudit(action, entityType, entityId, details = {}, performedBy = 'owner') {
  const db = getDb();
  const sanitized = sanitizeDetails(details);
  const stmt = db.prepare(`
    INSERT INTO audit_log (id, action, entity_type, entity_id, details, performed_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(uuidv4(), action, entityType, entityId, JSON.stringify(sanitized), performedBy);
}

function getAuditLog(filters = {}) {
  const db = getDb();
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (filters.entityType) {
    query += ' AND entity_type = ?';
    params.push(filters.entityType);
  }
  if (filters.entityId) {
    query += ' AND entity_id = ?';
    params.push(filters.entityId);
  }
  if (filters.action) {
    query += ' AND action = ?';
    params.push(filters.action);
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  return db.prepare(query).all(...params);
}

module.exports = { logAudit, getAuditLog };
