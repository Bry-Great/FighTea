// ============================================================
// FighTea — Menu Controller
// File: /backend/controllers/menuController.js
// Handles: categories, products, sizes, toppings, varieties, promos
// ============================================================
'use strict';

const db = require('../config/db');

/* ─── CATEGORIES ─────────────────────────────────────────── */
async function getCategories(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function createCategory(req, res) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const [[max]] = await db.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM categories');
    await db.query('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)', [name.trim(), slug, max.n]);
    res.status(201).json({ message: 'Category created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Category already exists.' });
    res.status(500).json({ error: err.message });
  }
}

async function updateCategory(req, res) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const [r] = await db.query('UPDATE categories SET name = ?, slug = ? WHERE id = ?', [name.trim(), slug, req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function deleteCategory(req, res) {
  try {
    const [[count]] = await db.query('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [req.params.id]);
    if (count.n > 0) return res.status(409).json({ error: 'Category has items assigned. Re-assign or remove them first.' });
    await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

/* ─── PRODUCTS ───────────────────────────────────────────── */
async function getMenu(req, res) {
  try {
    const includeUnavailable = req.user?.role === 'admin' || req.user?.role === 'staff';
    const whereClause = includeUnavailable ? '' : 'WHERE p.is_available = 1';
    const [products] = await db.query(
      `SELECT p.*, c.name AS category
       FROM products p JOIN categories c ON p.category_id = c.id
       ${whereClause} ORDER BY c.sort_order, p.id`
    );
    // Attach varieties for each product
    for (const p of products) {
      const [varieties] = await db.query('SELECT * FROM product_varieties WHERE product_id = ? ORDER BY id', [p.id]);
      p.varieties = varieties;
    }
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function createProduct(req, res) {
  try {
    const { name, category_id, description, base_price, image_url, emoji, is_bestseller, has_sizes, varieties } = req.body;
    if (!name || category_id == null || base_price == null)
      return res.status(400).json({ error: 'Name, category_id and base_price are required.' });
    const [r] = await db.query(
      `INSERT INTO products (category_id, name, description, base_price, image_url, emoji, is_bestseller, has_sizes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [category_id, name.trim(), description || null, base_price, image_url || null, emoji || '🧋', is_bestseller ? 1 : 0, has_sizes ? 1 : 0]
    );
    const productId = r.insertId;
    if (varieties?.length) {
      for (const v of varieties) {
        await db.query('INSERT INTO product_varieties (product_id, name, price) VALUES (?, ?, ?)', [productId, v.name, v.price]);
      }
    }
    res.status(201).json({ message: 'Product created.', id: productId });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function updateProduct(req, res) {
  try {
    const { name, category_id, description, base_price, image_url, emoji, is_bestseller, is_available, has_sizes, varieties } = req.body;
    const [r] = await db.query(
      `UPDATE products SET category_id=?, name=?, description=?, base_price=?, image_url=?,
       emoji=?, is_bestseller=?, is_available=?, has_sizes=? WHERE id=?`,
      [category_id, name?.trim(), description, base_price, image_url, emoji || '🧋',
       is_bestseller ? 1 : 0, is_available !== false ? 1 : 0, has_sizes ? 1 : 0, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Product not found.' });
    // Replace varieties
    if (varieties !== undefined) {
      await db.query('DELETE FROM product_varieties WHERE product_id = ?', [req.params.id]);
      for (const v of (varieties || [])) {
        await db.query('INSERT INTO product_varieties (product_id, name, price) VALUES (?, ?, ?)', [req.params.id, v.name, v.price]);
      }
    }
    res.json({ message: 'Product updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function deleteProduct(req, res) {
  try {
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

/* ─── SIZES ──────────────────────────────────────────────── */
async function getSizes(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM size_options ORDER BY sort_order, id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function createSize(req, res) {
  try {
    const { label, price_add } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required.' });
    const [[max]] = await db.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM size_options');
    await db.query('INSERT INTO size_options (label, price_add, sort_order) VALUES (?, ?, ?)', [label.trim(), price_add || 0, max.n]);
    res.status(201).json({ message: 'Size created.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function updateSize(req, res) {
  try {
    const { label, price_add } = req.body;
    await db.query('UPDATE size_options SET label = ?, price_add = ? WHERE id = ?', [label?.trim(), price_add || 0, req.params.id]);
    res.json({ message: 'Size updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function deleteSize(req, res) {
  try {
    await db.query('DELETE FROM size_options WHERE id = ?', [req.params.id]);
    res.json({ message: 'Size deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

/* ─── TOPPINGS ───────────────────────────────────────────── */
async function getToppings(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM toppings WHERE is_available = 1 ORDER BY sort_order, id');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function createTopping(req, res) {
  try {
    const { name, emoji, price } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    await db.query('INSERT INTO toppings (name, emoji, price) VALUES (?, ?, ?)', [name.trim(), emoji || null, price || 15]);
    res.status(201).json({ message: 'Topping created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Topping already exists.' });
    res.status(500).json({ error: err.message });
  }
}
async function updateTopping(req, res) {
  try {
    const { name, emoji, price } = req.body;
    await db.query('UPDATE toppings SET name = ?, emoji = ?, price = ? WHERE id = ?', [name?.trim(), emoji || null, price, req.params.id]);
    res.json({ message: 'Topping updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function deleteTopping(req, res) {
  try {
    await db.query('DELETE FROM toppings WHERE id = ?', [req.params.id]);
    res.json({ message: 'Topping deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

/* ─── PROMOS ─────────────────────────────────────────────── */
async function getPromos(req, res) {
  try {
    const [promos] = await db.query('SELECT * FROM promos ORDER BY id DESC');
    for (const p of promos) {
      const [items] = await db.query('SELECT * FROM promo_items WHERE promo_id = ?', [p.id]);
      p.items = items;
    }
    res.json(promos);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function createPromo(req, res) {
  try {
    const { name, badge, description, is_active, items } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const [r] = await db.query(
      'INSERT INTO promos (name, badge, description, is_active) VALUES (?, ?, ?, ?)',
      [name, badge || null, description || null, is_active !== false ? 1 : 0]
    );
    const promoId = r.insertId;
    for (const item of (items || [])) {
      await db.query(
        'INSERT INTO promo_items (promo_id, product_id, variety_id, size_id, promo_price) VALUES (?, ?, ?, ?, ?)',
        [promoId, item.itemId, item.varietyId || null, item.sizeId || null, item.promoPrice]
      );
    }
    res.status(201).json({ message: 'Promo created.', id: promoId });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function updatePromo(req, res) {
  try {
    const { name, badge, description, is_active, items } = req.body;
    await db.query('UPDATE promos SET name=?, badge=?, description=?, is_active=? WHERE id=?',
      [name, badge || null, description || null, is_active ? 1 : 0, req.params.id]);
    if (items !== undefined) {
      await db.query('DELETE FROM promo_items WHERE promo_id = ?', [req.params.id]);
      for (const item of (items || [])) {
        await db.query(
          'INSERT INTO promo_items (promo_id, product_id, variety_id, size_id, promo_price) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.itemId, item.varietyId || null, item.sizeId || null, item.promoPrice]
        );
      }
    }
    res.json({ message: 'Promo updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
async function deletePromo(req, res) {
  try {
    await db.query('DELETE FROM promos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Promo deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = {
  getCategories, createCategory, updateCategory, deleteCategory,
  getMenu, createProduct, updateProduct, deleteProduct,
  getSizes, createSize, updateSize, deleteSize,
  getToppings, createTopping, updateTopping, deleteTopping,
  getPromos, createPromo, updatePromo, deletePromo,
};
