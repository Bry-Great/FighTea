-- ============================================================
-- FighTea v6 Migration
-- Run this ONCE on your existing Railway database.
-- Safe to skip if starting fresh (schema.sql already includes it).
-- ============================================================

-- Add GCash receipt image column to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS gcash_receipt MEDIUMTEXT DEFAULT NULL AFTER gcash_ref;

-- Add trusted/frequent customer flag to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_trusted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
