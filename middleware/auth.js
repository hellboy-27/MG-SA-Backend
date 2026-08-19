const jwt = require('jsonwebtoken');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists and is not locked
    const user = db.prepare('SELECT id, username, email, role, locked_until FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account is locked.' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(decoded.id);
      if (user) {
        req.user = { id: user.id, username: user.username, email: user.email, role: user.role };
      }
    }
  } catch {}
  next();
}

module.exports = { authMiddleware, adminOnly, optionalAuth };
