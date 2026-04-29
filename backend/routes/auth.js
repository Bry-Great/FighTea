'use strict';
const router = require('express').Router();
const { login, register, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.post('/login',    login);
router.post('/register', register);
router.get('/me',        requireAuth(), me);

module.exports = router;
