// ============================================================
// FighTea — Settings Controller  v6
// Handles: shop logo upload, GCash number, shop name
// Logo stored as base64 TEXT in the settings table.
// ============================================================
'use strict';

const db = require('../config/db');

// GET /api/settings
async function getSettings(req, res) {
  try {
    const [rows] = await db.query('SELECT `key`, `value` FROM shop_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    // Never send logo in GET /settings — it's large; use /api/settings/logo separately
    delete settings.logo_base64;
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/settings/logo  — returns just the logo data URL
async function getLogo(req, res) {
  try {
    const [[row]] = await db.query(
      'SELECT `value` FROM shop_settings WHERE `key` = "logo_base64"'
    );
    if (!row || !row.value) return res.json({ logo: null });
    res.json({ logo: row.value });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/settings  — upsert any setting key/value pairs (admin only)
async function updateSettings(req, res) {
  try {
    const allowed = ['shop_name', 'gcash_number', 'logo_base64'];
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      if (!allowed.includes(key)) continue;
      await db.query(
        'INSERT INTO shop_settings (`key`, `value`) VALUES (?, ?) ' +
        'ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, value]
      );
    }
    res.json({ message: 'Settings saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { getSettings, getLogo, updateSettings };
