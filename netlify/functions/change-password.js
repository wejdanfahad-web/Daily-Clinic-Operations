// POST /api/change-password  { current_password, new_password }
// Required on first sign-in with a temporary password.
const bcrypt = require('bcryptjs');
const { one, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireUser, signSession, sessionCookie } = require('./lib/http');

exports.handler = handler(['POST'], async (event) => {
  const s = requireUser(event, { allowMustChange: true });
  const { current_password, new_password } = parseBody(event);
  const pw = String(new_password || '');
  if (pw.length < 8) throw new HttpError(400, 'The new password must be at least 8 characters.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new HttpError(400, 'Use both letters and numbers in the new password.');
  if (pw === current_password) throw new HttpError(400, 'The new password must be different from the old one.');

  const u = await one('SELECT password_hash FROM staff WHERE staff_id = :sid', { sid: s.sid });
  if (!u || !(await bcrypt.compare(String(current_password || ''), u.password_hash || ''))) throw new HttpError(401, 'Your current password is not correct.');

  const hash = await bcrypt.hash(pw, 10);
  await exec(`BEGIN UPDATE staff SET password_hash = :h, must_change_pw = 'N', failed_logins = 0, locked_until = NULL WHERE staff_id = :sid; COMMIT; END;`, { h: hash, sid: s.sid });

  const session = { sid: s.sid, name: s.name, role: s.role, mustChange: false };
  return json(200, { user: session }, { 'Set-Cookie': sessionCookie(signSession(session)) });
});
