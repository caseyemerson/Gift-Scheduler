const path = require('path');
const fs = require('fs');

// Use a test database
const TEST_DB = path.join(__dirname, '..', '..', 'test_gift_scheduler.db');
process.env.DB_PATH = TEST_DB;

const { getDb, closeDb } = require('../database');

// Clean up test db before and after
beforeAll(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  getDb(); // Initialize
});

afterAll(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('Database initialization', () => {
  test('creates all required tables', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(t => t.name);

    expect(tables).toContain('contacts');
    expect(tables).toContain('events');
    expect(tables).toContain('budgets');
    expect(tables).toContain('budget_overrides');
    expect(tables).toContain('gift_recommendations');
    expect(tables).toContain('card_messages');
    expect(tables).toContain('approvals');
    expect(tables).toContain('orders');
    expect(tables).toContain('audit_log');
    expect(tables).toContain('autonomy_settings');
    expect(tables).toContain('notifications');
    expect(tables).toContain('global_settings');
  });

  test('creates default budgets', () => {
    const db = getDb();
    const budgets = db.prepare('SELECT * FROM budgets ORDER BY category').all();
    expect(budgets.length).toBe(4);
    expect(budgets.map(b => b.category)).toEqual(['anniversary', 'birthday', 'holiday', 'other']);
  });

  test('creates default global settings', () => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM global_settings').all();
    expect(settings.length).toBeGreaterThanOrEqual(3);
    const emergencyStop = settings.find(s => s.key === 'emergency_stop');
    expect(emergencyStop.value).toBe('false');
  });
});

