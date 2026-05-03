'use strict';
const router = require('express').Router();
const {
  getSummary, getOrderLog, deleteOrderLog, clearHistory, resetAnalytics
} = require('../controllers/analyticsController');
const { requireAuth } = require('../middleware/auth');

// All analytics routes — admin only (staff blocked)
router.get('/summary',             requireAuth('admin'), getSummary);
router.get('/orders',              requireAuth('admin'), getOrderLog);
router.delete('/orders/clear-history', requireAuth('admin'), clearHistory);
router.delete('/orders/:id',       requireAuth('admin'), deleteOrderLog);
router.delete('/reset',            requireAuth('admin'), resetAnalytics);

module.exports = router;
