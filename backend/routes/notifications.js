// ============================================================
// FighTea — Notification Routes
// File: /backend/routes/notifications.js
// ============================================================
'use strict';

const router = require('express').Router();
const { stream, poll, status } = require('../controllers/notificationController');
const { requireAuth }          = require('../middleware/auth');

// SSE stream — stays open; server pushes events (VPS / Railway)
router.get('/stream', requireAuth(), stream);

// Polling endpoint — called every ~8s by clients as fallback (Vercel)
router.get('/poll',   requireAuth(), poll);

// Debug: show how many SSE clients are connected
router.get('/status', requireAuth('admin'), status);

module.exports = router;
