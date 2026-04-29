'use strict';
const router = require('express').Router();
const m = require('../controllers/menuController');
const { requireAuth } = require('../middleware/auth');

// Public (also serves admin with is_available filter)
router.get('/categories',            m.getCategories);
router.get('/products',              m.getMenu);
router.get('/sizes',                 m.getSizes);
router.get('/toppings',              m.getToppings);
router.get('/promos',                m.getPromos);

// Admin only
router.post('/categories',           requireAuth('admin'), m.createCategory);
router.put('/categories/:id',        requireAuth('admin'), m.updateCategory);
router.delete('/categories/:id',     requireAuth('admin'), m.deleteCategory);

router.post('/products',             requireAuth('admin'), m.createProduct);
router.put('/products/:id',          requireAuth('admin'), m.updateProduct);
router.delete('/products/:id',       requireAuth('admin'), m.deleteProduct);

router.post('/sizes',                requireAuth('admin'), m.createSize);
router.put('/sizes/:id',             requireAuth('admin'), m.updateSize);
router.delete('/sizes/:id',          requireAuth('admin'), m.deleteSize);

router.post('/toppings',             requireAuth('admin'), m.createTopping);
router.put('/toppings/:id',          requireAuth('admin'), m.updateTopping);
router.delete('/toppings/:id',       requireAuth('admin'), m.deleteTopping);

router.post('/promos',               requireAuth('admin'), m.createPromo);
router.put('/promos/:id',            requireAuth('admin'), m.updatePromo);
router.delete('/promos/:id',         requireAuth('admin'), m.deletePromo);

module.exports = router;
