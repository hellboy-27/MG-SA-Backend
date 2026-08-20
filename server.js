require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const { apiLimiter, xssProtection, securityHeaders } = require('./middleware/security');
const BackupManager = require('./backup');

// Create upload directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const imagesDir = path.join(uploadsDir, 'images');
const modsDir = path.join(uploadsDir, 'mods');

[uploadsDir, imagesDir, modsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (required for rate-limit behind Render/nginx)
app.set('trust proxy', 1);

// ===== SECURITY MIDDLEWARE =====

// Helmet - security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing with limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Security headers
app.use(securityHeaders);

// XSS protection
app.use(xssProtection);

// Rate limiting
app.use('/api/', apiLimiter);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ROUTES =====

app.use('/api/auth', require('./routes/auth'));
app.use('/api/mods', require('./routes/mods'));
app.use('/api/users', require('./routes/users'));
app.use('/api/suggestions', require('./routes/suggestions'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug - check DB status (remove after debugging)
app.get('/api/debug', async (req, res) => {
  const mongoose = require('mongoose');
  const User = require('./models/User');
  try {
    const userCount = await User.countDocuments();
    const adminExists = await User.findOne({ email: 'duabua1@gmail.com' });
    res.json({
      mongoState: mongoose.connection.readyState,
      mongoUri: process.env.MONGODB_URI ? 'SET' : 'NOT SET',
      userCount,
      adminExists: !!adminExists
    });
  } catch (err) {
    res.json({ error: err.message, mongoState: mongoose.connection.readyState, mongoUri: process.env.MONGODB_URI ? 'SET' : 'NOT SET' });
  }
});

// ===== BACKUP SYSTEM =====

const backupDir = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const backupManager = new BackupManager(backupDir);

// Backup every 12 hours
const backupInterval = parseInt(process.env.BACKUP_INTERVAL_HOURS || 12);
const cronExpr = `0 */${backupInterval} * * *`;

cron.schedule(cronExpr, async () => {
  console.log('[BACKUP] Starting scheduled backup...');
  try {
    await backupManager.createBackup();
    console.log('[BACKUP] Scheduled backup completed');
  } catch (err) {
    console.error('[BACKUP] Scheduled backup failed:', err.message);
  }
});

// Manual backup endpoint (admin only)
app.get('/api/backup', require('./middleware/auth').authMiddleware, require('./middleware/auth').adminOnly, async (req, res) => {
  try {
    const backupPath = await backupManager.createBackup();
    res.json({ message: 'Backup created', path: backupPath });
  } catch (err) {
    res.status(500).json({ error: 'Backup failed' });
  }
});

// List backups (admin only)
app.get('/api/backups', require('./middleware/auth').authMiddleware, require('./middleware/auth').adminOnly, (req, res) => {
  const backups = backupManager.getBackupList();
  res.json({ backups });
});

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ===== START SERVER =====

app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
  console.log(`[SECURITY] Helmet, CORS, Rate Limit, XSS Protection enabled`);
  console.log(`[BACKUP] Scheduled every ${backupInterval} hours`);

  // Run initial backup
  backupManager.createBackup().then(() => {
    console.log('[BACKUP] Initial backup completed');
  }).catch(err => {
    console.error('[BACKUP] Initial backup failed:', err.message);
  });
});

module.exports = app;
