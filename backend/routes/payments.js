// ============================================================
// FighTea — Payment Routes
// File: /backend/routes/payments.js
// ============================================================
'use strict';

const router = require('express').Router();
const { createGCashPayment, handleWebhook, verifyPayment } = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/auth');

// Create GCash payment link — customer must be logged in
router.post('/gcash/create', requireAuth(), createGCashPayment);

// PayMongo webhook — NO auth (PayMongo calls this directly)
// Must use raw body for signature verification
router.post('/gcash/webhook', handleWebhook);

// Verify payment status — customer polls this after redirect
router.get('/gcash/verify/:linkId', requireAuth(), verifyPayment);

module.exports = router;
