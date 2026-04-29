-- ============================================================
-- FighTea — Inventory Schema  v4
-- File: /database/inventory.sql
-- Run AFTER schema.sql
--
-- ALL sample menu data removed per v4 spec.
-- Admin must add categories, toppings, and menu items
-- through the Admin Dashboard after deployment.
--
-- Uses INSERT IGNORE to prevent duplicate entry errors
-- if this file is run more than once.
-- ============================================================
USE `fightea_db`;

-- ── SIZE OPTIONS (fixed, not user-editable) ───────────────
INSERT IGNORE INTO `size_options` (`label`,`price_add`,`sort_order`) VALUES
  ('Small (12oz)',   0.00, 1),
  ('Medium (16oz)',  0.00, 2),
  ('Large (22oz)',  20.00, 3);

-- ── ICE OPTIONS (fixed, not user-editable) ────────────────
INSERT IGNORE INTO `ice_options` (`label`,`sort_order`) VALUES
  ('Normal',   1),
  ('Less Ice', 2),
  ('No Ice',   3),
  ('Warm',     4);

-- ── NOTE ──────────────────────────────────────────────────
-- Sugar options have been REMOVED from the system per v4.
-- Categories, toppings, and menu items are entered by the
-- admin through the Admin Dashboard → Menu Manager tab.
-- They are stored in:
--   categories  (name, slug, sort_order)
--   products    (name, description, base_price, image_url, emoji, category_id)
--   toppings    (name, emoji, price)
