const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Use setTimeout to avoid blocking the event loop for DB check
    User.findById(decoded.id).select('username email role lockedUntil').then(user => {
      if (!user) {
        return res.status(401).json({ error: 'User not found.' });
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return res.status(423).json({ error: 'Account is locked.' });
      }

      req.user = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role
      };

      next();
    }).catch(() => {
      return res.status(401).json({ error: 'Auth failed.' });
    });
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
      User.findById(decoded.id).select('username email role').then(user => {
        if (user) {
          req.user = { id: user._id.toString(), username: user.username, email: user.email, role: user.role };
        }
        next();
      }).catch(() => next());
    } else {
      next();
    }
  } catch {
    next();
  }
}

module.exports = { authMiddleware, adminOnly, optionalAuth };
