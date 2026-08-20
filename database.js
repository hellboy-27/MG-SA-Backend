const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

mongoose.connection.on('error', (err) => {
  console.error('[DB] Mongoose connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('[DB] Mongoose disconnected');
});

async function connectDB() {
  if (!MONGO_URI) {
    console.error('[DB] No MONGODB_URI or DATABASE_URL set');
    process.exit(1);
  }

  try {
    console.log('[DB] Connecting to MongoDB...');
    console.log('[DB] URI starts with:', MONGO_URI.substring(0, 25) + '...');
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000
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
    console.error('[DB] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    // Don't exit, let server run without DB for debugging
  }
}

connectDB();

module.exports = mongoose;
