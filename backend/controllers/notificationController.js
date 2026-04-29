// ============================================================
// FighTea — Notification Controller
// File: /backend/controllers/notificationController.js
//
// Supports two transport modes:
//   1. SSE  — GET /api/notifications/stream  (VPS / Railway)
//   2. Poll — GET /api/notifications/poll    (Vercel serverless fallback)
//
// The orderController calls notifyUser() when status → "ready".
// ============================================================
'use strict';

const db = require('../config/db');

/* ──────────────────────────────────────────────────────────
   IN-MEMORY CLIENT REGISTRY  (SSE only)
   Map<userId, Set<res>>  — one user can have multiple tabs
   ────────────────────────────────────────────────────────── */
const clients = new Map();

/* ──────────────────────────────────────────────────────────
   INTERNAL: push event to a specific user (SSE)
   Called by orderController when status → 'ready'
   ────────────────────────────────────────────────────────── */
function notifyUser(userId, eventName, data) {
  const userSet = clients.get(Number(userId));
  if (!userSet || userSet.size === 0) return;   // user not connected via SSE

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of userSet) {
    try { res.write(payload); } catch (_) { /* tab closed */ }
  }
  console.log(`📢 SSE → user ${userId} [${eventName}]`, data.order_number || '');
}

/* ──────────────────────────────────────────────────────────
   INTERNAL: broadcast to all connected clients (SSE)
   Used for queue auto-refresh on admin/staff tabs
   ────────────────────────────────────────────────────────── */
function broadcast(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const set of clients.values()) {
    for (const res of set) {
      try { res.write(payload); } catch (_) {}
    }
  }
}

/* ──────────────────────────────────────────────────────────
   GET /api/notifications/stream   (SSE transport)
   ────────────────────────────────────────────────────────── */
function stream(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache, no-transform');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');   // disable Nginx/proxy buffering
  res.flushHeaders();

  // Register client
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  const total = _countClients();
  console.log(`🔗 SSE connected: user ${userId} (${req.user.name}) | total: ${total}`);

  // Heartbeat every 20s — keeps connection alive through proxies
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); }
    catch (_) { clearInterval(hb); }
  }, 20_000);

  // Confirm connection to the client
  res.write(`event: connected\ndata: ${JSON.stringify({
    message:   'Notification stream connected.',
    userId,
    mode:      'sse',
    timestamp: new Date().toISOString(),
  })}\n\n`);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(hb);
    const s = clients.get(userId);
    if (s) { s.delete(res); if (s.size === 0) clients.delete(userId); }
    console.log(`🔌 SSE disconnected: user ${userId} | total: ${_countClients()}`);
  });
}

/* ──────────────────────────────────────────────────────────
   GET /api/notifications/poll?since=<ISO>   (polling fallback)

   Returns events that happened since ?since= for the
   authenticated user.  Works on Vercel serverless where SSE
   connections are killed after ~10 seconds.
   ────────────────────────────────────────────────────────── */
async function poll(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required.' });

  try {
    // Default to 30 seconds ago if no since= provided
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(Date.now() - 30_000);

    const events = [];

    // Check for orders that became "ready" for this user since last poll
    const [readyOrders] = await db.query(
      `SELECT o.id, o.order_number, o.customer_name, o.total, o.payment_method,
              l.changed_at
       FROM orders o
       JOIN order_status_log l ON l.order_id = o.id
       WHERE o.user_id        = ?
         AND l.new_status     = 'ready'
         AND l.changed_at     > ?
       ORDER BY l.changed_at ASC`,
      [userId, since]
    );

    for (const order of readyOrders) {
      events.push({
        type: 'order_ready',
        data: {
          order_id:     order.id,
          order_number: order.order_number,
          customer:     order.customer_name,
          total:        Number(order.total),
          payment:      order.payment_method,
          timestamp:    order.changed_at,
        },
      });
    }

    // For admin/staff: also send queue_updated events so they can refresh
    if (['admin', 'staff'].includes(req.user.role)) {
      const [updates] = await db.query(
        `SELECT o.id, o.order_number, l.new_status, l.old_status, l.changed_at
         FROM orders o
         JOIN order_status_log l ON l.order_id = o.id
         WHERE l.changed_at > ?
         ORDER BY l.changed_at ASC`,
        [since]
      );
      for (const u of updates) {
        events.push({
          type: 'queue_updated',
          data: {
            order_id:   u.id,
            order_number: u.order_number,
            new_status: u.new_status,
            old_status: u.old_status,
          },
        });
      }
    }

    res.json({ events, server_time: new Date().toISOString() });
  } catch (err) {
    console.error('poll error:', err);
    res.status(500).json({ error: 'Failed to poll notifications.' });
  }
}

/* ──────────────────────────────────────────────────────────
   GET /api/notifications/status   (debug, admin only)
   ────────────────────────────────────────────────────────── */
function status(req, res) {
  const info = {};
  for (const [uid, set] of clients.entries()) info[uid] = set.size;
  res.json({
    connected_users:  clients.size,
    total_connections: _countClients(),
    by_user: info,
  });
}

function _countClients() {
  let n = 0;
  for (const s of clients.values()) n += s.size;
  return n;
}

module.exports = { stream, poll, status, notifyUser, broadcast };
