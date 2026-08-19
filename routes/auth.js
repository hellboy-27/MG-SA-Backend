const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const VerificationCode = require('../models/VerificationCode');
const { authLimiter } = require('../middleware/security');
const emailService = require('../services/email');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || 30);

// Register
router.post('/register', authLimiter, async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    username = username.trim().slice(0, 30);
    email = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || 12);
    const hashedPassword = bcrypt.hashSync(password, saltRounds);

    const user = await User.create({ username, email, password: hashedPassword });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      message: 'Account created',
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil - new Date()) / 60000);
      return res.status(423).json({ error: `Account locked. Try again in ${remaining} minutes` });
    }

    // Verify password
    if (!bcrypt.compareSync(password, user.password)) {
      const attempts = user.failedLoginAttempts + 1;
      let lockedUntil = null;

      if (attempts >= MAX_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
        await User.findByIdAndUpdate(user._id, { failedLoginAttempts: attempts, lockedUntil });
        return res.status(423).json({ error: `Account locked for ${LOCKOUT_MINUTES} minutes` });
      }

      await User.findByIdAndUpdate(user._id, { failedLoginAttempts: attempts });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset attempts on success
    await User.findByIdAndUpdate(user._id, { failedLoginAttempts: 0, lockedUntil: null });

    // Generate login verification code
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = bcrypt.hashSync(code, 10);

    // Delete old login codes for this email
    await VerificationCode.deleteMany({ email, code: { $regex: /^login_/ } });

    // Store hashed code with 10 minute expiry, prefixed with 'login_'
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await VerificationCode.create({ email, code: 'login_' + codeHash, expiresAt });

    // Send code via email
    try {
      await emailService.sendPasswordResetCode(email, code);
    } catch (emailErr) {
      console.error('[LOGIN VERIFY] Email send failed:', emailErr.message);
    }

    res.json({
      requiresVerification: true,
      email: email,
      message: 'Verification code sent to your email'
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify login code and return token
router.post('/verify-login', authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find valid login verification code
    const verification = await VerificationCode.findOne({
      email: normalizedEmail,
      code: { $regex: /^login_/ },
      used: false
    }).sort({ createdAt: -1 });

    if (!verification) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Check expiry
    if (verification.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Code expired. Login again.' });
    }

    // Verify code against hash (strip 'login_' prefix)
    const storedHash = verification.code.replace('login_', '');
    const codeValid = bcrypt.compareSync(code, storedHash);
    if (!codeValid) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Mark code as used
    await VerificationCode.findByIdAndUpdate(verification._id, { used: true });

    // Get user
    const user = await User.findOne({ email: normalizedEmail }).select('username email role');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Verify login error:', err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).select('username email role createdAt');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// Forgot password - send verification code
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    let { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: 'If the email exists, a code has been sent' });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = bcrypt.hashSync(code, 10);

    await VerificationCode.deleteMany({ email });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await VerificationCode.create({ email, code: codeHash, expiresAt });

    try {
      await emailService.sendPasswordResetCode(email, code);
    } catch (emailErr) {
      console.error('[PASSWORD RESET] Email send failed:', emailErr.message);
    }

    res.json({ message: 'If the email exists, a code has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password with verification code
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const verification = await VerificationCode.findOne({
      email: normalizedEmail,
      used: false
    }).sort({ createdAt: -1 });

    if (!verification) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    if (verification.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }

    const codeValid = bcrypt.compareSync(code, verification.code);
    if (!codeValid) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    await VerificationCode.findByIdAndUpdate(verification._id, { used: true });

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || 12);
    const hashedPassword = bcrypt.hashSync(newPassword, saltRounds);

    await User.findOneAndUpdate(
      { email: normalizedEmail },
      { password: hashedPassword, failedLoginAttempts: 0, lockedUntil: null }
    );

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
