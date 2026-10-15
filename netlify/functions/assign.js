// POST /api/assign — record assignments (CIC any day; the staff member in charge: today only).
// {
//   work_date: "2026-10-18",
//   client_request_id: "uuid",               // optional; resubmitting the same id is ignored
//   entries: [
//     { session: "AM", staff_id: 5, type_code: "CLINIC", doctor_ids: [12], clinic_id: 9, notes: "" },
//     { session: "AM", staff_id: 7, type_code: "SURGERY", doctor_ids: [3, 8] },     // 2 doctors = 1 surgery
//     { session: "PM", staff_id: 5, type_code: "CLINIC", doctor_ids: [14], supersedes_log_id: 881, action: "AMEND" },
//     { session: "PM", staff_id: 6, type_code: "VITALS", supersedes_log_id: 882, action: "CANCEL" }
//   ]
// }
// Nothing is ever overwritten: a change is a new AMEND/CANCEL row pointing at the row it replaces.
const crypto = require('crypto');
const { query, exec } = require('./lib/db');
const { notifyStaff } = require('./lib/push');
const { handler, json, parseBody, HttpError, isIsoDate, riyadhToday, requireCicOrInCharge } = require('./lib/http');

const MAX_ENTRIES = 200;

exports.handler = handler(['POST'], async (event) => {
  const user = await requireCicOrInCharge(event);
  const { work_date, entries, client_request_id } = parseBody(event);

  if (!isIsoDate(work_date)) throw new HttpError(400, 'work_date must be YYYY-MM-DD.');
  if (!Array.isArray(entries) || !entries.length) throw new HttpError(400, 'Nothing to record.');
  if (entries.length > MAX_ENTRIES) throw new HttpError(400, `Too many entries in one save (max ${MAX_ENTRIES}).`);
  const today = riyadhToday();
  if (user.inCharge && work_date !== today) throw new HttpError(403, 'The staff member in charge can only change today\'s assignments.');

  const types = await query(`SELECT type_code, needs_doctor, notify_on_assign, type_name FROM assignment_types WHERE is_active = 'Y'`);
  const typeMap = Object.fromEntries(types.map((t) => [t.type_code, t]));

  const crid = String(client_request_id || crypto.randomUUID()).slice(0, 50);
  const binds = { wd: work_date, by: `${user.name} (#${user.sid})${user.inCharge ? ' in charge' : ''}` };
  const lines = [];

  entries.forEach((e, i) => {
    const session = String(e.session || '').toUpperCase();
    if (!['AM', 'PM', 'DAY'].includes(session)) throw new HttpError(400, `Entry ${i + 1}: session must be AM, PM or DAY.`);
    const t = typeMap[e.type_code];
    if (!t) throw new HttpError(400, `Entry ${i + 1}: unknown assignment type "${e.type_code}".`);
    const action = (e.action || (e.supersedes_log_id ? 'AMEND' : 'ASSIGN')).toUpperCase();
    if (!['ASSIGN', 'AMEND', 'CANCEL'].includes(action)) throw new HttpError(400, `Entry ${i + 1}: bad action.`);
    if (action !== 'ASSIGN' && !e.supersedes_log_id) throw new HttpError(400, `Entry ${i + 1}: a change must say which row it replaces.`);
    if (!Number(e.staff_id)) throw new HttpError(400, `Entry ${i + 1}: staff is required.`);

    let doctors = Array.isArray(e.doctor_ids) ? e.doctor_ids.map(Number).filter(Boolean) : [];
    if (t.needs_doctor === 'Y' && !doctors.length && action !== 'CANCEL') throw new HttpError(400, `Entry ${i + 1}: ${t.type_name} needs a doctor.`);
    if (doctors.length > 3) throw new HttpError(400, `Entry ${i + 1}: at most 3 doctors per entry.`);
    if (!doctors.length) doctors = [null];
    if (action !== 'ASSIGN' && doctors.length > 1) throw new HttpError(400, `Entry ${i + 1}: change one row at a time.`);

    const p = `e${i}_`;
    binds[p + 's'] = session;
    binds[p + 'st'] = Number(e.staff_id);
    binds[p + 't'] = e.type_code;
    binds[p + 'c'] = e.clinic_id ? Number(e.clinic_id) : null;
    binds[p + 'n'] = e.notes ? String(e.notes).slice(0, 400) : null;
    binds[p + 'a'] = action;
    binds[p + 'sup'] = e.supersedes_log_id ? Number(e.supersedes_log_id) : null;

    lines.push(`  l_grp := assignment_group_seq.NEXTVAL;`);
    doctors.forEach((d, j) => {
      binds[`${p}d${j}`] = d;
      binds[`${p}r${j}`] = `${crid}:${i}:${j}`;
      lines.push(`  INSERT INTO assignment_logs (assignment_group_id, action, supersedes_log_id, work_date, session_code, staff_id,
                                 doctor_id, clinic_id, type_code, notes, recorded_by, client_request_id)
  VALUES (l_grp, :${p}a, :${p}sup, TO_DATE(:wd, 'YYYY-MM-DD'), :${p}s, :${p}st,
          :${p}d${j}, :${p}c, :${p}t, :${p}n, :by, :${p}r${j});`);
    });
  });

  await exec(`
DECLARE
  l_grp NUMBER;
BEGIN
${lines.join('\n')}
  COMMIT;
EXCEPTION
  WHEN DUP_VAL_ON_INDEX THEN
    ROLLBACK;
    RAISE_APPLICATION_ERROR(-20050, 'This save was already recorded, or one of the rows was already changed by someone else. Refresh and try again.');
END;`, binds);

  // Read back what was written (for the UI and notifications).
  const written = await query(`
    SELECT log_id, action, session_code, staff_id, staff_name, doctor_name, clinic_id, type_code, type_name
      FROM v_assignment_history
     WHERE log_id IN (SELECT log_id FROM assignment_logs WHERE client_request_id LIKE :pfx)
     ORDER BY log_id`, { pfx: crid + ':%' });

  // Notify: types flagged notify_on_assign (e.g. In charge), and any change to today/tomorrow.
  const soon = work_date === today || work_date === riyadhToday(1);
  const notified = [];
  for (const w of written) {
    const t = typeMap[w.type_code];
    const isChange = w.action !== 'ASSIGN';
    if (!(t && t.notify_on_assign === 'Y') && !(isChange && soon)) continue;
    const what = w.action === 'CANCEL' ? 'cancelled' : `${w.type_name}${w.doctor_name ? ' with ' + w.doctor_name : ''}${w.clinic_id ? ' · Clinic ' + w.clinic_id : ''}`;
    const r = await notifyStaff(w.staff_id, {
      eventType: t && t.notify_on_assign === 'Y' && !isChange ? (w.type_code === 'IN_CHARGE' ? 'IN_CHARGE' : 'SCHEDULE_CHANGE') : 'SCHEDULE_CHANGE',
      title: isChange ? 'Your schedule changed' : 'New assignment',
      body: `${work_date} ${w.session_code}: ${what}`,
      url: `/?date=${work_date}`,
      dedupeKey: `ASG:${w.log_id}`,
      assignmentLogId: w.log_id,
    });
    notified.push({ log_id: w.log_id, status: r.status });
  }

  return json(200, { ok: true, client_request_id: crid, written, notified });
});
