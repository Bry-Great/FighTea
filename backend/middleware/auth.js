// ============================================================
// FighTea — JWT Auth Middleware
// File: /backend/middleware/auth.js
// ============================================================
'use strict';

const jwt = require('jsonwebtoken');

/**
 * requireAuth(role?)
 *   role = undefined  → any authenticated user
 *   role = 'staff'    → admin or staff
 *   role = 'admin'    → admin only
 *
 * Token sources (checked in order):
 *   1. Authorization: Bearer <token>  header  (normal API calls)
 *   2. ?token=<token>                 query   (SSE — EventSource can't set headers)
 */
function requireAuth(role) {
  return (req, res, next) => {
    // Accept token from header OR query string (SSE needs the latter)
    let token = null;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided.' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      if (role === 'admin' && decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
      }
      if (role === 'staff' && !['admin', 'staff'].includes(decoded.role)) {
        return res.status(403).json({ error: 'Staff or Admin access required.' });
      }
      next();
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.';
      return res.status(401).json({ error: msg });
    }
  };
}

module.exports = { requireAuth };
