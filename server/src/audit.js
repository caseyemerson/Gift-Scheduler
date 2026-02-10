const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');

function logAudit(action, entityType, entityId, details = {}, performedBy = 'owner') {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_log (id, action, entity_type, entity_id, details, performed_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(uuidv4(), action, entityType, entityId, JSON.stringify(details), performedBy);
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
