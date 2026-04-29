// ============================================================
// FighTea — Auth Controller  v6
// Strict full-email matching (no partial/prefix match).
// Login compares exact email string, lowercase-normalized.
// ============================================================
'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const SALT_ROUNDS = 12;
const TOKEN_TTL   = '8h';

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    // Strict exact-match on the full email string (lowercased both sides)
    const normalizedEmail = email.trim().toLowerCase();

    const [[user]] = await db.query(
      'SELECT * FROM users WHERE LOWER(email) = ? AND is_active = 1',
      [normalizedEmail]
    );

    if (!user) {
      // Constant-time guard — prevents email enumeration via timing
      await bcrypt.hash('guard', 10);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch)
      return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign(
      { id: user.id, name: user.full_name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    res.json({
      token,
      user: {
        id:    user.id,
        name:  user.full_name,
        email: user.email,
        role:  user.role,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const normalizedEmail = email.trim().toLowerCase();

    // Check for exact duplicate
    const [[existing]] = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]
    );
    if (existing)
      return res.status(409).json({ error: 'Email already registered.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.query(
      'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, "customer")',
      [name.trim(), normalizedEmail, phone || null, hash]
    );
    res.status(201).json({ message: 'Account created successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Email already registered.' });
    console.error('register error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
}

// GET /api/auth/me
async function me(req, res) {
  try {
    const [[user]] = await db.query(
      'SELECT id, full_name AS name, email, phone, role FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
}

module.exports = { login, register, me };
