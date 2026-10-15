// Workload & rotations (CIC).
// GET /api/workload?quarter=2026-10-01                        → quarterly workload + rest per staff
// GET /api/workload?view=surgeries&from=YYYY-MM-DD&to=YYYY-MM-DD[&staff_id=]
//                                                              → every surgery (one row per surgery, both doctors)
const { query } = require('./lib/db');
const { handler, json, HttpError, requireCic, isIsoDate, riyadhToday } = require('./lib/http');

exports.handler = handler(['GET'], async (event) => {
  requireCic(event);
  const q = event.queryStringParameters || {};

  if (q.view === 'surgeries') {
    const from = q.from || '2000-01-01', to = q.to || '2100-12-31';
    if (!isIsoDate(from) || !isIsoDate(to)) throw new HttpError(400, 'Dates must be YYYY-MM-DD.');
    const sid = q.staff_id ? Number(q.staff_id) : null;
    const [rows, totals] = await Promise.all([
      query(`
        SELECT TO_CHAR(c.work_date, 'YYYY-MM-DD') AS work_date, c.session_code, c.assignment_group_id,
               c.staff_id, c.staff_name,
               LISTAGG(c.doctor_name, ' + ') WITHIN GROUP (ORDER BY c.log_id) AS doctors,
               MAX(b.note) AS note,
               MAX(sd.display_name) AS supervisor,
               MIN(c.recorded_by) AS recorded_by,
               TO_CHAR(MIN(c.recorded_at_riyadh), 'YYYY-MM-DD HH24:MI') AS recorded_at
          FROM v_assignments_current c
          LEFT JOIN surgery_bookings b ON b.assignment_log_id = c.log_id
          LEFT JOIN doctors sd ON sd.doctor_id = b.supervisor_doctor_id
         WHERE c.type_code = 'SURGERY'
           AND c.work_date BETWEEN TO_DATE(:f, 'YYYY-MM-DD') AND TO_DATE(:t, 'YYYY-MM-DD')
           AND (:sid IS NULL OR c.staff_id = :sid)
         GROUP BY c.work_date, c.session_code, c.assignment_group_id, c.staff_id, c.staff_name
         ORDER BY c.work_date DESC, c.session_code DESC`, { f: from, t: to, sid }, { limit: 5000 }),
      query(`
        SELECT staff_id, staff_name, total_surgery_count, TO_CHAR(last_assigned_surgery_date, 'YYYY-MM-DD') AS last_surgery,
               is_eligible, ineligible_reason, queue_position
          FROM surgery_queue ORDER BY is_eligible DESC, queue_position NULLS LAST, staff_name`),
    ]);
    return json(200, { from, to, surgeries: rows, totals });
  }

  const today = riyadhToday();
  const quarter = q.quarter || `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  if (!isIsoDate(quarter)) throw new HttpError(400, 'quarter must be YYYY-MM-DD.');
  const [rows, quarters] = await Promise.all([
    query(`
      SELECT w.staff_id, w.staff_name, w.sessions_available, w.workload_points, w.load_per_session,
             w.multi_clinic_sessions, w.annual_leave_days, w.excuses, w.sick_sessions, w.appointments
        FROM v_staff_workload_quarter w JOIN staff s ON s.staff_id = w.staff_id
       WHERE w.quarter_start = TO_DATE(:q, 'YYYY-MM-DD') AND s.app_role <> 'ADMIN'
       ORDER BY w.load_per_session DESC NULLS LAST`, { q: quarter }),
    query(`SELECT DISTINCT TO_CHAR(TRUNC(work_date, 'Q'), 'YYYY-MM-DD') AS q FROM assignment_logs ORDER BY 1 DESC`),
  ]);
  return json(200, { quarter, rows, quarters: quarters.map((r) => r.q) });
});
