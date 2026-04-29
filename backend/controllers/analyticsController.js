// ============================================================
// FighTea — Analytics Controller  v6
// Admin only: view summary, list completed orders,
//             delete individual orders from logs,
//             reset all analytics.
// Staff:      NO access to analytics or order logs.
// ============================================================
'use strict';

const db = require('../config/db');

// GET /api/analytics/summary  (admin only)
async function getSummary(req, res) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [[{ total_revenue }]] = await db.query(
      "SELECT COALESCE(SUM(total),0) AS total_revenue FROM orders WHERE payment_status='paid'"
    );
    const [[{ today_revenue }]] = await db.query(
      "SELECT COALESCE(SUM(total),0) AS today_revenue FROM orders WHERE payment_status='paid' AND order_date=?",
      [today]
    );
    const [[{ total_orders }]]    = await db.query('SELECT COUNT(*) AS total_orders FROM orders');
    const [[{ today_orders }]]    = await db.query(
      'SELECT COUNT(*) AS today_orders FROM orders WHERE order_date=?', [today]
    );
    const [[{ completed }]]       = await db.query(
      "SELECT COUNT(*) AS completed FROM orders WHERE status='completed'"
    );
    const [[{ gcash_count }]]     = await db.query(
      "SELECT COUNT(*) AS gcash_count FROM orders WHERE payment_method='gcash'"
    );
    const [[{ cash_count }]]      = await db.query(
      "SELECT COUNT(*) AS cash_count FROM orders WHERE payment_method='cash'"
    );
    const [[{ pending_revenue }]] = await db.query(
      "SELECT COALESCE(SUM(total),0) AS pending_revenue FROM orders WHERE payment_method='cash' AND payment_status='unpaid'"
    );
    const [top_items] = await db.query(
      `SELECT p.name, p.emoji, p.image_url AS image,
              SUM(oi.quantity) AS count, SUM(oi.line_total) AS revenue
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o   ON oi.order_id   = o.id
       WHERE o.status != 'cancelled'
       GROUP BY p.id ORDER BY count DESC LIMIT 5`
    );
    const [byStatusRows] = await db.query(
      'SELECT status, COUNT(*) AS n FROM orders GROUP BY status'
    );

    res.json({
      total_revenue, today_revenue, pending_revenue,
      total_orders, today_orders, completed,
      gcash_count, cash_count,
      avg_order: total_orders > 0 ? (total_revenue / total_orders) : 0,
      top_items,
      by_status: Object.fromEntries(byStatusRows.map(r => [r.status, r.n])),
    });
  } catch (err) {
    console.error('analytics summary error:', err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/analytics/orders  — completed order log (admin only)
async function getOrderLog(req, res) {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const [orders] = await db.query(
      `SELECT o.id, o.order_number, o.customer_name, o.total,
              o.payment_method, o.payment_status, o.status,
              o.order_date, o.created_at, o.notes,
              COUNT(oi.id) AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status IN ('completed','cancelled')
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[{ total_count }]] = await db.query(
      "SELECT COUNT(*) AS total_count FROM orders WHERE status IN ('completed','cancelled')"
    );

    res.json({ orders, total_count, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/analytics/orders/:id  — remove one order from logs (admin only)
async function deleteOrderLog(req, res) {
  try {
    const [[order]] = await db.query(
      "SELECT id, status FROM orders WHERE id = ?", [req.params.id]
    );
    if (!order)
      return res.status(404).json({ error: 'Order not found.' });
    if (!['completed', 'cancelled'].includes(order.status))
      return res.status(400).json({
        error: 'Only completed or cancelled orders can be removed from logs.',
      });

    // Cascade delete handles order_items, order_item_toppings, order_status_log
    await db.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Order removed from logs.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/analytics/reset  — wipe ALL orders (admin only, irreversible)
async function resetAnalytics(req, res) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Disable FK checks temporarily to allow truncation
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE order_item_toppings');
    await conn.query('TRUNCATE TABLE order_items');
    await conn.query('TRUNCATE TABLE order_status_log');
    await conn.query('TRUNCATE TABLE payments');
    await conn.query('TRUNCATE TABLE orders');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.commit();
    res.json({ message: 'All order data has been reset.' });
  } catch (err) {
    await conn.rollback();
    console.error('reset error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
}

module.exports = { getSummary, getOrderLog, deleteOrderLog, resetAnalytics };