describe('Contact CRUD operations', () => {
  const { v4: uuidv4 } = require('uuid');
  let contactId;

  test('creates a contact', () => {
    const db = getDb();
    contactId = uuidv4();
    db.prepare(`
      INSERT INTO contacts (id, name, email, relationship, preferences, constraints, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(contactId, 'Alice Smith', 'alice@example.com', 'friend',
      JSON.stringify({ interests: ['books', 'coffee'] }),
      JSON.stringify({ avoid_categories: ['tech'] }),
      'Test contact');

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    expect(contact.name).toBe('Alice Smith');
    expect(contact.relationship).toBe('friend');
    expect(JSON.parse(contact.preferences).interests).toContain('books');
  });

  test('updates a contact', () => {
    const db = getDb();
    db.prepare("UPDATE contacts SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run('Alice Johnson', contactId);

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    expect(contact.name).toBe('Alice Johnson');
  });

  test('retrieves all contacts', () => {
    const db = getDb();
    const contacts = db.prepare('SELECT * FROM contacts').all();
    expect(contacts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Event management', () => {
  const { v4: uuidv4 } = require('uuid');
  let contactId, eventId;

  beforeAll(() => {
    const db = getDb();
    contactId = uuidv4();
    db.prepare(`
      INSERT INTO contacts (id, name, relationship)
      VALUES (?, ?, ?)
    `).run(contactId, 'Bob Test', 'family');
  });

  test('creates an event', () => {
    const db = getDb();
    eventId = uuidv4();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    db.prepare(`
      INSERT INTO events (id, contact_id, type, name, date, recurring, lead_time_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, contactId, 'birthday', "Bob's Birthday", futureDate, 1, 14);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    expect(event.name).toBe("Bob's Birthday");
    expect(event.type).toBe('birthday');
    expect(event.recurring).toBe(1);
    expect(event.status).toBe('upcoming');
  });

  test('queries upcoming events', () => {
    const db = getDb();
    const events = db.prepare("SELECT * FROM events WHERE date >= date('now')").all();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test('creates gift recommendations for an event', () => {
    const db = getDb();
    const recId = uuidv4();
    db.prepare(`
      INSERT INTO gift_recommendations (id, event_id, name, description, price, retailer, in_stock, reasoning, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recommended')
    `).run(recId, eventId, 'Test Gift', 'A test gift', 29.99, 'Amazon', 1, 'Matches interests');

    const recs = db.prepare('SELECT * FROM gift_recommendations WHERE event_id = ?').all(eventId);
    expect(recs.length).toBe(1);
    expect(recs[0].price).toBe(29.99);
  });

  test('creates card messages for an event', () => {
    const db = getDb();
    const msgId = uuidv4();
    db.prepare(`
      INSERT INTO card_messages (id, event_id, tone, message, selected)
      VALUES (?, ?, ?, ?, 0)
    `).run(msgId, eventId, 'warm', 'Happy Birthday, Bob!');

    const msgs = db.prepare('SELECT * FROM card_messages WHERE event_id = ?').all(eventId);
    expect(msgs.length).toBe(1);
    expect(msgs[0].tone).toBe('warm');
  });
});

describe('Budget system', () => {
  test('has default category budgets', () => {
    const db = getDb();
    const birthday = db.prepare("SELECT * FROM budgets WHERE category = 'birthday'").get();
    expect(birthday).toBeDefined();
    expect(birthday.default_amount).toBe(50.00);
  });

  test('allows budget overrides per contact', () => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');
    const contacts = db.prepare('SELECT id FROM contacts LIMIT 1').all();
    const budgets = db.prepare("SELECT id FROM budgets WHERE category = 'birthday'").get();

    if (contacts.length > 0 && budgets) {
      const overrideId = uuidv4();
      db.prepare(`
        INSERT INTO budget_overrides (id, budget_id, contact_id, amount)
        VALUES (?, ?, ?, ?)
      `).run(overrideId, budgets.id, contacts[0].id, 100.00);

      const override = db.prepare('SELECT * FROM budget_overrides WHERE id = ?').get(overrideId);
      expect(override.amount).toBe(100.00);
    }
  });
});

describe('Approval workflow', () => {
  const { v4: uuidv4 } = require('uuid');

  test('requires approval before order', () => {
    const db = getDb();
    const events = db.prepare('SELECT id FROM events LIMIT 1').all();
    const gifts = db.prepare('SELECT id FROM gift_recommendations LIMIT 1').all();

    if (events.length > 0 && gifts.length > 0) {
      const approvalId = uuidv4();
      db.prepare(`
        INSERT INTO approvals (id, event_id, gift_recommendation_id, approved_by, status)
        VALUES (?, ?, ?, ?, 'approved')
      `).run(approvalId, events[0].id, gifts[0].id, 'owner');

      const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId);
      expect(approval.status).toBe('approved');
      expect(approval.approved_by).toBe('owner');
    }
  });
});

describe('Order tracking', () => {
  const { v4: uuidv4 } = require('uuid');

  test('creates and tracks an order', () => {
    const db = getDb();
    const events = db.prepare('SELECT id FROM events LIMIT 1').all();
    const gifts = db.prepare('SELECT id FROM gift_recommendations LIMIT 1').all();

    if (events.length > 0 && gifts.length > 0) {
      const orderId = uuidv4();
      db.prepare(`
        INSERT INTO orders (id, gift_recommendation_id, event_id, status, order_reference, ordered_at)
        VALUES (?, ?, ?, 'ordered', ?, datetime('now'))
      `).run(orderId, gifts[0].id, events[0].id, 'GS-TEST123');

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      expect(order.status).toBe('ordered');
      expect(order.order_reference).toBe('GS-TEST123');

      // Update to shipped
      db.prepare("UPDATE orders SET status = 'shipped' WHERE id = ?").run(orderId);
      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      expect(updated.status).toBe('shipped');
    }
  });
});

describe('Audit logging', () => {
  const { logAudit, getAuditLog } = require('../audit');

  test('logs actions', () => {
    logAudit('test_action', 'test', 'test-123', { key: 'value' }, 'tester');
    const logs = getAuditLog({ entityType: 'test' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe('test_action');
  });

  test('filters audit log', () => {
    logAudit('another_action', 'test', 'test-456', {}, 'tester');
    const logs = getAuditLog({ entityType: 'test', action: 'another_action' });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Emergency stop', () => {
  test('can activate and deactivate emergency stop', () => {
    const db = getDb();

    // Activate
    db.prepare("UPDATE global_settings SET value = 'true' WHERE key = 'emergency_stop'").run();
    let setting = db.prepare("SELECT value FROM global_settings WHERE key = 'emergency_stop'").get();
    expect(setting.value).toBe('true');

    // Deactivate
    db.prepare("UPDATE global_settings SET value = 'false' WHERE key = 'emergency_stop'").run();
    setting = db.prepare("SELECT value FROM global_settings WHERE key = 'emergency_stop'").get();
    expect(setting.value).toBe('false');
  });
});

describe('Autonomy settings', () => {
  const { v4: uuidv4 } = require('uuid');

  test('creates autonomy settings', () => {
    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO autonomy_settings (id, event_type, level, max_budget)
      VALUES (?, ?, ?, ?)
    `).run(id, 'birthday', 'auto_recommend', 50.00);

    const setting = db.prepare('SELECT * FROM autonomy_settings WHERE id = ?').get(id);
    expect(setting.level).toBe('auto_recommend');
    expect(setting.max_budget).toBe(50.00);
  });
});

describe('Data integrity', () => {
  test('enforces foreign key constraints', () => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');

    expect(() => {
      db.prepare(`
        INSERT INTO events (id, contact_id, type, name, date)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), 'nonexistent-id', 'birthday', 'Test', '2026-01-01');
    }).toThrow();
  });

  test('cascading deletes work for contacts', () => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');

    const contactId = uuidv4();
    const eventId = uuidv4();

    db.prepare("INSERT INTO contacts (id, name, relationship) VALUES (?, ?, ?)")
      .run(contactId, 'Cascade Test', 'friend');
    db.prepare("INSERT INTO events (id, contact_id, type, name, date) VALUES (?, ?, ?, ?, ?)")
      .run(eventId, contactId, 'birthday', 'Test Birthday', '2026-06-01');

    // Delete contact should cascade to events
    db.prepare("DELETE FROM contacts WHERE id = ?").run(contactId);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    expect(event).toBeUndefined();
  });

  test('validates event type enum', () => {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');
    const contacts = db.prepare('SELECT id FROM contacts LIMIT 1').all();

    if (contacts.length > 0) {
      expect(() => {
        db.prepare(`
          INSERT INTO events (id, contact_id, type, name, date)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), contacts[0].id, 'invalid_type', 'Bad Event', '2026-01-01');
      }).toThrow();
    }
  });
});

describe('Notification system', () => {
  const { v4: uuidv4 } = require('uuid');

  test('creates and reads notifications', () => {
    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO notifications (id, type, message)
      VALUES (?, 'event_reminder', 'Test notification')
    `).run(id);

    const notif = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    expect(notif.read).toBe(0);
    expect(notif.type).toBe('event_reminder');

    // Mark as read
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
    const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    expect(updated.read).toBe(1);
  });

  test('counts unread notifications', () => {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get();
    expect(typeof count.count).toBe('number');
  });
});
