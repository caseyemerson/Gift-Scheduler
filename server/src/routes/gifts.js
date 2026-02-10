const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { logAudit } = require('../audit');

const router = express.Router();

// Gift catalog / mock retailer data for MVP
const MOCK_GIFT_CATALOG = [
  // Birthday gifts
  { name: 'Personalized Photo Frame', category: 'birthday', price: 29.99, retailer: 'Amazon', description: 'Elegant wooden photo frame with custom engraving options', tags: ['sentimental', 'home', 'photo'] },
  { name: 'Gourmet Chocolate Gift Box', category: 'birthday', price: 34.99, retailer: 'Amazon', description: 'Assorted premium chocolates in a decorative box', tags: ['food', 'sweet', 'luxury'] },
  { name: 'Wireless Bluetooth Speaker', category: 'birthday', price: 45.99, retailer: 'Amazon', description: 'Portable waterproof speaker with 12-hour battery', tags: ['tech', 'music', 'portable'] },
  { name: 'Scented Candle Set', category: 'birthday', price: 28.50, retailer: 'Target', description: 'Set of 3 hand-poured soy candles in seasonal scents', tags: ['home', 'relaxation', 'self-care'] },
  { name: 'Bestselling Novel Collection', category: 'birthday', price: 24.99, retailer: 'Amazon', description: 'Curated set of 3 bestselling fiction novels', tags: ['books', 'reading', 'intellectual'] },
  { name: 'Premium Coffee Sampler', category: 'birthday', price: 32.00, retailer: 'Target', description: 'Selection of 6 single-origin coffee beans from around the world', tags: ['coffee', 'food', 'gourmet'] },
  { name: 'Fitness Tracker Band', category: 'birthday', price: 49.99, retailer: 'Amazon', description: 'Lightweight fitness band with heart rate and sleep tracking', tags: ['tech', 'fitness', 'health'] },
  { name: 'Luxury Bath Bomb Set', category: 'birthday', price: 22.99, retailer: 'Target', description: 'Set of 8 handcrafted bath bombs with essential oils', tags: ['self-care', 'relaxation', 'beauty'] },
  { name: 'Succulent Plant Collection', category: 'birthday', price: 26.99, retailer: 'Amazon', description: 'Set of 4 assorted mini succulents in decorative pots', tags: ['plants', 'home', 'nature'] },
  { name: 'Leather Journal', category: 'birthday', price: 19.99, retailer: 'Amazon', description: 'Handcrafted leather-bound journal with 240 pages', tags: ['writing', 'creative', 'professional'] },

  // Anniversary gifts
  { name: 'Couples Wine Glasses Set', category: 'anniversary', price: 39.99, retailer: 'Amazon', description: 'Pair of crystal wine glasses with etched design', tags: ['romantic', 'home', 'wine'] },
  { name: 'Spa Day Gift Certificate', category: 'anniversary', price: 75.00, retailer: 'Target', description: 'Gift card for couples spa treatment', tags: ['relaxation', 'romantic', 'experience'] },
  { name: 'Personalized Star Map', category: 'anniversary', price: 49.99, retailer: 'Amazon', description: 'Custom night sky print for a specific date and location', tags: ['sentimental', 'romantic', 'art'] },
  { name: 'Gourmet Dinner Kit', category: 'anniversary', price: 65.00, retailer: 'Amazon', description: 'Premium meal kit for a romantic dinner for two', tags: ['food', 'romantic', 'experience'] },
  { name: 'Photo Album Book', category: 'anniversary', price: 44.99, retailer: 'Target', description: 'Customizable premium photo album with 50 pages', tags: ['sentimental', 'photo', 'memories'] },
  { name: 'Matching Watch Set', category: 'anniversary', price: 79.99, retailer: 'Amazon', description: 'His and hers minimalist analog watches', tags: ['fashion', 'romantic', 'luxury'] },

  // Holiday gifts
  { name: 'Holiday Cookie Tin', category: 'holiday', price: 18.99, retailer: 'Target', description: 'Assorted holiday cookies in a festive collector tin', tags: ['food', 'sweet', 'festive'] },
  { name: 'Cozy Throw Blanket', category: 'holiday', price: 35.99, retailer: 'Amazon', description: 'Ultra-soft fleece throw blanket in holiday colors', tags: ['home', 'comfort', 'winter'] },
  { name: 'Hot Cocoa Gift Set', category: 'holiday', price: 24.99, retailer: 'Target', description: 'Artisan hot chocolate mix with marshmallows and mug', tags: ['food', 'warm', 'festive'] },
  { name: 'Holiday Scented Candle Trio', category: 'holiday', price: 31.50, retailer: 'Amazon', description: 'Pine, cinnamon, and vanilla holiday candle set', tags: ['home', 'festive', 'relaxation'] },
  { name: 'Winter Accessories Set', category: 'holiday', price: 29.99, retailer: 'Target', description: 'Matching scarf, gloves, and beanie in a gift box', tags: ['fashion', 'winter', 'practical'] },
  { name: 'Board Game Collection', category: 'holiday', price: 38.99, retailer: 'Amazon', description: 'Popular family board game perfect for gatherings', tags: ['games', 'family', 'fun'] },
  { name: 'Gourmet Snack Basket', category: 'holiday', price: 42.99, retailer: 'Amazon', description: 'Curated selection of premium nuts, dried fruits, and treats', tags: ['food', 'gourmet', 'sharing'] },
  { name: 'Smart Home Mini Speaker', category: 'holiday', price: 34.99, retailer: 'Target', description: 'Compact smart speaker with voice assistant', tags: ['tech', 'home', 'practical'] },
];

