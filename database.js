const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.on('error', (err) => {
  console.error('[DB] Pool error:', err.message);
});

// Initialize tables
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
        email_verified INTEGER DEFAULT 0,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TEXT DEFAULT NULL,
        created_at TEXT DEFAULT NOW(),
        updated_at TEXT DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mods (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        size TEXT,
        image_filename TEXT,
        mod_filename TEXT,
        downloads INTEGER DEFAULT 0,
        rating_avg REAL DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        mod_id INTEGER NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        mod_id INTEGER NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
        comment TEXT,
        created_at TEXT DEFAULT NOW(),
        UNIQUE(mod_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS suggestions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'new' CHECK(status IN ('new','read')),
        created_at TEXT DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_comments_mod ON comments(mod_id);
      CREATE INDEX IF NOT EXISTS idx_ratings_mod ON ratings(mod_id);
      CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
      CREATE INDEX IF NOT EXISTS idx_verification_email ON verification_codes(email);
    `);

    // Create default admin if not exists
    const adminCheck = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminCheck.rows.length === 0) {
      const hash = bcrypt.hashSync('admin123', parseInt(process.env.BCRYPT_SALT_ROUNDS || 12));
      await client.query(
        "INSERT INTO users (username, email, password, role, email_verified) VALUES ($1, $2, $3, $4, $5)",
        ['Admin', 'duabua1@gmail.com', hash, 'admin', 1]
      );
      console.log('[DB] Default admin created: duabua1@gmail.com');
    }

    console.log('[DB] PostgreSQL initialized');
  } catch (err) {
    console.error('[DB] Init error:', err.message);
  } finally {
    client.release();
  }
}

initDB();

// Helper methods that mimic better-sqlite3 API for easier migration
// Converts ? placeholders to $1, $2, ... for PostgreSQL
function convertPlaceholders(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

const db = {
  prepare(sql) {
    const pgSql = convertPlaceholders(sql);
    return {
      get(...params) {
        return pool.query(pgSql, params).then(r => r.rows[0] || undefined);
      },
      all(...params) {
        return pool.query(pgSql, params).then(r => r.rows);
      },
      run(...params) {
        // For INSERT, add RETURNING id if not present
        let execSql = pgSql;
        let returnId = false;
        if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
          execSql = pgSql + ' RETURNING id';
          returnId = true;
        }
        return pool.query(execSql, params).then(r => {
          if (returnId && r.rows[0]) {
            return { lastInsertRowid: r.rows[0].id, changes: r.rowCount };
          }
          return { changes: r.rowCount };
        });
      }
    };
  },
  exec(sql) {
    return pool.query(sql);
  },
  pragma() {} // no-op for PostgreSQL
};

// Async versions for better performance
db.query = (sql, params) => pool.query(sql, params);
db.pool = pool;

module.exports = db;
