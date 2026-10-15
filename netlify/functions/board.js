// GET /api/board?date=YYYY-MM-DD — the day's current assignments (public, read-only).
// Add &live=1 when signed in to skip the 60-second CDN cache (used right after edits).
const { query } = require('./lib/db');
const { handler, json, cachedJson, HttpError, isIsoDate, riyadhToday, requireUser } = require('./lib/http');

exports.handler = handler(['GET'], async (event) => {
  const q = event.queryStringParameters || {};
  const date = q.date || riyadhToday();
  if (!isIsoDate(date)) throw new HttpError(400, 'Date must be YYYY-MM-DD.');
  const live = q.live === '1';
  if (live) requireUser(event);

  const rows = await query(`
    SELECT log_id, assignment_group_id, action, session_code, staff_id, staff_name, doctor_id, doctor_name,
           doctor_category, clinic_id, type_code, type_name, category, notes,
           TO_CHAR(recorded_at_riyadh, 'YYYY-MM-DD HH24:MI') AS recorded_at
      FROM v_assignments_current
     WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD')
     ORDER BY session_code, clinic_id NULLS LAST, staff_name`, { d: date });

  const body = { date, assignments: rows };
  return live ? json(200, body) : cachedJson(body, 60);
});
