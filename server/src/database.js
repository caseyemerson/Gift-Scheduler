const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gift_scheduler.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      relationship TEXT NOT NULL,
      preferences TEXT DEFAULT '{}',
      constraints TEXT DEFAULT '{}',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('birthday', 'anniversary', 'holiday', 'other')),
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      recurring INTEGER DEFAULT 1,
      lead_time_days INTEGER DEFAULT 14,
      status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'in_progress', 'completed', 'missed')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL UNIQUE,
      default_amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_overrides (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      UNIQUE(budget_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS gift_recommendations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      retailer TEXT NOT NULL,
      url TEXT,
      image_url TEXT,
      in_stock INTEGER DEFAULT 1,
      estimated_delivery TEXT,
      reasoning TEXT,
      status TEXT DEFAULT 'recommended' CHECK(status IN ('recommended', 'approved', 'rejected', 'purchased')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_messages (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      tone TEXT NOT NULL CHECK(tone IN ('warm', 'formal', 'humorous', 'heartfelt', 'casual')),
      message TEXT NOT NULL,
      selected INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      gift_recommendation_id TEXT,
      card_message_id TEXT,
      approved_by TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (gift_recommendation_id) REFERENCES gift_recommendations(id) ON DELETE SET NULL,
      FOREIGN KEY (card_message_id) REFERENCES card_messages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      gift_recommendation_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      approval_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'ordered', 'shipped', 'delivered', 'issue', 'cancelled')),
      tracking_url TEXT,
      order_reference TEXT,
      ordered_at TEXT,
      estimated_delivery TEXT,
      actual_delivery TEXT,
      issue_description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (gift_recommendation_id) REFERENCES gift_recommendations(id),
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (approval_id) REFERENCES approvals(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT DEFAULT '{}',
      performed_by TEXT DEFAULT 'system',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS autonomy_settings (
      id TEXT PRIMARY KEY,
      contact_id TEXT,
      event_type TEXT,
      level TEXT DEFAULT 'manual' CHECK(level IN ('manual', 'auto_recommend', 'auto_purchase')),
      max_budget REAL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      event_id TEXT,
      order_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('event_reminder', 'approval_needed', 'delivery_issue', 'delivery_confirmed', 'budget_warning', 'emergency_stop')),
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Insert default budgets if not exist
    INSERT OR IGNORE INTO budgets (id, category, default_amount) VALUES
      ('budget_birthday', 'birthday', 50.00),
      ('budget_anniversary', 'anniversary', 75.00),
      ('budget_holiday', 'holiday', 40.00),
      ('budget_other', 'other', 30.00);

    -- Insert default global settings
    INSERT OR IGNORE INTO global_settings (key, value) VALUES
      ('emergency_stop', 'false'),
      ('default_lead_time_days', '14'),
      ('autonomy_global_level', 'manual');

    CREATE INDEX IF NOT EXISTS idx_events_contact ON events(contact_id);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
    CREATE INDEX IF NOT EXISTS idx_gift_rec_event ON gift_recommendations(event_id);
    CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  `);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb, DB_PATH };
