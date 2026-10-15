// Shared writer for ASSIGNMENT_LOGS, used by /api/assign (single edits) and /api/planner (publish a day).
// Entries: { session: AM|PM|DAY, staff_id, type_code, doctor_ids[], clinic_id, notes, supersedes_log_id | supersedes_log_ids[] (one per doctor), action }
// Nothing is ever overwritten: a change is a new AMEND/CANCEL row pointing at the row it replaces.
const crypto = require('crypto');
const { query, exec } = require('./db');
const { HttpError } = require('./http');

const MAX_ENTRIES = 300;

async function assignmentTypes() {
  const types = await query(`SELECT type_code, needs_doctor, notify_on_assign, type_name, category FROM assignment_types WHERE is_active = 'Y'`);
  return Object.fromEntries(types.map((t) => [t.type_code, t]));
}

async function writeEntries({ workDate, entries, recordedBy, clientRequestId, typeMap }) {
  if (!Array.isArray(entries) || !entries.length) throw new HttpError(400, 'Nothing to record.');
  if (entries.length > MAX_ENTRIES) throw new HttpError(400, `Too many entries in one save (max ${MAX_ENTRIES}).`);
  typeMap = typeMap || (await assignmentTypes());

  const crid = String(clientRequestId || crypto.randomUUID()).slice(0, 50);
  const binds = { wd: workDate, by: recordedBy };
  const lines = [];

  entries.forEach((e, i) => {
    const session = String(e.session || '').toUpperCase();
    if (!['AM', 'PM', 'DAY'].includes(session)) throw new HttpError(400, `Entry ${i + 1}: session must be AM, PM or DAY.`);
    const t = typeMap[e.type_code];
    if (!t) throw new HttpError(400, `Entry ${i + 1}: unknown assignment type "${e.type_code}".`);
    const action = (e.action || (e.supersedes_log_id || (e.supersedes_log_ids || []).length ? 'AMEND' : 'ASSIGN')).toUpperCase();
    if (!['ASSIGN', 'AMEND', 'CANCEL'].includes(action)) throw new HttpError(400, `Entry ${i + 1}: bad action.`);
    const sups = Array.isArray(e.supersedes_log_ids) ? e.supersedes_log_ids.map(Number) : (e.supersedes_log_id ? [Number(e.supersedes_log_id)] : []);
    if (action !== 'ASSIGN' && !sups.length) throw new HttpError(400, `Entry ${i + 1}: a change must say which row it replaces.`);
    if (!Number(e.staff_id)) throw new HttpError(400, `Entry ${i + 1}: staff is required.`);

    let doctors = Array.isArray(e.doctor_ids) ? e.doctor_ids.map(Number).filter(Boolean) : [];
    if (t.needs_doctor === 'Y' && !doctors.length && action !== 'CANCEL') throw new HttpError(400, `Entry ${i + 1}: ${t.type_name} needs a doctor.`);
    if (doctors.length > 3) throw new HttpError(400, `Entry ${i + 1}: at most 3 doctors per entry.`);
    if (!doctors.length) doctors = [null];
    if (action !== 'ASSIGN' && doctors.length !== sups.length) throw new HttpError(400, `Entry ${i + 1}: each changed doctor must say which row it replaces.`);

    const p = `e${i}_`;
    binds[p + 's'] = session;
    binds[p + 'st'] = Number(e.staff_id);
    binds[p + 't'] = e.type_code;
    binds[p + 'c'] = e.clinic_id ? Number(e.clinic_id) : null;
    binds[p + 'n'] = e.notes ? String(e.notes).slice(0, 400) : null;
    binds[p + 'a'] = action;

    lines.push(`  l_grp := assignment_group_seq.NEXTVAL;`);
    doctors.forEach((d, j) => {
      binds[`${p}d${j}`] = d;
      binds[`${p}sup${j}`] = sups[j] || null;
      binds[`${p}r${j}`] = `${crid}:${i}:${j}`;
      lines.push(`  INSERT INTO assignment_logs (assignment_group_id, action, supersedes_log_id, work_date, session_code, staff_id,
                                 doctor_id, clinic_id, type_code, notes, recorded_by, client_request_id)
  VALUES (l_grp, :${p}a, :${p}sup${j}, TO_DATE(:wd, 'YYYY-MM-DD'), :${p}s, :${p}st,
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

  const written = await query(`
    SELECT log_id, action, session_code, staff_id, staff_name, doctor_name, clinic_id, type_code, type_name
      FROM v_assignment_history
     WHERE log_id IN (SELECT log_id FROM assignment_logs WHERE client_request_id LIKE :pfx)
     ORDER BY log_id`, { pfx: crid + ':%' });
  return { crid, written, typeMap };
}

module.exports = { writeEntries, assignmentTypes };
