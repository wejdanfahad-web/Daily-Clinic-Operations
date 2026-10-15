// POST /api/login  { employee_no, password }
// 5 wrong passwords lock the account for 15 minutes.
const bcrypt = require('bcryptjs');
const { one, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, signSession, sessionCookie } = require('./lib/http');

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

exports.handler = handler(['POST'], async (event) => {
  const { employee_no, password } = parseBody(event);
  const empNo = String(employee_no || '').trim();
  if (!empNo || !password) throw new HttpError(400, 'Enter your staff ID and password.');

  const u = await one(`
    SELECT staff_id, display_name, app_role, password_hash, must_change_pw, failed_logins, employment_status,
           CASE WHEN locked_until > SYSTIMESTAMP THEN 'Y' ELSE 'N' END AS is_locked,
           CEIL((CAST(locked_until AS DATE) - CAST(SYSTIMESTAMP AS DATE)) * 1440) AS lock_minutes_left
      FROM staff WHERE UPPER(employee_no) = UPPER(:e)`, { e: empNo });

  const generic = 'Staff ID or password is not correct.';
  if (!u || !u.password_hash || u.employment_status === 'INACTIVE') {
    await bcrypt.compare(String(password), DUMMY_HASH); // same timing either way
    throw new HttpError(401, generic);
  }
  if (u.is_locked === 'Y') throw new HttpError(423, `Too many wrong attempts. Try again in ${Math.max(1, Number(u.lock_minutes_left))} minute(s) or ask the CIC to reset your password.`);

  const ok = await bcrypt.compare(String(password), u.password_hash);
  if (!ok) {
    await exec(`
      BEGIN
        UPDATE staff SET failed_logins = failed_logins + 1,
               locked_until = CASE WHEN failed_logins + 1 >= :mx THEN SYSTIMESTAMP + NUMTODSINTERVAL(:lm, 'MINUTE') END
         WHERE staff_id = :sid;
        COMMIT;
      END;`, { sid: u.staff_id, mx: MAX_TRIES, lm: LOCK_MINUTES });
    const left = MAX_TRIES - (Number(u.failed_logins) + 1);
    throw new HttpError(401, left > 0 ? `${generic} ${left} attempt(s) left.` : `Too many wrong attempts. Locked for ${LOCK_MINUTES} minutes.`);
  }

  await exec(`BEGIN UPDATE staff SET failed_logins = 0, locked_until = NULL, last_login_at = SYSTIMESTAMP WHERE staff_id = :sid; COMMIT; END;`, { sid: u.staff_id });

  const session = { sid: Number(u.staff_id), name: u.display_name, role: u.app_role, mustChange: u.must_change_pw === 'Y' };
  return json(200, { user: session }, { 'Set-Cookie': sessionCookie(signSession(session)) });
});
