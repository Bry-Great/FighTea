'use strict';
const router = require('express').Router();
const { getSettings, getLogo, updateSettings } = require('../controllers/settingsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',      getSettings);               // public — shop name, gcash
router.get('/logo',  getLogo);                   // public — logo data URL
router.put('/',      requireAuth('admin'), updateSettings);  // admin only

module.exports = router;
