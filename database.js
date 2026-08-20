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
    console.log('[DB] URI starts with:', MONGO_URI.substring(0, 20) + '...');
    mongoose.set('debug', true);
    await mongoose.connect(MONGO_URI);
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
