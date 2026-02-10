const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');

const router = express.Router();

// Message templates by tone and event type
const MESSAGE_TEMPLATES = {
  birthday: {
    warm: [
      "Wishing you the happiest of birthdays, {name}! May this year bring you everything you've been dreaming of. Here's to another wonderful year ahead!",
      "Happy Birthday, {name}! Your warmth and kindness brighten everyone around you. I hope today is as special as you are!",
    ],
    formal: [
      "Dear {name}, wishing you a very happy birthday. May the coming year bring you health, happiness, and continued success.",
      "Happy Birthday, {name}. Please accept my warmest wishes on this special occasion. Wishing you all the best in the year ahead.",
    ],
    humorous: [
      "Happy Birthday, {name}! They say age is just a number... but in your case, it's a really GREAT number! Enjoy your day!",
      "Another year wiser (and better looking, obviously). Happy Birthday, {name}! Let's celebrate the fact that you're still younger than you'll be next year!",
    ],
    heartfelt: [
      "Dear {name}, on your birthday I want you to know how much you mean to me. Your presence in my life is a gift I treasure every day. Happy Birthday!",
      "Happy Birthday to someone truly extraordinary, {name}. The world is a better place with you in it, and I'm grateful for every moment we share.",
    ],
    casual: [
      "Hey {name}! Happy Birthday! Hope you have an awesome day filled with cake, fun, and everything you love!",
      "Happy Bday, {name}! Time to celebrate YOU! Hope your day is absolutely amazing!",
    ],
  },
  anniversary: {
    warm: [
      "Happy Anniversary, {name}! Celebrating the love and joy you share is a beautiful thing. Wishing you many more wonderful years together!",
      "Congratulations on another year of love and partnership, {name}! Your bond is truly inspiring. Happy Anniversary!",
    ],
    formal: [
      "Dear {name}, congratulations on reaching this wonderful milestone in your journey together. Wishing you continued love and happiness.",
      "Happy Anniversary, {name}. May your celebration be filled with cherished memories and renewed commitment to the years ahead.",
    ],
    humorous: [
      "Happy Anniversary, {name}! Another year of tolerating each other — that deserves a trophy! Just kidding, you two are goals!",
      "Congrats on the anniversary, {name}! Love is patient, love is kind... and love is apparently very persistent! Here's to many more!",
    ],
    heartfelt: [
      "Happy Anniversary, {name}. The love you share is a testament to patience, devotion, and genuine partnership. You inspire everyone around you.",
      "Dear {name}, watching your love story unfold has been a privilege. Happy Anniversary — your bond grows more beautiful with each passing year.",
    ],
    casual: [
      "Happy Anniversary, {name}! You two are the best together. Hope you have a great celebration!",
      "Cheers to another awesome year, {name}! Happy Anniversary — enjoy the day!",
    ],
  },
  holiday: {
    warm: [
      "Happy Holidays, {name}! Wishing you and your loved ones a season filled with joy, laughter, and warm memories. Enjoy every moment!",
      "Season's Greetings, {name}! May this holiday season bring you peace, happiness, and time with the people you love most.",
    ],
    formal: [
      "Dear {name}, wishing you a wonderful holiday season. May the new year ahead be filled with prosperity and good health.",
      "Season's Greetings, {name}. Wishing you and yours a peaceful and joyous holiday celebration.",
    ],
    humorous: [
      "Happy Holidays, {name}! May your holiday be merry, your eggnog be strong, and your relatives' questions about your life choices be minimal!",
      "Ho ho ho, {name}! Wishing you a holiday season with maximum cheer and minimum fruitcake. Enjoy!",
    ],
    heartfelt: [
      "Dear {name}, during this holiday season, I'm reminded of how grateful I am to have you in my life. Wishing you all the warmth and love you deserve.",
      "Happy Holidays, {name}. In a world that moves so fast, I treasure the connection we share. May this season fill your heart with joy.",
    ],
    casual: [
      "Happy Holidays, {name}! Hope you have an amazing time celebrating. Enjoy the food, fun, and festivities!",
      "Hey {name}! Wishing you the best holiday season ever. Relax, enjoy, and eat way too much!",
    ],
  },
};

// Generate card messages for an event
router.post('/generate/:eventId', (req, res) => {
  const db = getDb();
  const event = db.prepare(`
    SELECT e.*, c.name as contact_name, c.preferences
    FROM events e
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.id = ?
  `).get(req.params.eventId);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  const preferences = JSON.parse(event.preferences || '{}');
  const preferredTones = req.body.tones || preferences.preferred_tones || ['warm', 'heartfelt'];

  // Get templates for this event type
  const eventType = event.type === 'other' ? 'holiday' : event.type;
  const templates = MESSAGE_TEMPLATES[eventType] || MESSAGE_TEMPLATES.holiday;

  // Clear previous unselected messages
  db.prepare("DELETE FROM card_messages WHERE event_id = ? AND selected = 0").run(req.params.eventId);

  const insertStmt = db.prepare(`
    INSERT INTO card_messages (id, event_id, tone, message, selected)
    VALUES (?, ?, ?, ?, 0)
  `);

  const messages = [];
  for (const tone of preferredTones) {
    const toneTemplates = templates[tone] || templates.warm;
    for (const template of toneTemplates) {
      const id = uuidv4();
      const message = template.replace(/\{name\}/g, event.contact_name);
      insertStmt.run(id, req.params.eventId, tone, message);
      messages.push({ id, event_id: req.params.eventId, tone, message, selected: 0 });
    }
  }

  logAudit('generate_messages', 'event', req.params.eventId, { count: messages.length, tones: preferredTones });

  res.json({ event_id: req.params.eventId, messages });
});

// Get card messages for an event
router.get('/event/:eventId', (req, res) => {
  const db = getDb();
  const messages = db.prepare(
    'SELECT * FROM card_messages WHERE event_id = ? ORDER BY created_at DESC'
  ).all(req.params.eventId);
  res.json(messages);
});

// Select a card message
router.put('/:id/select', (req, res) => {
  const db = getDb();
  const message = db.prepare('SELECT * FROM card_messages WHERE id = ?').get(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found' });

  // Deselect all others for this event
  db.prepare('UPDATE card_messages SET selected = 0 WHERE event_id = ?').run(message.event_id);
  // Select this one
  db.prepare('UPDATE card_messages SET selected = 1 WHERE id = ?').run(req.params.id);

  logAudit('select_message', 'card_message', req.params.id, { event_id: message.event_id });

  res.json({ ...message, selected: 1 });
});

// Update a card message (custom edit)
router.put('/:id', (req, res) => {
  const db = getDb();
  const { message } = req.body;

  if (!message) return res.status(400).json({ error: 'Message content is required' });

  const existing = db.prepare('SELECT * FROM card_messages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Message not found' });

  db.prepare('UPDATE card_messages SET message = ? WHERE id = ?').run(message, req.params.id);
  logAudit('edit_message', 'card_message', req.params.id, { event_id: existing.event_id });

  res.json({ ...existing, message });
});

module.exports = router;
