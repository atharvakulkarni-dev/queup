const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'queup.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS owners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      area TEXT,
      city TEXT DEFAULT 'Pune',
      pin TEXT,
      landmark TEXT,
      maps_link TEXT,
      photo_url TEXT,
      is_open INTEGER DEFAULT 1,
      is_accepting_queue INTEGER DEFAULT 1,
      max_queue_size INTEGER DEFAULT 20,
      slots_per_hour INTEGER DEFAULT 3,
      slot_duration_mins INTEGER DEFAULT 15,
      walk_in_policy TEXT DEFAULT 'both',
      advance_booking_days INTEGER DEFAULT 3,
      rating REAL DEFAULT 0,
      total_ratings INTEGER DEFAULT 0,
      total_served INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(owner_id) REFERENCES owners(id)
    );

    CREATE TABLE IF NOT EXISTS shop_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      open_time TEXT,
      close_time TEXT,
      is_closed INTEGER DEFAULT 0,
      FOREIGN KEY(shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_mins INTEGER DEFAULT 15,
      price INTEGER,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY(shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS queue_tokens (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      token_number INTEGER NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      service_id TEXT,
      status TEXT DEFAULT 'waiting',
      joined_at TEXT DEFAULT (datetime('now')),
      called_at TEXT,
      completed_at TEXT,
      date TEXT DEFAULT (date('now')),
      estimated_wait_mins INTEGER,
      FOREIGN KEY(shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_id TEXT,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      status TEXT DEFAULT 'confirmed',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      customer_name TEXT,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS busy_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      hour_of_day INTEGER NOT NULL,
      avg_customers REAL DEFAULT 0,
      sample_count INTEGER DEFAULT 0,
      FOREIGN KEY(shop_id) REFERENCES shops(id)
    );
  `);

  console.log('✅ Database initialized');
}

module.exports = { db, initDB };
