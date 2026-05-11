// ============================================================
// FighTea — User Controller
// File: /backend/controllers/userController.js
// ============================================================
'use strict';

const bcrypt = require('bcrypt');
const db     = require('../config/db');

async function getUsers(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT id, full_name AS name, email, phone, role, is_active, is_trusted, created_at FROM users ORDER BY id'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function createUser(req, res) {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required.' });
    const hash = await bcrypt.hash(password, 12);
    await db.query(
      'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), phone || null, hash, role || 'customer']
    );
    res.status(201).json({ message: 'User created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists.' });
    res.status(500).json({ error: err.message });
  }
}

async function updateUser(req, res) {
  try {
    const { name, email, phone, role, password } = req.body;
  const isTrusted = req.body.is_trusted !== undefined ? (req.body.is_trusted ? 1 : 0) : undefined;
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await db.query(
        'UPDATE users SET full_name=?, email=?, phone=?, role=?, password_hash=?' +
        (isTrusted !== undefined ? ', is_trusted=?' : '') + ' WHERE id=?',
        isTrusted !== undefined
          ? [name?.trim(), email?.trim().toLowerCase(), phone || null, role, hash, isTrusted, req.params.id]
          : [name?.trim(), email?.trim().toLowerCase(), phone || null, role, hash, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE users SET full_name=?, email=?, phone=?, role=?' +
        (isTrusted !== undefined ? ', is_trusted=?' : '') + ' WHERE id=?',
        isTrusted !== undefined
          ? [name?.trim(), email?.trim().toLowerCase(), phone || null, role, isTrusted, req.params.id]
          : [name?.trim(), email?.trim().toLowerCase(), phone || null, role, req.params.id]
      );
    }
    res.json({ message: 'User updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function deleteUser(req, res) {
  try {
    const [[u]] = await db.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    if (u.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin accounts.' });
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { getUsers, createUser, updateUser, deleteUser };
