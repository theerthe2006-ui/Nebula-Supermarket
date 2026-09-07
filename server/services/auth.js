import crypto from 'node:crypto';
import { db } from '../db.js';

// Hash password with salt using native crypto.scryptSync
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

// Verify password against stored salt:hash
export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
}

// Generate secure random token
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Create a user session
export function createSession(userId, deviceInfo = 'Web App', ipAddress = '127.0.0.1') {
  const sessionId = 'sess-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  db.prepare(`
    INSERT INTO user_sessions (id, user_id, device_info, ip_address, last_active, is_revoked)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
  `).run(sessionId, userId, deviceInfo, ipAddress);
  return sessionId;
}

// Middleware to authenticate requests via Bearer token or x-session-id header
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader ? authHeader.split(' ')[1] : req.headers['x-session-id'];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const session = db.prepare(`
      SELECT s.*, u.id as user_id, u.username, u.email, u.phone, u.role, u.store_id
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.is_revoked = 0 AND u.is_active = 1
    `).get(token);

    if (!session) {
      req.user = null;
      return next();
    }

    // Update last_active
    db.prepare('UPDATE user_sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(token);

    req.user = {
      id: session.user_id,
      username: session.username,
      email: session.email,
      phone: session.phone,
      role: session.role,
      storeId: session.store_id,
      sessionId: token
    };
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

// Role authorization guard
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}
