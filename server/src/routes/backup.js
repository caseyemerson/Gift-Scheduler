const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb, DB_PATH } = require('../database');
const { logAudit } = require('../audit');
const { requireAdmin } = require('../middleware');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Confirmation middleware — requires X-Confirm-Action: backup header
function requireConfirmation(req, res, next) {
  if (req.headers['x-confirm-action'] !== 'backup') {
    return res.status(400).json({
      error: 'Backup operations require confirmation. Set the X-Confirm-Action: backup header.',
    });
  }
  next();
}

// All tables to include in a JSON export, in dependency order
const EXPORT_TABLES = [
  'contacts',
  'events',
  'budgets',
  'budget_overrides',
  'gift_recommendations',
  'card_messages',
  'approvals',
  'orders',
  'autonomy_settings',
  'notifications',
  'global_settings',
  'audit_log',
];

// Tables that should NOT be cleared during restore (append-only)
const RESTORE_PROTECTED_TABLES = new Set(['audit_log']);

// Schema allowlist: only these columns are permitted during restore.
// This prevents SQL injection via attacker-controlled column names.
const ALLOWED_COLUMNS = {
  contacts: ['id', 'name', 'email', 'phone', 'relationship', 'birthday', 'anniversary', 'other_date', 'default_gifts', 'preferences', 'constraints', 'notes', 'user_id', 'created_at', 'updated_at'],
  events: ['id', 'contact_id', 'type', 'name', 'date', 'recurring', 'lead_time_days', 'status', 'created_at', 'updated_at'],
  budgets: ['id', 'category', 'default_amount', 'created_at', 'updated_at'],
  budget_overrides: ['id', 'budget_id', 'contact_id', 'amount', 'created_at', 'updated_at'],
  gift_recommendations: ['id', 'event_id', 'name', 'description', 'price', 'retailer', 'url', 'image_url', 'in_stock', 'estimated_delivery', 'reasoning', 'status', 'created_at'],
  card_messages: ['id', 'event_id', 'tone', 'message', 'selected', 'created_at'],
  approvals: ['id', 'event_id', 'gift_recommendation_id', 'card_message_id', 'approved_by', 'status', 'notes', 'created_at'],
  orders: ['id', 'gift_recommendation_id', 'event_id', 'approval_id', 'status', 'tracking_url', 'order_reference', 'ordered_at', 'estimated_delivery', 'actual_delivery', 'issue_description', 'created_at', 'updated_at'],
  autonomy_settings: ['id', 'contact_id', 'event_type', 'level', 'max_budget', 'enabled', 'created_at', 'updated_at'],
  notifications: ['id', 'event_id', 'order_id', 'type', 'message', 'read', 'created_at'],
  global_settings: ['key', 'value', 'updated_at'],
  audit_log: ['id', 'action', 'entity_type', 'entity_id', 'details', 'performed_by', 'created_at'],
};

// Expected value types per column for type validation (L10)
const COLUMN_TYPES = {
  // numeric columns
  default_amount: 'number',
  amount: 'number',
  price: 'number',
  max_budget: 'number',
  recurring: 'number',
  lead_time_days: 'number',
  in_stock: 'number',
  selected: 'number',
  read: 'number',
  enabled: 'number',
};

// Validate a row value against expected types
function validateRowValue(col, value) {
  if (value === null || value === undefined) return true;
  const expectedType = COLUMN_TYPES[col];
  if (!expectedType) return true; // no type constraint — accept any
  if (expectedType === 'number') return typeof value === 'number';
  return true;
}

