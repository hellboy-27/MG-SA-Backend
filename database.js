const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dbDir, 'database.db');
const db = new Database(dbPath);

// Security: Enable WAL mode for better concurrency and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Create tables with security in mind
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
    email_verified INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    size TEXT,
    image_filename TEXT,
    mod_filename TEXT,
    downloads INTEGER DEFAULT 0,
    rating_avg REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mod_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(mod_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new' CHECK(status IN ('new','read')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_comments_mod ON comments(mod_id);
  CREATE INDEX IF NOT EXISTS idx_ratings_mod ON ratings(mod_id);
  CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
  CREATE INDEX IF NOT EXISTS idx_verification_email ON verification_codes(email);
`);

// Create default admin if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', parseInt(process.env.BCRYPT_SALT_ROUNDS || 12));
  db.prepare('INSERT INTO users (username, email, password, role, email_verified) VALUES (?, ?, ?, ?, ?)').run(
    'Admin', 'duabua1@gmail.com', hash, 'admin', 1
  );
  console.log('[DB] Default admin created: duabua1@gmail.com');
}

module.exports = db;
