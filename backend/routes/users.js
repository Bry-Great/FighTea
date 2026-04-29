'use strict';
const router = require('express').Router();
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

router.get('/',     requireAuth('admin'), getUsers);
router.post('/',    requireAuth('admin'), createUser);
router.put('/:id',  requireAuth('admin'), updateUser);
router.delete('/:id',requireAuth('admin'),deleteUser);

module.exports = router;
