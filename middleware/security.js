const rateLimit = require('express-rate-limit');

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Auth limiter (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + '-' + (req.headers['user-agent'] || '').slice(0, 20)
});

// Comment/Suggestion limiter
const contentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too fast! Wait a moment' }
});

// Input sanitization
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove JS protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .replace(/data:/gi, '') // Remove data protocol
    .trim();
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('__') || key === 'constructor') continue;
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// XSS protection middleware
function xssProtection(req, res, next) {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
}

// Security headers
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = {
  apiLimiter,
  authLimiter,
  contentLimiter,
  sanitizeInput,
  sanitizeObject,
  xssProtection,
  securityHeaders
};
