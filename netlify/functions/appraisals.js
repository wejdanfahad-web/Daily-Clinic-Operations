// Annual appraisal progress.
// GET  /api/appraisals?year=2026   CIC: everyone · staff: only their own row
// POST /api/appraisals { staff_id, year, step_no, done: true }   CIC
const { query, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireUser, requireCic, riyadhToday } = require('./lib/http');

exports.handler = handler(['GET', 'POST'], async (event) => {
  if (event.httpMethod === 'GET') {
    const user = requireUser(event);
    const year = Number((event.queryStringParameters || {}).year) || Number(riyadhToday().slice(0, 4));
    const own = user.role !== 'ADMIN';
    const [steps, rows] = await Promise.all([
      query(`SELECT step_no, step_name, TO_CHAR(due_date, 'YYYY-MM-DD') AS due_date FROM appraisal_steps WHERE appraisal_year = :y ORDER BY step_no`, { y: year }),
      query(`
        SELECT staff_id, staff_name, step_no, is_done, status, TO_CHAR(done_on, 'YYYY-MM-DD') AS done_on
          FROM v_appraisal_status
         WHERE appraisal_year = :y ${own ? 'AND staff_id = :sid' : ''}
         ORDER BY staff_name, step_no`, own ? { y: year, sid: user.sid } : { y: year }),
    ]);
    return json(200, { year, steps, rows });
  }

  const user = requireCic(event);
  const { staff_id, year, step_no, done } = parseBody(event);
  const sid = Number(staff_id), y = Number(year), step = Number(step_no);
  if (!sid || !y || !step) throw new HttpError(400, 'staff_id, year and step_no are required.');

  await exec(`
    BEGIN
      MERGE INTO staff_appraisals t
      USING (SELECT :sid AS staff_id, :y AS appraisal_year, :st AS step_no FROM dual) s
         ON (t.staff_id = s.staff_id AND t.appraisal_year = s.appraisal_year AND t.step_no = s.step_no)
      WHEN MATCHED THEN UPDATE SET is_done = :f, done_on = CASE WHEN :f = 'Y' THEN TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Riyadh' AS DATE)) END,
                                   marked_by = :by, marked_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (staff_id, appraisal_year, step_no, is_done, done_on, marked_by, marked_at)
                            VALUES (s.staff_id, s.appraisal_year, s.step_no, :f,
                                    CASE WHEN :f = 'Y' THEN TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Riyadh' AS DATE)) END, :by, SYSTIMESTAMP);
      COMMIT;
    END;`, { sid, y, st: step, f: done ? 'Y' : 'N', by: user.sid });
  return json(200, { ok: true });
});