// GET /api/backup/export — export all data as JSON (admin only, requires confirmation)
router.get('/export', requireAdmin, requireConfirmation, (req, res) => {
  const db = getDb();
  const data = { version: 1, exported_at: new Date().toISOString(), tables: {} };

  for (const table of EXPORT_TABLES) {
    data.tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }

  logAudit('export_backup', 'system', null, {
    format: 'json',
    tables: EXPORT_TABLES.length,
    total_rows: Object.values(data.tables).reduce((sum, rows) => sum + rows.length, 0),
  });

  res.setHeader('Content-Disposition', `attachment; filename="gift-scheduler-backup-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(data);
});

// GET /api/backup/download — download the raw SQLite database file (admin only, requires confirmation)
router.get('/download', requireAdmin, requireConfirmation, (req, res) => {
  const db = getDb();

  // Checkpoint WAL to ensure the .db file has all data
  db.pragma('wal_checkpoint(TRUNCATE)');

  if (!fs.existsSync(DB_PATH)) {
    return res.status(404).json({ error: 'Database file not found' });
  }

  logAudit('download_backup', 'system', null, { format: 'sqlite' });

  const filename = `gift-scheduler-${new Date().toISOString().split('T')[0]}.db`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/x-sqlite3');

  const stream = fs.createReadStream(DB_PATH);
  stream.pipe(res);
});

// POST /api/backup/restore — restore from a JSON export (admin only, requires re-authentication)
router.post('/restore', requireAdmin, requireConfirmation, async (req, res) => {
  const data = req.body;

  if (!data || !data.tables || !data.version) {
    return res.status(400).json({ error: 'Invalid backup file. Expected JSON with version and tables.' });
  }

  if (data.version !== 1) {
    return res.status(400).json({ error: `Unsupported backup version: ${data.version}` });
  }

  // Re-authentication: require current password for destructive restore operation
  const { password } = data;
  if (!password) {
    return res.status(400).json({ error: 'Password is required to confirm restore operation' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Count existing rows for the audit log
  const existingCounts = {};
  for (const table of EXPORT_TABLES) {
    existingCounts[table] = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  }

  // Tables to clear during restore (excludes protected tables like audit_log)
  const restorableTables = EXPORT_TABLES.filter(t => !RESTORE_PROTECTED_TABLES.has(t));
  const clearOrder = [...restorableTables].reverse();

  const restoreTransaction = db.transaction(() => {
    // Temporarily disable foreign keys for the restore
    db.pragma('foreign_keys = OFF');

    try {
      // Clear non-protected tables in reverse dependency order
      for (const table of clearOrder) {
        db.prepare(`DELETE FROM ${table}`).run();
      }

      // Insert data in forward dependency order
      let totalRows = 0;
      let typeErrors = [];
      for (const table of EXPORT_TABLES) {
        const rows = data.tables[table];
        if (!rows || rows.length === 0) continue;

        const allowedCols = ALLOWED_COLUMNS[table];
        if (!allowedCols) continue; // skip unknown tables

        // Filter column names to only those in the allowlist
        const rawColumns = Object.keys(rows[0]);
        const columns = rawColumns.filter(col => allowedCols.includes(col));

        if (columns.length === 0) continue;

        // For protected tables, use INSERT OR IGNORE to append without duplicates
        const insertMode = RESTORE_PROTECTED_TABLES.has(table) ? 'INSERT OR IGNORE' : 'INSERT';
        const placeholders = columns.map(() => '?').join(', ');
        const stmt = db.prepare(`${insertMode} INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);

        for (const row of rows) {
          // Validate value types (L10)
          let hasTypeError = false;
          for (const col of columns) {
            if (!validateRowValue(col, row[col])) {
              typeErrors.push({ table, column: col, expected: COLUMN_TYPES[col], got: typeof row[col] });
              hasTypeError = true;
              break;
            }
          }
          if (hasTypeError) continue; // skip rows with type errors

          stmt.run(...columns.map(col => row[col] !== undefined ? row[col] : null));
          totalRows++;
        }
      }

      return { totalRows, typeErrors };
    } finally {
      // Re-enable foreign keys even if an error occurs
      db.pragma('foreign_keys = ON');
    }
  });

  try {
    const { totalRows, typeErrors } = restoreTransaction();

    logAudit('restore_backup', 'system', null, {
      source_exported_at: data.exported_at,
      tables_restored: Object.keys(data.tables).length,
      total_rows: totalRows,
      type_errors: typeErrors.length,
    });

    // Build a summary of what was restored
    const summary = {};
    for (const table of EXPORT_TABLES) {
      const rows = data.tables[table] || [];
      if (rows.length > 0 || existingCounts[table] > 0) {
        summary[table] = {
          before: existingCounts[table],
          restored: rows.length,
          protected: RESTORE_PROTECTED_TABLES.has(table),
        };
      }
    }

    const response = {
      message: 'Backup restored successfully',
      total_rows: totalRows,
      summary,
    };

    if (typeErrors.length > 0) {
      response.type_errors = typeErrors;
    }

    res.json(response);
  } catch (err) {
    console.error('Restore failed:', err);
    res.status(500).json({ error: 'Restore failed. Check server logs for details.' });
  }
});

// GET /api/backup/status — show database file info
router.get('/status', (req, res) => {
  const db = getDb();

  const counts = {};
  for (const table of EXPORT_TABLES) {
    counts[table] = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  }

  let fileSize = null;
  if (fs.existsSync(DB_PATH)) {
    fileSize = fs.statSync(DB_PATH).size;
  }

  res.json({
    file_size_bytes: fileSize,
    file_size_human: fileSize ? formatBytes(fileSize) : null,
    table_counts: counts,
    total_rows: Object.values(counts).reduce((sum, c) => sum + c, 0),
  });
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

module.exports = router;
