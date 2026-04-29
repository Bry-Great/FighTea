-- ============================================================
-- FighTea — Orders & Analytics Queries
-- File: /database/orders.sql
-- Run AFTER schema.sql, inventory.sql, users.sql
-- ============================================================
USE `fightea_db`;

-- ─── SAMPLE ORDER DATA ──────────────────────────────────────
-- These are example rows. In production, orders are inserted
-- via your backend API when customers place orders.

INSERT INTO `orders`
  (`order_number`,`user_id`,`customer_name`,`customer_phone`,`status`,`payment_method`,`payment_status`,`subtotal`,`total`,`order_date`)
VALUES
  ('FT-0001',4,'Santos, Ana',  '09201234567','completed','gcash','paid',  250.00,250.00,CURDATE()),
  ('FT-0002',5,'Garcia, Carlo','09211234567','completed','cash', 'paid',  215.00,215.00,CURDATE()),
  ('FT-0003',4,'Santos, Ana',  '09201234567','completed','gcash','paid',  375.00,375.00,CURDATE()),
  ('FT-0004',5,'Garcia, Carlo','09211234567','completed','cash', 'paid',  130.00,130.00,CURDATE());

-- Sample order items (Order FT-0001)
INSERT INTO `order_items` (`order_id`,`product_id`,`product_name`,`size_label`,`size_price`,`sugar_label`,`ice_label`,`quantity`,`unit_price`,`line_total`) VALUES
  (1,1,'Brown Sugar Boba','Large (22oz)',20.00,'50% (Half)','Normal',1,140.00,140.00),
  (1,2,'Taro Milk Tea',   'Medium (16oz)',0.00,'25% (Less)','Less Ice',1,110.00,110.00);

-- Toppings for order FT-0001 item 1
INSERT INTO `order_item_toppings` (`order_item_id`,`topping_id`,`topping_name`,`price`) VALUES
  (1,1,'Tapioca Pearls',15.00);

-- ─── USEFUL ANALYTICS QUERIES ───────────────────────────────
-- Connect these to your backend API endpoints for live analytics.

-- Today's revenue (paid orders only)
-- SELECT SUM(total) AS today_revenue
-- FROM orders
-- WHERE DATE(created_at) = CURDATE() AND payment_status = 'paid';

-- Top selling products (all time)
-- SELECT p.name, p.emoji, SUM(oi.quantity) AS total_sold, SUM(oi.line_total) AS revenue
-- FROM order_items oi
-- JOIN products p ON oi.product_id = p.id
-- JOIN orders o ON oi.order_id = o.id
-- WHERE o.status != 'cancelled'
-- GROUP BY p.id ORDER BY total_sold DESC LIMIT 10;

-- Monthly revenue breakdown
-- SELECT DATE_FORMAT(order_date,'%Y-%m') AS month,
--        COUNT(*) AS order_count,
--        SUM(total) AS revenue
-- FROM orders WHERE payment_status='paid'
-- GROUP BY month ORDER BY month DESC;

-- Orders by payment method
-- SELECT payment_method, COUNT(*) AS count, SUM(total) AS total
-- FROM orders WHERE payment_status='paid' GROUP BY payment_method;

-- Orders by status (for dashboard stats)
-- SELECT status, COUNT(*) AS count FROM orders GROUP BY status;

-- Average order value
-- SELECT AVG(total) AS avg_order_value FROM orders WHERE payment_status='paid';

-- Pending cash revenue (unpaid cash orders)
-- SELECT SUM(total) AS pending_revenue
-- FROM orders WHERE payment_method='cash' AND payment_status='unpaid'
--   AND status NOT IN ('cancelled');

-- ─── API ENDPOINTS NEEDED FOR LIVE ANALYTICS ────────────────
-- GET /api/analytics/summary      → totals, counts, avg
-- GET /api/analytics/top-items    → top products by qty sold
-- GET /api/analytics/by-day       → revenue per day (last 30 days)
-- GET /api/analytics/payments     → cash vs gcash split
-- GET /api/analytics/inventory    → available/unavailable products
-- See README.md for full backend connection guide.
