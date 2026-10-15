// CIC only.
// GET  /api/staff-admin                      → all staff with login status
// POST /api/staff-admin { staff_id, employee_no }  → set staff ID + issue a temporary password
//      (shown once to the CIC; the staff member must change it at first sign-in)
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, one, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireCic } = require('./lib/http');

function tempPassword() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  for (let i = 0; i < 3; i++) s += digits[crypto.randomInt(digits.length)];
  return s;
}

exports.handler = handler(['GET', 'POST'], async (event) => {
  requireCic(event);
  if (event.httpMethod === 'GET') {
    const rows = await query(`
      SELECT staff_id, display_name, employee_no, staff_type, home_clinic_id, employment_status, app_role,
             CASE WHEN password_hash IS NULL THEN 'NOT_SET' WHEN must_change_pw = 'Y' THEN 'TEMPORARY'
                  WHEN locked_until > SYSTIMESTAMP THEN 'LOCKED' ELSE 'ACTIVE' END AS login_status,
             TO_CHAR(CAST(last_login_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS last_login,
             (SELECT COUNT(*) FROM push_subscriptions p WHERE p.staff_id = s.staff_id AND p.is_active = 'Y') AS devices
        FROM staff s ORDER BY app_role DESC, display_name`);
    return json(200, { staff: rows });
  }

  const { staff_id, employee_no } = parseBody(event);
  const sid = Number(staff_id);
  const empNo = String(employee_no || '').trim();
  if (!sid || !empNo) throw new HttpError(400, 'Choose the staff member and enter their staff ID.');
  const taken = await one('SELECT staff_id FROM staff WHERE UPPER(employee_no) = UPPER(:e) AND staff_id <> :sid', { e: empNo, sid });
  if (taken) throw new HttpError(409, 'That staff ID is already used by someone else.');

  const temp = tempPassword();
  const hash = await bcrypt.hash(temp, 10);
  await exec(`
    BEGIN
      UPDATE staff SET employee_no = :e, password_hash = :h, must_change_pw = 'Y', failed_logins = 0, locked_until = NULL
       WHERE staff_id = :sid;
      IF SQL%ROWCOUNT = 0 THEN RAISE_APPLICATION_ERROR(-20001, 'Staff member not found.'); END IF;
      COMMIT;
    END;`, { e: empNo, h: hash, sid });
  return json(200, { ok: true, temporary_password: temp, note: 'Give this to the staff member. It works once; they must set their own password at first sign-in.' });
});
