const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

function auth() {
  return async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = { userId: payload.userId, email: payload.email, displayName: payload.displayName };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

function optionalAuth() {
  return async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      req.user = null;
      return next();
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = { userId: payload.userId, email: payload.email, displayName: payload.displayName };
    } catch {
      req.user = null;
    }
    next();
  };
}

function adminAuth() {
  return async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const userId = payload.userId;
      const user = await User.findById(userId).select('isAdmin').lean();
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      if (!user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      req.user = { userId, email: payload.email, displayName: payload.displayName, isAdmin: true };
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

module.exports = { auth, optionalAuth, adminAuth };
