// Emergency recovery tool. Run this ON THE SERVER if the Owner is locked out:
//   npm run reset-owner-password
require('dotenv').config();
const readline = require('readline');
const { pool } = require('../db');
const { hashPassword } = require('../auth');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q) { return new Promise(resolve => rl.question(q, resolve)); }

(async () => {
  try {
    const owners = await pool.query("SELECT username, name FROM users WHERE role = 'owner'");
    if (owners.rows.length === 0) {
      console.log('No Owner account exists yet. Just visit the website to create one.');
      rl.close(); return;
    }
    console.log('Owner account(s):', owners.rows.map(o => o.username).join(', '));
    const username = await ask('Username to reset: ');
    const ownerRes = await pool.query(
      "SELECT * FROM users WHERE username = $1 AND role = 'owner'",
      [username.trim().toLowerCase()]
    );
    if (!ownerRes.rows[0]) { console.log('No Owner with that username.'); rl.close(); return; }
    const newPassword = await ask('New password (min 8 characters): ');
    if (!newPassword || newPassword.length < 8) { console.log('Password too short. Aborted.'); rl.close(); return; }
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(newPassword), ownerRes.rows[0].id]);
    console.log(`Password updated for ${ownerRes.rows[0].username}.`);
  } finally {
    rl.close();
    await pool.end();
  }
})();
