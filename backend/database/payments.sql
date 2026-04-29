-- ============================================================
-- FighTea — Payments Table
-- File: /database/payments.sql
-- Run AFTER schema.sql
-- ============================================================
USE `fightea_db`;

CREATE TABLE IF NOT EXISTS `payments` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_id`     INT UNSIGNED  NOT NULL UNIQUE,
  `method`       ENUM('cash','gcash') NOT NULL,
  `amount_due`   DECIMAL(10,2) NOT NULL,
  `amount_paid`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `change_given` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `gcash_number` VARCHAR(15)   DEFAULT NULL,
  `gcash_ref`    VARCHAR(60)   DEFAULT NULL,
  `status`       ENUM('pending','verified','failed','refunded') NOT NULL DEFAULT 'pending',
  `verified_by`  INT UNSIGNED  DEFAULT NULL,
  `paid_at`      TIMESTAMP     NULL DEFAULT NULL,
  `created_at`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`)    REFERENCES `orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`)  ON DELETE SET NULL,
  INDEX `idx_method`  (`method`),
  INDEX `idx_status`  (`status`),
  INDEX `idx_paid_at` (`paid_at`)
) ENGINE=InnoDB;
