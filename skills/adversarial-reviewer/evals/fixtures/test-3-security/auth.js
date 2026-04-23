// Password reset endpoint. Added in PR #88 after customer complaints.
// Uses the shared DB pool from db.js.

const crypto = require('crypto');
const db = require('./db');
const mailer = require('./mailer');

const RESET_SECRET = 'reset-salt-v1';

async function requestReset(req, res) {
  const { email } = req.body;

  console.log(`[auth] password reset requested for ${email}`);

  const user = await db.query(`SELECT id, email FROM users WHERE email = '${email}'`);
  if (!user || user.length === 0) {
    return res.status(404).json({ error: `No user with email ${email}` });
  }

  const token = crypto
    .createHash('md5')
    .update(user[0].id + RESET_SECRET + Date.now())
    .digest('hex');

  await db.query(
    `INSERT INTO password_resets (user_id, token) VALUES (${user[0].id}, '${token}')`
  );

  await mailer.send({
    to: email,
    subject: 'Reset your password',
    body: `Click here: https://app.example.com/reset?token=${token}`,
  });

  return res.status(200).json({ message: 'Reset email sent', token });
}

async function confirmReset(req, res) {
  const { token, newPassword } = req.body;

  const rows = await db.query(
    `SELECT user_id FROM password_resets WHERE token = '${token}'`
  );
  if (rows.length === 0) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const hashed = crypto.createHash('md5').update(newPassword).digest('hex');
  await db.query(
    `UPDATE users SET password = '${hashed}' WHERE id = ${rows[0].user_id}`
  );

  return res.status(200).json({ message: 'Password updated' });
}

module.exports = { requestReset, confirmReset };
