'use strict';
const router = require('express').Router();
const { createOrder, getOrders, updateOrderStatus, updateOrder } = require('../controllers/orderController');
const { requireAuth } = require('../middleware/auth');

router.post('/',           requireAuth(),       createOrder);
router.get('/',            requireAuth('staff'), getOrders);
router.patch('/:id/status',requireAuth('staff'), updateOrderStatus);
router.put('/:id',         requireAuth('staff'), updateOrder);

module.exports = router;
