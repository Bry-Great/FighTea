-- ============================================================
-- FighTea — Default Admin Account
-- File: /backend/database/users.sql
-- Run AFTER schema.sql
--
-- IMPORTANT: Replace the hash below with a real bcrypt hash
-- before going live. See README.md for instructions.
--
-- INSERT IGNORE prevents duplicate entry errors if re-run.
-- ============================================================
USE `fightea_db`;

INSERT IGNORE INTO `users`
  (`full_name`, `email`, `phone`, `password_hash`, `role`)
VALUES (
  'FighTea Admin',
  'admin@fightea.com',
  NULL,
  '$2b$12$AaDyRpFs.0H90hjTVGhRCOQytdPcbN4TDo7NxWkqYCKHQ2n3cgP/6',
  'admin'
);

-- ─── HOW TO GENERATE A REAL HASH ─────────────────────────────
-- Run this once in Node.js before importing this file:
--
--   node -e "require('bcrypt').hash('YourPassword',12).then(h=>console.log(h))"
--
-- Copy the printed hash and replace the placeholder above.
-- Then run:  mysql -u root -p fightea_db < backend/database/users.sql
-- ─────────────────────────────────────────────────────────────
