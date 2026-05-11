// ============================================================
// FighTea — Order Controller
// File: /backend/controllers/orderController.js
// ============================================================
'use strict';

const db = require('../config/db');
const { notifyUser, broadcast } = require('./notificationController');

// POST /api/orders  — place a new order
async function createOrder(req, res) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { items, payment_method, gcash_ref, notes } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Order must have at least one item.' });

    const today    = new Date().toISOString().slice(0, 10);
    const total    = items.reduce((s, i) => s + i.line_total, 0);
    const orderNum = 'FT-' + Date.now().toString().slice(-6);
    const gcashReceipt = req.body.gcash_receipt || null;  // base64 image from customer

    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (order_number, user_id, customer_name, customer_phone,
          status, payment_method, payment_status, gcash_ref,
          gcash_receipt, subtotal, total, notes, order_date)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNum, req.user.id, req.user.name, req.user.phone || null,
       payment_method,
       payment_method === 'gcash' ? 'pending_verification' : 'unpaid',
       null,
       gcashReceipt,
       total, total, notes || null, today]
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      const [itemResult] = await conn.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, size_label, size_price, ice_label, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id || null, item.name,
         item.size || null, item.size_price || 0, item.ice || null,
         item.qty, item.unit_price, item.line_total]
      );
      for (const t of (item.toppings || [])) {
        await conn.query(
          'INSERT INTO order_item_toppings (order_item_id, topping_name, price) VALUES (?, ?, ?)',
          [itemResult.insertId, t.name, t.price || 15]
        );
      }
    }

    await conn.commit();

    // Broadcast to all connected admin/staff tabs so queue auto-updates
    broadcast('queue_updated', {
      order_id:     orderId,
      order_number: orderNum,
      new_status:   'pending',
      old_status:   null,
      event:        'new_order',
    });

    res.status(201).json({ success: true, order_number: orderNum, order_id: orderId, total });
  } catch (err) {
    await conn.rollback();
    console.error('createOrder error:', err);
    res.status(500).json({ error: 'Failed to place order.' });
  } finally { conn.release(); }
}

// GET /api/orders?status=active|pending|preparing|ready|completed|cancelled|all
async function getOrders(req, res) {
  try {
    const { status } = req.query;
    let sql = `SELECT o.*, u.is_trusted
               FROM orders o
               LEFT JOIN users u ON o.user_id = u.id`;
    const params = [];
    if (status === 'active') {
      sql += " WHERE o.status NOT IN ('completed','cancelled')";
    } else if (status && status !== 'all') {
      sql += ' WHERE o.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY o.created_at DESC';
    const [orders] = await db.query(sql, params);

    // Attach items for each order
    for (const o of orders) {
      const [items] = await db.query(
        `SELECT oi.*, GROUP_CONCAT(oit.topping_name SEPARATOR ',') AS topping_names
         FROM order_items oi
         LEFT JOIN order_item_toppings oit ON oit.order_item_id = oi.id
         WHERE oi.order_id = ? GROUP BY oi.id`, [o.id]
      );
      o.items = items.map(i => ({ ...i, toppings: i.topping_names ? i.topping_names.split(',') : [] }));
    }
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PATCH /api/orders/:id/status
async function updateOrderStatus(req, res) {
  try {
    const { status } = req.body;
    const valid = ['pending','preparing','ready','completed','cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

    const [[order]] = await db.query(
      'SELECT o.*, u.id AS customer_id, u.full_name AS customer_name FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?',
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    if (status === 'completed') {
      await db.query("UPDATE orders SET payment_status = 'paid' WHERE id = ? AND payment_method = 'cash'", [req.params.id]);
    }
    await db.query(
      'INSERT INTO order_status_log (order_id, old_status, new_status, changed_by) VALUES (?, ?, ?, ?)',
      [req.params.id, order.status, status, req.user.id]
    );

    // ── Push SSE notification to the customer ────────────────
    if (status === 'ready' && order.customer_id) {
      notifyUser(order.customer_id, 'order_ready', {
        order_id:     order.id,
        order_number: order.order_number,
        customer:     order.customer_name,
        total:        Number(order.total),
        payment:      order.payment_method,
        timestamp:    new Date().toISOString(),
      });
    }

    // ── Auto-trust: if user has 3+ completed orders, grant trusted badge ──
    if (newStatus === 'completed') {
      const [[{ comp_count }]] = await db.query(
        "SELECT COUNT(*) AS comp_count FROM orders WHERE user_id = ? AND status = 'completed'",
        [order.user_id]
      );
      if (comp_count >= 3 && order.user_id) {
        await db.query('UPDATE users SET is_trusted = 1 WHERE id = ? AND is_trusted = 0', [order.user_id]);
      }
    }

    // ── Broadcast queue refresh to all staff/admin tabs ──────
    broadcast('queue_updated', {
      order_id:     order.id,
      order_number: order.order_number,
      new_status:   status,
      old_status:   order.status,
    });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/orders/:id  — edit order details
async function updateOrder(req, res) {
  try {
    const { customer_name, notes, payment_method } = req.body;
    await db.query(
      'UPDATE orders SET customer_name = ?, notes = ?, payment_method = ? WHERE id = ?',
      [customer_name, notes, payment_method, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { createOrder, getOrders, updateOrderStatus, updateOrder };
