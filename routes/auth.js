const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');
const { authLimiter } = require('../middleware/security');
const emailService = require('../services/email');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || 30);

// Register
router.post('/register', authLimiter, (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Sanitize
    username = username.trim().slice(0, 30);
    email = email.trim().toLowerCase();

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || 12);
    const hashedPassword = bcrypt.hashSync(password, saltRounds);

    // Create user
    const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(
      username, email, hashedPassword
    );

    // Generate token
    const token = jwt.sign(
      { id: result.lastInsertRowid, role: 'user' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      message: 'Account created',
      token,
      user: { id: result.lastInsertRowid, username, email, role: 'user' }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', authLimiter, (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    email = email.trim().toLowerCase();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({ error: `Account locked. Try again in ${remaining} minutes` });
    }

    // Verify password
    if (!bcrypt.compareSync(password, user.password)) {
      const attempts = user.failed_login_attempts + 1;
      let lockedUntil = null;

      if (attempts >= MAX_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
        db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
          .run(attempts, lockedUntil, user.id);
        return res.status(423).json({ error: `Account locked for ${LOCKOUT_MINUTES} minutes` });
      }

      db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, user.id);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset attempts on success
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Forgot password - send verification code
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    email = email.trim().toLowerCase();

    // Always return success to prevent email enumeration
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (!user) {
      // Still return success to prevent email enumeration
      return res.json({ message: 'If the email exists, a code has been sent' });
    }

    // Generate secure 6-digit code using crypto
    const code = crypto.randomInt(100000, 999999).toString();

    // Hash the code before storing
    const codeHash = bcrypt.hashSync(code, 10);

    // Delete old codes for this email
    db.prepare('DELETE FROM verification_codes WHERE email = ?').run(email);

    // Store hashed code with 15 minute expiry
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(
      email, codeHash, expiresAt
    );

    // Send email via Brevo
    try {
      await emailService.sendPasswordResetCode(email, code);
    } catch (emailErr) {
      console.error('[PASSWORD RESET] Email send failed:', emailErr.message);
      // Still return success to prevent email enumeration
    }

    res.json({ message: 'If the email exists, a code has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with verification code
router.post('/reset-password', authLimiter, (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find valid verification code
    const verification = db.prepare(
      'SELECT * FROM verification_codes WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).get(normalizedEmail);

    if (!verification) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Check expiry
    if (new Date(verification.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }

    // Verify code against hash
    const codeValid = bcrypt.compareSync(code, verification.code);
    if (!codeValid) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Mark code as used
    db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(verification.id);

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || 12);
    const hashedPassword = bcrypt.hashSync(newPassword, saltRounds);

    // Update password and reset failed attempts
    db.prepare('UPDATE users SET password = ?, failed_login_attempts = 0, locked_until = NULL WHERE email = ?')
      .run(hashedPassword, normalizedEmail);

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
