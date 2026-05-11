'use strict';
const router = require('express').Router();
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

router.get('/',     requireAuth('admin'), getUsers);
router.post('/',    requireAuth('admin'), createUser);
router.put('/:id',  requireAuth('admin'), updateUser);
router.delete('/:id',requireAuth('admin'),deleteUser);

module.exports = router;

// PATCH /api/users/:id/trust  — toggle trusted badge (admin only)
router.patch('/:id/trust', requireAuth('admin'), async (req, res) => {
  const db = require('../config/db');
  try {
    const { is_trusted } = req.body;
    await db.query('UPDATE users SET is_trusted = ? WHERE id = ?', [is_trusted ? 1 : 0, req.params.id]);
    res.json({ message: `User ${is_trusted ? 'marked as trusted' : 'trust removed'}.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users/auto-trust  — auto-grant trust after N completed orders (called by orderController)
router.post('/auto-trust', requireAuth('staff'), async (req, res) => {
  const db = require('../config/db');
  try {
    const { user_id } = req.body;
    const [[{ count }]] = await db.query(
      "SELECT COUNT(*) AS count FROM orders WHERE user_id = ? AND status = 'completed'",
      [user_id]
    );
    if (count >= 3) {
      await db.query('UPDATE users SET is_trusted = 1 WHERE id = ? AND is_trusted = 0', [user_id]);
    }
    res.json({ completed_orders: count, auto_trusted: count >= 3 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
