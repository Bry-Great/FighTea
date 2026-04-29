// ============================================================
// FighTea — Database Connection Pool  v6
// Supports Railway (requires SSL) and local MySQL (no SSL).
// Set DB_SSL=true in Railway environment variables.
// ============================================================
'use strict';

const mysql = require('mysql2/promise');

const useSSL = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production';

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASS     || '',
  database:           process.env.DB_NAME     || 'fightea_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+08:00',
  charset:            'utf8mb4',
  // SSL required for Railway and most hosted MySQL providers
  ...(useSSL ? {
    ssl: {
      rejectUnauthorized: false,   // Railway uses self-signed cert
    },
  } : {}),
});

// Verify connection on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected:', process.env.DB_NAME || 'fightea_db',
                useSSL ? '(SSL enabled)' : '(no SSL)');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    // Don't exit — let Vercel retry on next request
  }
})();

module.exports = pool;
