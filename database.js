const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;

mongoose.connection.on('error', (err) => {
  console.error('[DB] Mongoose connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('[DB] Mongoose disconnected');
});

mongoose.connection.on('connected', () => {
  console.log('[DB] Mongoose connected event fired');
});

mongoose.connection.on('open', () => {
  console.log('[DB] Mongoose connection open');
});

async function connectDB() {
  if (!MONGO_URI) {
    console.error('[DB] No MONGODB_URI or DATABASE_URL set');
    process.exit(1);
  }

  try {
    console.log('[DB] Connecting to MongoDB...');
    const maskedUri = MONGO_URI.replace(/:([^@]+)@/, ':****@');
    console.log('[DB] URI:', maskedUri);
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000
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
    console.error('[DB] Error name:', err.name);
    if (err.reason) console.error('[DB] Reason:', JSON.stringify(err.reason));
  }
}

connectDB();

module.exports = mongoose;
