const express = require('express');
const fs = require('fs');
const { getDb, DB_PATH } = require('../database');
const { logAudit } = require('../audit');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

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

// GET /api/backup/export — export all data as JSON
router.get('/export', (req, res) => {
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

// GET /api/backup/download — download the raw SQLite database file
router.get('/download', (req, res) => {
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

// POST /api/backup/restore — restore from a JSON export
router.post('/restore', (req, res) => {
  const data = req.body;

  if (!data || !data.tables || !data.version) {
    return res.status(400).json({ error: 'Invalid backup file. Expected JSON with version and tables.' });
  }

  if (data.version !== 1) {
    return res.status(400).json({ error: `Unsupported backup version: ${data.version}` });
  }

  const db = getDb();

  // Count existing rows for the audit log
  const existingCounts = {};
  for (const table of EXPORT_TABLES) {
    existingCounts[table] = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  }

  // Restore tables in dependency order: clear children first, then parents
  const clearOrder = [...EXPORT_TABLES].reverse();

  const restoreTransaction = db.transaction(() => {
    // Temporarily disable foreign keys for the restore
    db.pragma('foreign_keys = OFF');

    // Clear all tables in reverse dependency order
    for (const table of clearOrder) {
      db.prepare(`DELETE FROM ${table}`).run();
    }

    // Insert data in forward dependency order
    let totalRows = 0;
    for (const table of EXPORT_TABLES) {
      const rows = data.tables[table];
      if (!rows || rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);

      for (const row of rows) {
        stmt.run(...columns.map(col => row[col] !== undefined ? row[col] : null));
        totalRows++;
      }
    }

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');

    return totalRows;
  });

  try {
    const totalRows = restoreTransaction();

    logAudit('restore_backup', 'system', null, {
      source_exported_at: data.exported_at,
      tables_restored: Object.keys(data.tables).length,
      total_rows: totalRows,
    });

    // Build a summary of what was restored
    const summary = {};
    for (const table of EXPORT_TABLES) {
      const rows = data.tables[table] || [];
      if (rows.length > 0 || existingCounts[table] > 0) {
        summary[table] = { before: existingCounts[table], restored: rows.length };
      }
    }

    res.json({
      message: 'Backup restored successfully',
      total_rows: totalRows,
      summary,
    });
  } catch (err) {
    console.error('Restore failed:', err);
    res.status(500).json({ error: 'Restore failed: ' + err.message });
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
    db_path: DB_PATH,
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
