// POST /api/bootstrap  { token, employee_no, password }
// One-time setup of the CIC login. Works only while BOOTSTRAP_TOKEN is set in Netlify AND the
// CIC account has no password yet. Remove BOOTSTRAP_TOKEN afterwards.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { one, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError } = require('./lib/http');

exports.handler = handler(['POST'], async (event) => {
  const expected = process.env.BOOTSTRAP_TOKEN;
  if (!expected) throw new HttpError(404, 'Not found.');
  const { token, employee_no, password } = parseBody(event);
  const a = Buffer.from(String(token || '')), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Wrong setup token.');

  const empNo = String(employee_no || '').trim();
  const pw = String(password || '');
  if (!empNo) throw new HttpError(400, 'Enter your staff ID.');
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new HttpError(400, 'Password: at least 8 characters with letters and numbers.');

  const cic = await one(`SELECT staff_id, password_hash FROM staff WHERE app_role = 'ADMIN' ORDER BY staff_id FETCH FIRST 1 ROWS ONLY`);
  if (!cic) throw new HttpError(500, 'No CIC account found in the database.');
  if (cic.password_hash) throw new HttpError(409, 'The CIC account is already set up. Remove BOOTSTRAP_TOKEN from Netlify.');

  const hash = await bcrypt.hash(pw, 10);
  await exec(`BEGIN UPDATE staff SET employee_no = :e, password_hash = :h, must_change_pw = 'N' WHERE staff_id = :sid; COMMIT; END;`,
    { e: empNo, h: hash, sid: cic.staff_id });
  return json(200, { ok: true, message: 'CIC login created. You can now sign in. Remove BOOTSTRAP_TOKEN from Netlify.' });
});
