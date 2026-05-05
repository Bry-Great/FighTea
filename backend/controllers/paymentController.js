// ============================================================
// FighTea — PayMongo Payment Controller
// File: /backend/controllers/paymentController.js
//
// Flow:
//   1. POST /api/payments/gcash/create  → creates PayMongo link
//      Returns { checkout_url, payment_link_id, order_id }
//   2. Customer pays on PayMongo GCash page
//   3. PayMongo redirects to /payment/success or /payment/failed
//   4. POST /api/payments/gcash/webhook → PayMongo confirms payment
//      Marks order as paid in DB
// ============================================================
'use strict';

const https = require('https');
const db    = require('../config/db');

const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

// ── Helper: PayMongo API request ─────────────────────────────
function paymongoRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) {
      return reject(new Error('PAYMONGO_SECRET_KEY is not set in environment variables.'));
    }

    const payload    = body ? JSON.stringify(body) : null;
    const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');

    const options = {
      hostname: 'api.paymongo.com',
      path:     '/v1' + path,
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = parsed.errors?.[0]?.detail || `PayMongo error ${res.statusCode}`;
            reject(new Error(err));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Invalid PayMongo response: ' + data.slice(0, 100)));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── POST /api/payments/gcash/create ──────────────────────────
// Called when customer clicks "Pay with GCash" in checkout
async function createGCashPayment(req, res) {
  try {
    const { order_id, order_number, amount, customer_name, customer_email } = req.body;

    if (!order_id || !amount) {
      return res.status(400).json({ error: 'order_id and amount are required.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://frontend-blue-three-qd5j3maqw2.vercel.app';
    // Strip trailing slash
    const baseUrl = frontendUrl.replace(/\/$/, '');

    // Create PayMongo Payment Link
    const response = await paymongoRequest('POST', '/links', {
      data: {
        attributes: {
          amount:      Math.round(parseFloat(amount) * 100),  // centavos
          currency:    'PHP',
          description: `FighTea Order ${order_number}`,
          remarks:     `Order ID: ${order_id}`,
          redirect: {
            success: `${baseUrl}/?status=success&order=${order_number}`,
            failed:  `${baseUrl}/?status=failed&order=${order_number}`,
          },
        },
      },
    });

    const link       = response.data;
    const checkoutUrl = link.attributes.checkout_url;
    const linkId      = link.id;

    // Save the payment link ID to the order for webhook matching
    await db.query(
      'UPDATE orders SET gcash_ref = ? WHERE id = ?',
      [linkId, order_id]
    );

    res.json({
      checkout_url:    checkoutUrl,
      payment_link_id: linkId,
      order_id,
    });
  } catch (err) {
    console.error('createGCashPayment error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/payments/gcash/webhook ─────────────────────────
// PayMongo sends this when payment is completed
// Must be publicly accessible (no auth middleware)
async function handleWebhook(req, res) {
  try {
    // Verify webhook signature
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const sigHeader = req.headers['paymongo-signature'];
      if (!sigHeader) {
        return res.status(401).json({ error: 'Missing PayMongo signature.' });
      }

      const crypto   = require('crypto');
      const rawBody  = JSON.stringify(req.body);
      const parts    = sigHeader.split(',');
      const tPart    = parts.find(p => p.startsWith('t='));
      const vPart    = parts.find(p => p.startsWith('te=') || p.startsWith('li='));
      const timestamp = tPart ? tPart.slice(2) : '';
      const sigValue  = vPart ? vPart.slice(vPart.indexOf('=') + 1) : '';
      const expected  = crypto
        .createHmac('sha256', webhookSecret)
        .update(timestamp + '.' + rawBody)
        .digest('hex');

      if (expected !== sigValue) {
        return res.status(401).json({ error: 'Invalid webhook signature.' });
      }
    }

    const event = req.body;
    const type  = event?.data?.attributes?.type;

    // Handle payment link paid event
    if (type === 'link.payment.paid' || type === 'payment.paid') {
      const attrs     = event.data.attributes;
      const linkId    = attrs.data?.attributes?.source?.id
                     || attrs.payment?.attributes?.source?.id
                     || null;
      const reference = attrs.data?.id || attrs.payment?.id || '';

      if (linkId) {
        // Find order by gcash_ref (which we set to the link ID when creating)
        await db.query(
          `UPDATE orders
           SET payment_status = 'paid',
               gcash_ref      = CONCAT(gcash_ref, ' | ref:', ?)
           WHERE gcash_ref LIKE ?`,
          [reference, linkId + '%']
        );
      }
    }

    // Always return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (err) {
    console.error('webhook error:', err.message);
    // Still return 200 so PayMongo doesn't retry
    res.json({ received: true });
  }
}

// ── GET /api/payments/gcash/verify/:linkId ───────────────────
// Frontend polls this to check if payment was completed
async function verifyPayment(req, res) {
  try {
    const { linkId } = req.params;

    // Check PayMongo for link status
    const response = await paymongoRequest('GET', `/links/${linkId}`, null);
    const status   = response.data?.attributes?.status;
    const isPaid   = status === 'paid';

    if (isPaid) {
      // Mark order as paid in DB
      await db.query(
        "UPDATE orders SET payment_status = 'paid' WHERE gcash_ref LIKE ?",
        [linkId + '%']
      );
    }

    res.json({ status, paid: isPaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createGCashPayment, handleWebhook, verifyPayment };