// Generate gift recommendations for an event
router.post('/recommend/:eventId', (req, res) => {
  const db = getDb();
  const event = db.prepare(`
    SELECT e.*, c.name as contact_name, c.preferences, c.constraints, c.relationship
    FROM events e
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.id = ?
  `).get(req.params.eventId);

  if (!event) return res.status(404).json({ error: 'Event not found' });

  // Get effective budget
  const budget = db.prepare('SELECT * FROM budgets WHERE category = ?').get(event.type);
  const override = db.prepare(
    'SELECT * FROM budget_overrides WHERE budget_id = ? AND contact_id = ?'
  ).get(budget?.id, event.contact_id);
  const effectiveBudget = override ? override.amount : (budget ? budget.default_amount : 50);

  // Parse preferences
  const preferences = JSON.parse(event.preferences || '{}');
  const constraints = JSON.parse(event.constraints || '{}');

  // Get past gifts to avoid repeats
  const pastGifts = db.prepare(`
    SELECT gr.name FROM gift_recommendations gr
    JOIN events e ON gr.event_id = e.id
    WHERE e.contact_id = ? AND gr.status = 'purchased'
  `).all(event.contact_id).map(g => g.name);

  // Filter and score gifts
  const categoryGifts = MOCK_GIFT_CATALOG.filter(g => {
    if (g.price > effectiveBudget) return false;
    if (g.category !== event.type && event.type !== 'other') return false;
    if (pastGifts.includes(g.name)) return false;
    if (constraints.avoid_categories) {
      const avoided = constraints.avoid_categories;
      if (g.tags.some(t => avoided.includes(t))) return false;
    }
    return true;
  });

  // Score gifts based on preferences
  const scored = categoryGifts.map(g => {
    let score = 50; // base score
    if (preferences.interests) {
      const matchCount = g.tags.filter(t => preferences.interests.includes(t)).length;
      score += matchCount * 20;
    }
    if (preferences.favorite_retailers && preferences.favorite_retailers.includes(g.retailer)) {
      score += 10;
    }
    // Prefer mid-range prices (not too cheap, not maxing budget)
    const priceRatio = g.price / effectiveBudget;
    if (priceRatio >= 0.4 && priceRatio <= 0.8) score += 15;

    return { ...g, score };
  });

  // Sort by score and take top 3-8
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, Math.min(8, Math.max(3, scored.length)));

  // Calculate mock delivery estimates
  const eventDate = new Date(event.date);
  const now = new Date();
  const daysUntil = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));

  // Save recommendations to database
  const insertStmt = db.prepare(`
    INSERT INTO gift_recommendations (id, event_id, name, description, price, retailer, url, in_stock, estimated_delivery, reasoning, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recommended')
  `);

  // Clear previous recommendations for this event
  db.prepare("DELETE FROM gift_recommendations WHERE event_id = ? AND status = 'recommended'").run(req.params.eventId);

  const recommendations = selected.map(g => {
    const id = uuidv4();
    const deliveryDays = g.retailer === 'Amazon' ? 3 : 5;
    const canDeliver = daysUntil >= deliveryDays + 2; // 2-day buffer
    const estimatedDelivery = new Date(now.getTime() + deliveryDays * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    let reasoning = `Selected for ${event.contact_name}'s ${event.type}.`;
    if (preferences.interests) {
      const matches = g.tags.filter(t => preferences.interests.includes(t));
      if (matches.length > 0) {
        reasoning += ` Matches interests: ${matches.join(', ')}.`;
      }
    }
    reasoning += ` Price $${g.price} is within the $${effectiveBudget} budget.`;
    if (!canDeliver) reasoning += ' WARNING: May not arrive in time.';

    insertStmt.run(id, req.params.eventId, g.name, g.description, g.price, g.retailer,
      `https://${g.retailer.toLowerCase()}.com/dp/mock-${id.slice(0, 8)}`,
      canDeliver ? 1 : 0, estimatedDelivery, reasoning);

    return {
      id, name: g.name, description: g.description, price: g.price,
      retailer: g.retailer, in_stock: canDeliver, estimated_delivery: estimatedDelivery,
      reasoning, status: 'recommended', tags: g.tags, score: g.score,
    };
  });

  logAudit('generate_recommendations', 'event', req.params.eventId, {
    count: recommendations.length,
    budget: effectiveBudget,
  });

  // Update event status
  db.prepare("UPDATE events SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?")
    .run(req.params.eventId);

  res.json({
    event_id: req.params.eventId,
    budget: effectiveBudget,
    recommendations,
  });
});

// Get recommendations for an event
router.get('/event/:eventId', (req, res) => {
  const db = getDb();
  const recommendations = db.prepare(
    'SELECT * FROM gift_recommendations WHERE event_id = ? ORDER BY price ASC'
  ).all(req.params.eventId);
  res.json(recommendations);
});

// Update recommendation status
router.put('/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;

  if (!['recommended', 'approved', 'rejected', 'purchased'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const existing = db.prepare('SELECT * FROM gift_recommendations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Recommendation not found' });

  db.prepare('UPDATE gift_recommendations SET status = ? WHERE id = ?').run(status, req.params.id);
  logAudit('update_status', 'gift_recommendation', req.params.id, {
    old_status: existing.status,
    new_status: status,
  });

  res.json({ ...existing, status });
});

module.exports = router;
