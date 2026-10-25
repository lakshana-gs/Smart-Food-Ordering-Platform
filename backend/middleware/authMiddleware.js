const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'food_delivery_dev_secret_2026_change_this';

function requireAuth(req, res, next) {
  const authHeader = req.header('Authorization') || req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied. Authentication token required.' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) {
    return res.status(401).json({ message: 'Access denied. Token is empty.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token. Please log in again.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
  }
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.header('Authorization') || req.headers['authorization'];
  if (!authHeader) {
    req.user = null;
    return next();
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
  } catch (err) {
    req.user = null;
  }
  next();
}

// For backward compatibility where existing files did `const authMiddleware = require('../middleware/authMiddleware');`
// we make requireAuth the main callable function and attach properties:
requireAuth.requireAuth = requireAuth;
requireAuth.requireAdmin = requireAdmin;
requireAuth.optionalAuth = optionalAuth;

module.exports = requireAuth;