const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

async function connectDB() {
  if (!MONGO_URI) {
    console.error('[DB] No MONGODB_URI or DATABASE_URL set');
    process.exit(1);
  }

  try {
    console.log('[DB] Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      dbName: 'mg-sa-db'
    });
    console.log('[DB] MongoDB connected successfully');

    // Create default admin if not exists
    const User = require('./models/User');
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const hash = bcrypt.hashSync('admin123', parseInt(process.env.BCRYPT_SALT_ROUNDS || 12));
      await User.create({
        username: 'Admin',
        email: 'duabua1@gmail.com',
        password: hash,
        role: 'admin',
        emailVerified: true
      });
      console.log('[DB] Default admin created: duabua1@gmail.com');
    }
  } catch (err) {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  }
}

connectDB();

module.exports = mongoose;
