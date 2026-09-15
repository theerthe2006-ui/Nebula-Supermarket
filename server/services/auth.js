import crypto from 'node:crypto';
import { db } from '../db.js';

const DEFAULT_JWT_SECRET = 'nebula_supermarket_jwt_secret_key_change_in_production_2026';

function getJwtSecret() {
  return process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

// Base64Url encoding/decoding utilities for RFC 7519 JWT
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

// Generate RFC 7519 standard HMAC-SHA256 JWT
export function signJwt(payload, expiresInSeconds = 7 * 24 * 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signatureInput}.${signature}`;
}

// Verify RFC 7519 standard HMAC-SHA256 JWT
export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired token
    }
    return payload;
  } catch {
    return null;
  }
}

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
  const keyBuf = Buffer.from(key, 'hex');
  if (keyBuf.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedKey);
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
  let token = null;

  if (authHeader) {
    token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  } else if (req.headers['x-session-id']) {
    token = String(req.headers['x-session-id']).trim();
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    // 1. Check if token is a valid JWT
    const jwtPayload = verifyJwt(token);
    if (jwtPayload && jwtPayload.id) {
      const user = db.prepare('SELECT id, store_id, username, email, phone, role, is_active FROM users WHERE id = ?').get(jwtPayload.id);
      if (user && user.is_active) {
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role,
          storeId: user.store_id,
          token
        };
        return next();
      }
    }

    // 2. Fall back to user_sessions table check for backwards compatibility
    const session = db.prepare(`
      SELECT s.*, u.id as user_id, u.username, u.email, u.phone, u.role, u.store_id
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.is_revoked = 0 AND u.is_active = 1
    `).get(token);

    if (session) {
      db.prepare('UPDATE user_sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(token);
      req.user = {
        id: session.user_id,
        username: session.username,
        email: session.email,
        phone: session.phone,
        role: session.role,
        storeId: session.store_id,
        sessionId: token,
        token
      };
      return next();
    }

    req.user = null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

// Strict authentication guard for protected user routes
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  next();
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
