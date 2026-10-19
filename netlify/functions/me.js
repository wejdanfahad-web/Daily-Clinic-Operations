// GET /api/me — who is signed in, and whether they are "In charge" right now.
const { one } = require('./lib/db');
const { handler, json, readSession } = require('./lib/http');

exports.handler = handler(['GET'], async (event) => {
  const s = readSession(event);
  if (!s) return json(200, { user: null });
  const ic = await one(`SELECT (SELECT session_code FROM v_active_in_charge WHERE staff_id = :sid FETCH FIRST 1 ROWS ONLY) AS session_code,
                               (SELECT home_clinic_id FROM staff WHERE staff_id = :sid) AS home_clinic_id FROM dual`, { sid: s.sid });
  return json(200, { user: { ...s, acting: !!s.acting, inCharge: !!(ic && ic.session_code), inChargeSession: ic ? ic.session_code : null, homeClinic: ic && ic.home_clinic_id ? Number(ic.home_clinic_id) : null } });
});
