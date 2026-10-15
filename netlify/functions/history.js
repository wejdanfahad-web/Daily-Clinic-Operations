// GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD[&staff_id=] — full audit trail incl. amended/cancelled rows (CIC).
const { query } = require('./lib/db');
const { handler, json, HttpError, isIsoDate, requireCic, riyadhToday } = require('./lib/http');

exports.handler = handler(['GET'], async (event) => {
  requireCic(event);
  const q = event.queryStringParameters || {};
  const from = q.from || riyadhToday(-30), to = q.to || riyadhToday();
  if (!isIsoDate(from) || !isIsoDate(to)) throw new HttpError(400, 'Dates must be YYYY-MM-DD.');
  const rows = await query(`
    SELECT log_id, assignment_group_id, action, supersedes_log_id, TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date,
           session_code, staff_name, doctor_name, clinic_id, type_name, notes, recorded_by,
           TO_CHAR(recorded_at_riyadh, 'YYYY-MM-DD HH24:MI') AS recorded_at
      FROM v_assignment_history
     WHERE work_date BETWEEN TO_DATE(:f, 'YYYY-MM-DD') AND TO_DATE(:t, 'YYYY-MM-DD')
       AND (:sid IS NULL OR staff_id = :sid)
     ORDER BY recorded_at DESC`, { f: from, t: to, sid: q.staff_id ? Number(q.staff_id) : null }, { limit: 5000 });
  return json(200, { from, to, rows });
});
