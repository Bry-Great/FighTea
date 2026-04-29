// ============================================================
// FighTea — Express Server  (server.js)
// ============================================================
'use strict';

require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── CORS ─────────────────────────────────────────────────────
// Allow: localhost (dev), file:// (local file open), and the
// configured FRONTEND_URL (production Vercel / custom domain).
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500',   // VS Code Live Server
  'http://localhost:5500',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no Origin header (file://, curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
  exposedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/menu',          require('./routes/menu'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/analytics',     require('./routes/analytics'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings',      require('./routes/settings'));

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// 404
app.use((req, res) =>
  res.status(404).json({ error: `${req.method} ${req.path} not found.` })
);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🧋 FighTea API  →  http://localhost:${PORT}`);
  console.log(`   Mode        :  ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}\n`);
});

module.exports = app;
