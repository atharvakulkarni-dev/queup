require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { db, initDB } = require('./db');
const { authMiddleware, signToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB
initDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// ─────────────────────────────────────────
// OWNER AUTH
// ─────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password)
      return res.status(400).json({ error: 'All fields required' });

    const exists = db.prepare('SELECT id FROM owners WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO owners (id, name, email, phone, password_hash) VALUES (?,?,?,?,?)')
      .run(id, name, email, phone, hash);

    const token = signToken({ id, name, email });
    res.json({ token, owner: { id, name, email, phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const owner = db.prepare('SELECT * FROM owners WHERE email = ?').get(email);
    if (!owner) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, owner.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: owner.id, name: owner.name, email: owner.email });
    res.json({ token, owner: { id: owner.id, name: owner.name, email: owner.email, phone: owner.phone } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const owner = db.prepare('SELECT id, name, email, phone, created_at FROM owners WHERE id = ?').get(req.owner.id);
  res.json(owner);
});

// ─────────────────────────────────────────
// SHOPS
// ─────────────────────────────────────────

function makeSlug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const exists = db.prepare('SELECT id FROM shops WHERE slug = ?').get(base);
  return exists ? `${base}-${Date.now().toString(36)}` : base;
}

app.post('/api/shops', authMiddleware, (req, res) => {
  try {
    const { name, type, description, phone, email, address, area, city, pin, landmark,
            maps_link, max_queue_size, slots_per_hour, slot_duration_mins,
            walk_in_policy, advance_booking_days, hours, services } = req.body;

    if (!name || !type) return res.status(400).json({ error: 'Name and type required' });

    const id = uuidv4();
    const slug = makeSlug(name);

    db.prepare(`INSERT INTO shops (id,owner_id,name,slug,type,description,phone,email,address,area,city,pin,landmark,maps_link,max_queue_size,slots_per_hour,slot_duration_mins,walk_in_policy,advance_booking_days)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, req.owner.id, name, slug, type, description||null, phone||null, email||null,
           address||null, area||null, city||'Pune', pin||null, landmark||null, maps_link||null,
           max_queue_size||20, slots_per_hour||3, slot_duration_mins||15,
           walk_in_policy||'both', advance_booking_days||3);

    // Hours
    if (hours && hours.length) {
      const ins = db.prepare('INSERT INTO shop_hours (shop_id,day_of_week,open_time,close_time,is_closed) VALUES (?,?,?,?,?)');
      hours.forEach((h, i) => ins.run(id, i, h.open||'09:00', h.close||'20:00', h.closed?1:0));
    } else {
      const ins = db.prepare('INSERT INTO shop_hours (shop_id,day_of_week,open_time,close_time,is_closed) VALUES (?,?,?,?,?)');
      for (let i = 0; i < 7; i++) ins.run(id, i, '09:00', '20:00', i === 6 ? 1 : 0);
    }

    // Services
    if (services && services.length) {
      const ins = db.prepare('INSERT INTO services (id,shop_id,name,duration_mins,price) VALUES (?,?,?,?,?)');
      services.forEach(s => ins.run(uuidv4(), id, s.name, s.duration||15, s.price||null));
    }

    // Seed busy hours with sample data
    seedBusyHours(id);

    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(id);
    res.json({ shop, slug });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function seedBusyHours(shopId) {
  const pattern = [[2,3,4,5,5,3,2,1],[1,2,2,3,4,3,2,1],[2,4,5,6,5,4,3,2],
                   [2,3,5,7,7,5,4,2],[3,4,6,8,7,6,4,2],[4,6,8,9,8,7,5,3],[2,3,4,5,4,3,2,1]];
  const ins = db.prepare('INSERT INTO busy_hours (shop_id,day_of_week,hour_of_day,avg_customers,sample_count) VALUES (?,?,?,?,?)');
  pattern.forEach((day, d) => day.forEach((val, h) => ins.run(shopId, d, h + 9, val, 10)));
}

app.get('/api/shops/mine', authMiddleware, (req, res) => {
  const shops = db.prepare('SELECT * FROM shops WHERE owner_id = ?').all(req.owner.id);
  res.json(shops);
});

app.get('/api/shops/search', (req, res) => {
  const { q, city, type } = req.query;
  let sql = 'SELECT id,name,slug,type,description,area,city,phone,photo_url,rating,total_ratings,is_open,is_accepting_queue FROM shops WHERE 1=1';
  const params = [];
  if (q) { sql += ' AND (name LIKE ? OR area LIKE ? OR description LIKE ?)'; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (city) { sql += ' AND city LIKE ?'; params.push(`%${city}%`); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY rating DESC, total_served DESC LIMIT 40';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/shops/:slug', (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE slug = ?').get(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const hours = db.prepare('SELECT * FROM shop_hours WHERE shop_id = ? ORDER BY day_of_week').all(shop.id);
  const services = db.prepare('SELECT * FROM services WHERE shop_id = ? AND is_active = 1').all(shop.id);
  const queue = db.prepare("SELECT * FROM queue_tokens WHERE shop_id = ? AND date = date('now') AND status IN ('waiting','called') ORDER BY token_number").all(shop.id);
  const reviews = db.prepare('SELECT * FROM reviews WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10').all(shop.id);
  const busy = db.prepare('SELECT * FROM busy_hours WHERE shop_id = ? ORDER BY day_of_week, hour_of_day').all(shop.id);

  res.json({ shop, hours, services, queue, reviews, busy });
});

app.put('/api/shops/:id', authMiddleware, (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE id = ? AND owner_id = ?').get(req.params.id, req.owner.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const fields = ['name','description','phone','address','area','city','pin','landmark',
                  'is_open','is_accepting_queue','max_queue_size','slots_per_hour','slot_duration_mins'];
  const updates = [];
  const vals = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f}=?`); vals.push(req.body[f]); } });
  if (!updates.length) return res.json(shop);
  vals.push(req.params.id);
  db.prepare(`UPDATE shops SET ${updates.join(',')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id));
});

// ─────────────────────────────────────────
// QUEUE
// ─────────────────────────────────────────

app.get('/api/shops/:slug/queue', (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE slug = ?').get(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Not found' });

  const queue = db.prepare("SELECT * FROM queue_tokens WHERE shop_id = ? AND date = date('now') AND status IN ('waiting','called') ORDER BY token_number").all(shop.id);
  const current = db.prepare("SELECT * FROM queue_tokens WHERE shop_id = ? AND date = date('now') AND status = 'called' ORDER BY called_at DESC LIMIT 1").get(shop.id);
  const served = db.prepare("SELECT COUNT(*) as c FROM queue_tokens WHERE shop_id = ? AND date = date('now') AND status='done'").get(shop.id).c;

  res.json({
    is_open: shop.is_open,
    is_accepting: shop.is_accepting_queue,
    current_token: current ? current.token_number : null,
    waiting_count: queue.filter(q => q.status === 'waiting').length,
    queue,
    served_today: served,
    slot_duration: shop.slot_duration_mins,
    max_queue: shop.max_queue_size
  });
});

app.post('/api/shops/:slug/queue/join', (req, res) => {
  try {
    const shop = db.prepare('SELECT * FROM shops WHERE slug = ?').get(req.params.slug);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    if (!shop.is_open) return res.status(400).json({ error: 'Shop is currently closed' });
    if (!shop.is_accepting_queue) return res.status(400).json({ error: 'Queue is paused' });

    const waiting = db.prepare("SELECT COUNT(*) as c FROM queue_tokens WHERE shop_id=? AND date=date('now') AND status IN ('waiting','called')").get(shop.id).c;
    if (waiting >= shop.max_queue_size) return res.status(400).json({ error: 'Queue is full' });

    const { customer_name, customer_phone, service_id } = req.body;
    if (!customer_name) return res.status(400).json({ error: 'Name required' });

    const last = db.prepare("SELECT MAX(token_number) as m FROM queue_tokens WHERE shop_id=? AND date=date('now')").get(shop.id);
    const tokenNum = (last.m || 0) + 1;
    const waitMins = waiting * shop.slot_duration_mins;

    const id = uuidv4();
    db.prepare('INSERT INTO queue_tokens (id,shop_id,token_number,customer_name,customer_phone,service_id,estimated_wait_mins) VALUES (?,?,?,?,?,?,?)')
      .run(id, shop.id, tokenNum, customer_name, customer_phone||null, service_id||null, waitMins);

    res.json({ id, token_number: tokenNum, estimated_wait_mins: waitMins, position: waiting + 1, shop_name: shop.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/token/:id/status', (req, res) => {
  const token = db.prepare('SELECT qt.*, s.name as shop_name, s.slug, s.slot_duration_mins FROM queue_tokens qt JOIN shops s ON qt.shop_id=s.id WHERE qt.id=?').get(req.params.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });

  const ahead = db.prepare("SELECT COUNT(*) as c FROM queue_tokens WHERE shop_id=? AND date=date('now') AND status='waiting' AND token_number<?").get(token.shop_id, token.token_number).c;
  const current = db.prepare("SELECT token_number FROM queue_tokens WHERE shop_id=? AND date=date('now') AND status='called' ORDER BY called_at DESC LIMIT 1").get(token.shop_id);

  res.json({ ...token, ahead, current_token: current?.token_number });
});

// Owner: call next / mark done
app.post('/api/shops/:id/queue/next', authMiddleware, (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE id=? AND owner_id=?').get(req.params.id, req.owner.id);
  if (!shop) return res.status(404).json({ error: 'Not found' });

  // Mark current called as done
  db.prepare("UPDATE queue_tokens SET status='done', completed_at=datetime('now') WHERE shop_id=? AND status='called'").run(shop.id);

  // Update busy hours stats
  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();
  const bh = db.prepare('SELECT * FROM busy_hours WHERE shop_id=? AND day_of_week=? AND hour_of_day=?').get(shop.id, dow, hour);
  if (bh) {
    const newAvg = (bh.avg_customers * bh.sample_count + 1) / (bh.sample_count + 1);
    db.prepare('UPDATE busy_hours SET avg_customers=?, sample_count=sample_count+1 WHERE id=?').run(newAvg, bh.id);
  }

  db.prepare("UPDATE shops SET total_served=total_served+1 WHERE id=?").run(shop.id);

  // Call next waiting
  const next = db.prepare("SELECT * FROM queue_tokens WHERE shop_id=? AND date=date('now') AND status='waiting' ORDER BY token_number LIMIT 1").get(shop.id);
  if (next) {
    db.prepare("UPDATE queue_tokens SET status='called', called_at=datetime('now') WHERE id=?").run(next.id);
  }

  const queue = db.prepare("SELECT * FROM queue_tokens WHERE shop_id=? AND date=date('now') AND status IN ('waiting','called') ORDER BY token_number").all(shop.id);
  res.json({ queue, called: next || null });
});

app.post('/api/shops/:id/queue/skip/:tokenId', authMiddleware, (req, res) => {
  db.prepare("UPDATE queue_tokens SET status='skipped' WHERE id=? AND shop_id=?").run(req.params.tokenId, req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────
// BOOKINGS
// ─────────────────────────────────────────

app.post('/api/shops/:slug/bookings', (req, res) => {
  try {
    const shop = db.prepare('SELECT * FROM shops WHERE slug=?').get(req.params.slug);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const { customer_name, customer_phone, service_id, booking_date, booking_time, notes } = req.body;
    if (!customer_name || !customer_phone || !booking_date || !booking_time)
      return res.status(400).json({ error: 'Name, phone, date and time required' });

    // Check slot availability
    const existing = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE shop_id=? AND booking_date=? AND booking_time=? AND status!='cancelled'").get(shop.id, booking_date, booking_time);
    if (existing.c >= shop.slots_per_hour) return res.status(400).json({ error: 'Slot already full' });

    const id = uuidv4();
    db.prepare('INSERT INTO bookings (id,shop_id,customer_name,customer_phone,service_id,booking_date,booking_time,notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, shop.id, customer_name, customer_phone, service_id||null, booking_date, booking_time, notes||null);

    res.json({ id, shop_name: shop.name, booking_date, booking_time, customer_name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/shops/:id/bookings', authMiddleware, (req, res) => {
  const { date } = req.query;
  const shop = db.prepare('SELECT * FROM shops WHERE id=? AND owner_id=?').get(req.params.id, req.owner.id);
  if (!shop) return res.status(404).json({ error: 'Not found' });

  const bookings = db.prepare('SELECT b.*, s.name as service_name FROM bookings b LEFT JOIN services s ON b.service_id=s.id WHERE b.shop_id=? AND b.booking_date=? ORDER BY b.booking_time').all(shop.id, date || new Date().toISOString().split('T')[0]);
  res.json(bookings);
});

app.get('/api/shops/:slug/slots', (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE slug=?').get(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Not found' });

  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  const bookings = db.prepare("SELECT booking_time, COUNT(*) as c FROM bookings WHERE shop_id=? AND booking_date=? AND status!='cancelled' GROUP BY booking_time").all(shop.id, date);
  const booked = {};
  bookings.forEach(b => booked[b.booking_time] = b.c);

  const dow = new Date(date).getDay();
  const hours = db.prepare('SELECT * FROM shop_hours WHERE shop_id=? AND day_of_week=?').get(shop.id, dow);
  if (!hours || hours.is_closed) return res.json({ slots: [], closed: true });

  const slots = [];
  let [oh, om] = hours.open_time.split(':').map(Number);
  const [ch, cm] = hours.close_time.split(':').map(Number);
  const closeTotal = ch * 60 + cm;

  while (oh * 60 + om < closeTotal) {
    const t = `${String(oh).padStart(2,'0')}:${String(om).padStart(2,'0')}`;
    const count = booked[t] || 0;
    slots.push({ time: t, available: count < shop.slots_per_hour, booked: count, capacity: shop.slots_per_hour });
    om += shop.slot_duration_mins;
    if (om >= 60) { oh += Math.floor(om / 60); om = om % 60; }
  }
  res.json({ slots, shop_name: shop.name });
});

// ─────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────

app.post('/api/shops/:slug/reviews', (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE slug=?').get(req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Not found' });

  const { customer_name, rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating 1-5 required' });

  const id = uuidv4();
  db.prepare('INSERT INTO reviews (id,shop_id,customer_name,rating,comment) VALUES (?,?,?,?,?)').run(id, shop.id, customer_name||'Anonymous', rating, comment||null);

  // Update shop rating
  const avg = db.prepare('SELECT AVG(rating) as a, COUNT(*) as c FROM reviews WHERE shop_id=?').get(shop.id);
  db.prepare('UPDATE shops SET rating=?, total_ratings=? WHERE id=?').run(Math.round(avg.a * 10) / 10, avg.c, shop.id);

  res.json({ ok: true });
});

// ─────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────

app.get('/api/shops/:id/stats', authMiddleware, (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE id=? AND owner_id=?').get(req.params.id, req.owner.id);
  if (!shop) return res.status(404).json({ error: 'Not found' });

  const today = new Date().toISOString().split('T')[0];
  const served_today = db.prepare("SELECT COUNT(*) as c FROM queue_tokens WHERE shop_id=? AND date=? AND status='done'").get(shop.id, today).c;
  const waiting_now = db.prepare("SELECT COUNT(*) as c FROM queue_tokens WHERE shop_id=? AND date=? AND status='waiting'").get(shop.id, today).c;
  const bookings_today = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE shop_id=? AND booking_date=? AND status='confirmed'").get(shop.id, today).c;
  const busy = db.prepare('SELECT * FROM busy_hours WHERE shop_id=? ORDER BY day_of_week, hour_of_day').all(shop.id);
  const recent_reviews = db.prepare('SELECT * FROM reviews WHERE shop_id=? ORDER BY created_at DESC LIMIT 5').all(shop.id);
  const week_served = db.prepare("SELECT date, COUNT(*) as c FROM queue_tokens WHERE shop_id=? AND date >= date('now','-6 days') AND status='done' GROUP BY date ORDER BY date").all(shop.id);

  res.json({ shop, served_today, waiting_now, bookings_today, busy, recent_reviews, week_served });
});

// ─────────────────────────────────────────
// TOGGLE SHOP STATUS
// ─────────────────────────────────────────
app.post('/api/shops/:id/toggle', authMiddleware, (req, res) => {
  const shop = db.prepare('SELECT * FROM shops WHERE id=? AND owner_id=?').get(req.params.id, req.owner.id);
  if (!shop) return res.status(404).json({ error: 'Not found' });
  const { field, value } = req.body;
  if (!['is_open','is_accepting_queue'].includes(field)) return res.status(400).json({ error: 'Invalid field' });
  db.prepare(`UPDATE shops SET ${field}=? WHERE id=?`).run(value ? 1 : 0, shop.id);
  res.json({ ok: true, [field]: value });
});

// ─────────────────────────────────────────
// SPA FALLBACK
// ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.listen(PORT, () => console.log(`🚀 QueUp running on http://localhost:${PORT}`));
