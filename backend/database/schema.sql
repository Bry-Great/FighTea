-- ============================================================
--  FighTea Milk Tea Shop — Master Database Schema
--  File   : backend/database/schema.sql
--  Version: 5.0  (production-ready, MySQL 5.7+ / 8.x)
--
--  HOW TO RUN:
--    mysql -u root -p < backend/database/schema.sql
--
--  SAFE TO RE-RUN: all statements use IF NOT EXISTS.
--  No ALTER TABLE statements — columns are defined once here.
-- ============================================================

CREATE DATABASE IF NOT EXISTS `fightea_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `fightea_db`;

-- ── 1. USERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  `full_name`     VARCHAR(120)     NOT NULL,
  `email`         VARCHAR(180)     NOT NULL UNIQUE,
  `phone`         VARCHAR(20)      DEFAULT NULL,
  `password_hash` VARCHAR(255)     NOT NULL,
  `role`          ENUM('customer','admin','staff') NOT NULL DEFAULT 'customer',
  `is_active`     TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                   ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_role`  (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. CATEGORIES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
  `id`         INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(80)      NOT NULL UNIQUE,
  `slug`       VARCHAR(80)      NOT NULL UNIQUE,
  `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1)       NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. PRODUCTS ───────────────────────────────────────────────
--   has_sizes : 1 = show size selector for this item (drinks)
--               0 = no sizes (food, snacks, etc.)
CREATE TABLE IF NOT EXISTS `products` (
  `id`            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  `category_id`   INT UNSIGNED  NOT NULL,
  `name`          VARCHAR(120)  NOT NULL,
  `description`   TEXT          DEFAULT NULL,
  `base_price`    DECIMAL(8,2)  NOT NULL,
  `image_url`     TEXT          DEFAULT NULL,
  `emoji`         VARCHAR(10)   NOT NULL DEFAULT '🧋',
  `is_available`  TINYINT(1)    NOT NULL DEFAULT 1,
  `is_bestseller` TINYINT(1)    NOT NULL DEFAULT 0,
  `has_sizes`     TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX `idx_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. PRODUCT VARIETIES ─────────────────────────────────────
--   e.g. Regular Fries / Cheesy Fries / Overload Fries
CREATE TABLE IF NOT EXISTS `product_varieties` (
  `id`         INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT UNSIGNED     NOT NULL,
  `name`       VARCHAR(80)      NOT NULL,
  `price`      DECIMAL(8,2)     NOT NULL,
  `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. SIZE OPTIONS (admin-managed) ──────────────────────────
CREATE TABLE IF NOT EXISTS `size_options` (
  `id`         INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  `label`      VARCHAR(30)      NOT NULL UNIQUE,
  `price_add`  DECIMAL(6,2)     NOT NULL DEFAULT 0.00,
  `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 6. ICE OPTIONS (admin-managed) ───────────────────────────
CREATE TABLE IF NOT EXISTS `ice_options` (
  `id`         INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  `label`      VARCHAR(30)      NOT NULL UNIQUE,
  `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 7. TOPPINGS (admin-managed) ───────────────────────────────
CREATE TABLE IF NOT EXISTS `toppings` (
  `id`           INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  `name`         VARCHAR(80)      NOT NULL UNIQUE,
  `emoji`        VARCHAR(10)      DEFAULT NULL,
  `price`        DECIMAL(6,2)     NOT NULL DEFAULT 15.00,
  `is_available` TINYINT(1)       NOT NULL DEFAULT 1,
  `sort_order`   TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 8. PROMOS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `promos` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(120) NOT NULL,
  `badge`       VARCHAR(20)  DEFAULT NULL,
  `description` TEXT         DEFAULT NULL,
  `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 9. PROMO ITEMS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `promo_items` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `promo_id`    INT UNSIGNED NOT NULL,
  `product_id`  INT UNSIGNED NOT NULL,
  `variety_id`  INT UNSIGNED DEFAULT NULL,
  `size_id`     INT UNSIGNED DEFAULT NULL,
  `promo_price` DECIMAL(8,2) NOT NULL,
  FOREIGN KEY (`promo_id`)   REFERENCES `promos`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`variety_id`) REFERENCES `product_varieties`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (`size_id`)    REFERENCES `size_options`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX `idx_promo_id`   (`promo_id`),
  INDEX `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 10. ORDERS ────────────────────────────────────────────────
--   order_date uses a computed DEFAULT only in MySQL 8.0.13+.
--   We store it as DATE and populate via application/trigger.
CREATE TABLE IF NOT EXISTS `orders` (
  `id`             INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  `order_number`   VARCHAR(20)   NOT NULL UNIQUE,
  `user_id`        INT UNSIGNED  DEFAULT NULL,
  `customer_name`  VARCHAR(120)  NOT NULL,
  `customer_phone` VARCHAR(20)   DEFAULT NULL,
  `status`         ENUM('pending','preparing','ready','completed','cancelled')
                                 NOT NULL DEFAULT 'pending',
  `payment_method` ENUM('cash','gcash') NOT NULL DEFAULT 'cash',
  `payment_status` ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
  `gcash_ref`      VARCHAR(50)   DEFAULT NULL,
  `gcash_receipt`  MEDIUMTEXT    DEFAULT NULL,   -- base64 receipt image from customer
  `subtotal`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `notes`          TEXT          DEFAULT NULL,
  `assigned_staff` INT UNSIGNED  DEFAULT NULL,
  `order_date`     DATE          NOT NULL,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`)        REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`assigned_staff`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_status`     (`status`),
  INDEX `idx_order_date` (`order_date`),
  INDEX `idx_order_num`  (`order_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 11. ORDER ITEMS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`           INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
  `order_id`     INT UNSIGNED     NOT NULL,
  `product_id`   INT UNSIGNED     DEFAULT NULL,
  `product_name` VARCHAR(120)     NOT NULL,
  `size_label`   VARCHAR(30)      DEFAULT NULL,
  `size_price`   DECIMAL(6,2)     NOT NULL DEFAULT 0.00,
  `ice_label`    VARCHAR(30)      DEFAULT NULL,
  `quantity`     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price`   DECIMAL(8,2)     NOT NULL,
  `line_total`   DECIMAL(10,2)    NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  INDEX `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 12. ORDER ITEM TOPPINGS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_item_toppings` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_item_id` INT UNSIGNED NOT NULL,
  `topping_name`  VARCHAR(80)  NOT NULL,
  `price`         DECIMAL(6,2) NOT NULL DEFAULT 15.00,
  FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 13. ORDER STATUS LOG ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_status_log` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_id`   INT UNSIGNED NOT NULL,
  `old_status` VARCHAR(20)  DEFAULT NULL,
  `new_status` VARCHAR(20)  NOT NULL,
  `changed_by` INT UNSIGNED DEFAULT NULL,
  `note`       TEXT         DEFAULT NULL,
  `changed_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`)   REFERENCES `orders`(`id`)  ON DELETE CASCADE,
  FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`)   ON DELETE SET NULL,
  INDEX `idx_order_id`  (`order_id`),
  INDEX `idx_changed_at`(`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 14. PAYMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `payments` (
  `id`           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  `order_id`     INT UNSIGNED  NOT NULL UNIQUE,
  `method`       ENUM('cash','gcash') NOT NULL,
  `amount_paid`  DECIMAL(10,2) NOT NULL,
  `change_given` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `gcash_number` VARCHAR(15)   DEFAULT NULL,
  `gcash_ref`    VARCHAR(50)   DEFAULT NULL,
  `verified_by`  INT UNSIGNED  DEFAULT NULL,
  `paid_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`)    REFERENCES `orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 15. SESSIONS (optional — for server-side session tracking) ─
CREATE TABLE IF NOT EXISTS `sessions` (
  `id`         VARCHAR(128) PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `ip_address` VARCHAR(45)  DEFAULT NULL,
  `expires_at` TIMESTAMP    NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_id`    (`user_id`),
  INDEX `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 16. SHOP SETTINGS (logo, gcash number, shop name) ────
-- Added in v6. Key-value store for admin-editable settings.
CREATE TABLE IF NOT EXISTS `shop_settings` (
  `key`        VARCHAR(60)   NOT NULL PRIMARY KEY,
  `value`      MEDIUMTEXT    DEFAULT NULL,
  `updated_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
               ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default shop settings (INSERT IGNORE — safe to re-run)
INSERT IGNORE INTO `shop_settings` (`key`, `value`) VALUES
  ('shop_name',    'FighTea Milk Tea Shop'),
  ('gcash_number', '09171234567'),
  ('logo_base64',  NULL);
