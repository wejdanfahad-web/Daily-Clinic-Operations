// Daily checklists compliance — monthly boxes per clinic, ticked by the CIC.
// GET  /api/compliance?year=2026            signed-in staff + CIC
// POST /api/compliance { clinic_id, checklist_type: "EQUIPMENT"|"DISINFECTION", month: "2026-10", checked: true }   CIC
const { query, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireUser, requireCic, riyadhToday } = require('./lib/http');

const TYPES = ['EQUIPMENT', 'DISINFECTION'];

exports.handler = handler(['GET', 'POST'], async (event) => {
  if (event.httpMethod === 'GET') {
    requireUser(event);
    const year = Number((event.queryStringParameters || {}).year) || Number(riyadhToday().slice(0, 4));
    const [clinics, rows] = await Promise.all([
      query(`SELECT clinic_id, clinic_name FROM clinics WHERE is_active = 'Y' ORDER BY clinic_id`),
      query(`
        SELECT clinic_id, checklist_type, TO_CHAR(period_start, 'YYYY-MM') AS month, is_submitted,
               TO_CHAR(CAST(submitted_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS checked_at
          FROM clinic_checklists
         WHERE period_type = 'MONTH' AND EXTRACT(YEAR FROM period_start) = :y`, { y: year }),
    ]);
    return json(200, { year, clinics, rows });
  }

  const user = requireCic(event);
  const { clinic_id, checklist_type, month, checked } = parseBody(event);
  const cid = Number(clinic_id);
  const type = String(checklist_type || '').toUpperCase();
  if (!cid) throw new HttpError(400, 'clinic_id is required.');
  if (!TYPES.includes(type)) throw new HttpError(400, 'checklist_type must be EQUIPMENT or DISINFECTION.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new HttpError(400, 'month must be YYYY-MM.');
  if (month > riyadhToday().slice(0, 7)) throw new HttpError(400, 'You can\'t tick a month that hasn\'t started yet.');

  await exec(`
    BEGIN
      MERGE INTO clinic_checklists t
      USING (SELECT :cid AS clinic_id, :ty AS checklist_type, TO_DATE(:m || '-01', 'YYYY-MM-DD') AS period_start FROM dual) s
         ON (t.clinic_id = s.clinic_id AND t.checklist_type = s.checklist_type AND t.period_type = 'MONTH' AND t.period_start = s.period_start)
      WHEN MATCHED THEN UPDATE SET is_submitted = :f, submitted_by = :by, submitted_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (clinic_id, checklist_type, period_type, period_start, is_submitted, submitted_by, submitted_at)
                            VALUES (s.clinic_id, s.checklist_type, 'MONTH', s.period_start, :f, :by, SYSTIMESTAMP);
      COMMIT;
    END;`, { cid, ty: type, m: month, f: checked ? 'Y' : 'N', by: user.sid });
  return json(200, { ok: true });
});
