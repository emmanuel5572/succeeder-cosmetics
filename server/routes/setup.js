const express = require('express');
const router = express.Router();
const { pool, getSetting, setSetting, logAction } = require('../db');
const { hashPassword, signToken, setSessionCookie } = require('../auth');

async function ownerExists() {
  const res = await pool.query("SELECT COUNT(*) as c FROM users WHERE role = 'owner'");
  return parseInt(res.rows[0].c, 10) > 0;
}

router.get('/status', async (req, res, next) => {
  try {
    res.json({
      setupComplete: await ownerExists(),
      businessName: (await getSetting('business_name')) || 'SUCCEEDER COSMETICS'
    });
  } catch (e) { next(e); }
});

router.post('/owner', async (req, res, next) => {
  const { name, username, email, password, businessName } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const check = await client.query("SELECT COUNT(*) as c FROM users WHERE role = 'owner'");
    if (parseInt(check.rows[0].c, 10) > 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Owner setup has already been completed.' });
    }

    const password_hash = hashPassword(password);
    const result = await client.query(
      `INSERT INTO users (name, username, email, password_hash, role, permissions, active)
       VALUES ($1, $2, $3, $4, 'owner', '[]', 1) RETURNING *`,
      [name, username.trim().toLowerCase(), email || null, password_hash]
    );
    const user = result.rows[0];

    await client.query('COMMIT');

    await setSetting('business_name', businessName || 'SUCCEEDER COSMETICS');
    await setSetting('setup_complete', 'true');
    await logAction(user.id, 'owner_account_created', { username });

    const token = signToken(user);
    setSessionCookie(res, token);

    res.status(201).json({ id: user.id, name: user.name, username: user.username, role: user.role });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
