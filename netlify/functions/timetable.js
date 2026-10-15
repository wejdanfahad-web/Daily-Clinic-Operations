// Semester timetable: which doctor is in which clinic, each weekday and session (CIC).
// GET  /api/timetable                   → semesters
// GET  /api/timetable?semester_id=3     → that semester's entries
// POST /api/timetable
//   { action: "create_semester", semester_name, starts_on, ends_on }
//   { action: "import", semester_id, source_file, rows: [{ doctor_id, weekday, session, clinic_id }] }   replaces all entries
//   { action: "add_entry", semester_id, doctor_id, weekday, session, clinic_id }
//   { action: "delete_entry", timetable_id }
//   { action: "confirm", semester_id }    the planner only uses confirmed semesters
//   { action: "save_alias", alias, doctor_id }              remember how a timetable name maps to a doctor
//   { action: "add_doctor", display_name, category_code, alias }   add a new doctor found in the timetable
// The clinic is optional: the department timetable lists who is present; the CIC places them in clinics.
const { query, one, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireCic, isIsoDate } = require('./lib/http');
const { normAlias } = require('./lib/names');

function checkEntry(r, i = 0) {
  const doc = Number(r.doctor_id), wd = Number(r.weekday), cl = Number(r.clinic_id);
  const s = String(r.session || '').toUpperCase();
  if (!doc) throw new HttpError(400, `Row ${i + 1}: doctor is missing.`);
  if (!(Number.isInteger(wd) && wd >= 0 && wd <= 4)) throw new HttpError(400, `Row ${i + 1}: day must be Sunday–Thursday.`);
  if (!['AM', 'PM'].includes(s)) throw new HttpError(400, `Row ${i + 1}: session must be AM or PM.`);
  return { doctor_id: doc, weekday: wd, session: s, clinic_id: cl || null };
}

exports.handler = handler(['GET', 'POST'], async (event) => {
  const user = requireCic(event);
  const by = `${user.name} (#${user.sid})`;

  if (event.httpMethod === 'GET') {
    const sid = Number((event.queryStringParameters || {}).semester_id);
    const semesters = await query(`
      SELECT semester_id, semester_name, TO_CHAR(starts_on, 'YYYY-MM-DD') AS starts_on, TO_CHAR(ends_on, 'YYYY-MM-DD') AS ends_on,
             source_file, TO_CHAR(CAST(confirmed_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS confirmed_at,
             (SELECT COUNT(*) FROM doctor_timetable t WHERE t.semester_id = s.semester_id) AS entries
        FROM semesters s ORDER BY starts_on DESC`);
    const entries = sid ? await query(`
      SELECT t.timetable_id, t.doctor_id, d.display_name AS doctor_name, d.category_code, d.max_assistants,
             t.weekday, t.session_code, t.clinic_id
        FROM doctor_timetable t JOIN doctors d ON d.doctor_id = t.doctor_id
       WHERE t.semester_id = :s ORDER BY t.weekday, t.session_code, t.clinic_id`, { s: sid }, { limit: 5000 }) : [];
    const aliases = await query(`SELECT alias_norm, doctor_id FROM doctor_aliases`, {}, { limit: 5000 });
    return json(200, { semesters, entries, aliases });
  }

  const b = parseBody(event);
  switch (b.action) {
    case 'create_semester': {
      const name = String(b.semester_name || '').trim().slice(0, 80);
      if (!name) throw new HttpError(400, 'Give the semester a name.');
      if (!isIsoDate(b.starts_on) || !isIsoDate(b.ends_on) || b.ends_on < b.starts_on) throw new HttpError(400, 'Enter a valid start and end date.');
      await exec(`BEGIN INSERT INTO semesters (semester_name, starts_on, ends_on, uploaded_by)
                  VALUES (:n, TO_DATE(:s, 'YYYY-MM-DD'), TO_DATE(:e, 'YYYY-MM-DD'), :by); COMMIT; END;`, { n: name, s: b.starts_on, e: b.ends_on, by });
      const row = await one(`SELECT MAX(semester_id) AS id FROM semesters WHERE semester_name = :n`, { n: name });
      return json(200, { ok: true, semester_id: Number(row.id) });
    }
    case 'import': {
      const sem = Number(b.semester_id);
      if (!sem) throw new HttpError(400, 'Choose the semester.');
      if (!Array.isArray(b.rows) || !b.rows.length) throw new HttpError(400, 'No timetable rows to save.');
      if (b.rows.length > 600) throw new HttpError(400, 'Too many rows (max 600).');
      const rows = b.rows.map(checkEntry);
      // de-duplicate exact repeats
      const seen = new Set();
      const uniq = rows.filter((r) => { const k = `${r.doctor_id}|${r.weekday}|${r.session}|${r.clinic_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
      await exec(`
BEGIN
  DELETE FROM doctor_timetable WHERE semester_id = :sem;
  INSERT INTO doctor_timetable (semester_id, doctor_id, weekday, session_code, clinic_id)
  SELECT :sem, j.doctor_id, j.weekday, j.session_code, j.clinic_id
    FROM JSON_TABLE(:js, '$[*]' COLUMNS (doctor_id NUMBER PATH '$.d', weekday NUMBER PATH '$.w',
                                          session_code VARCHAR2(3) PATH '$.s', clinic_id NUMBER PATH '$.c')) j;
  UPDATE semesters SET source_file = NVL(:src, source_file), confirmed_at = NULL, uploaded_by = :by, uploaded_at = SYSTIMESTAMP
   WHERE semester_id = :sem;
  COMMIT;
END;`, { sem, js: JSON.stringify(uniq.map((r) => ({ d: r.doctor_id, w: r.weekday, s: r.session, c: r.clinic_id }))), src: b.source_file ? String(b.source_file).slice(0, 200) : null, by });
      return json(200, { ok: true, saved: uniq.length });
    }
    case 'add_entry': {
      const sem = Number(b.semester_id);
      if (!sem) throw new HttpError(400, 'Choose the semester.');
      const r = checkEntry(b);
      await exec(`BEGIN INSERT INTO doctor_timetable (semester_id, doctor_id, weekday, session_code, clinic_id)
                  VALUES (:sem, :d, :w, :s, :c); COMMIT;
                  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL; END;`, { sem, d: r.doctor_id, w: r.weekday, s: r.session, c: r.clinic_id });
      return json(200, { ok: true });
    }
    case 'delete_entry': {
      const id = Number(b.timetable_id);
      if (!id) throw new HttpError(400, 'timetable_id is required.');
      await exec(`BEGIN DELETE FROM doctor_timetable WHERE timetable_id = :id; COMMIT; END;`, { id });
      return json(200, { ok: true });
    }
    case 'confirm': {
      const sem = Number(b.semester_id);
      await exec(`BEGIN UPDATE semesters SET confirmed_at = SYSTIMESTAMP WHERE semester_id = :sem; COMMIT; END;`, { sem });
      return json(200, { ok: true });
    }
    case 'save_alias': {
      const alias = normAlias(b.alias);
      const doc = Number(b.doctor_id);
      if (!alias || !doc) throw new HttpError(400, 'alias and doctor_id are required.');
      await exec(`BEGIN
        MERGE INTO doctor_aliases t USING (SELECT :a AS alias_norm FROM dual) s ON (t.alias_norm = s.alias_norm)
        WHEN MATCHED THEN UPDATE SET doctor_id = :d, created_by = :by, created_at = SYSTIMESTAMP
        WHEN NOT MATCHED THEN INSERT (alias_norm, doctor_id, created_by) VALUES (:a, :d, :by);
        COMMIT; END;`, { a: alias.slice(0, 120), d: doc, by });
      return json(200, { ok: true });
    }
    case 'add_doctor': {
      const raw = String(b.display_name || '').trim().replace(/\s+/g, ' ');
      if (!raw) throw new HttpError(400, 'Enter the doctor\'s name.');
      const title = /^prof/i.test(raw) ? 'PROF' : 'DR';
      const name = (/^(dr|prof)\.?\s/i.test(raw) ? raw : 'Dr. ' + raw).slice(0, 60);
      const cat = b.category_code ? String(b.category_code).toUpperCase() : null;
      await exec(`
DECLARE
  l_id NUMBER;
BEGIN
  BEGIN
    SELECT doctor_id INTO l_id FROM doctors WHERE UPPER(display_name) = UPPER(:n);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    INSERT INTO doctors (display_name, full_name, title, category_code) VALUES (:n, :full, :t, :c) RETURNING doctor_id INTO l_id;
  END;
  IF :a IS NOT NULL THEN
    MERGE INTO doctor_aliases x USING (SELECT :a AS alias_norm FROM dual) s ON (x.alias_norm = s.alias_norm)
    WHEN MATCHED THEN UPDATE SET doctor_id = l_id
    WHEN NOT MATCHED THEN INSERT (alias_norm, doctor_id, created_by) VALUES (:a, l_id, :by);
  END IF;
  COMMIT;
END;`, { n: name, full: b.alias ? String(b.alias).slice(0, 120) : null, t: title, c: cat, a: b.alias ? normAlias(b.alias).slice(0, 120) : null, by });
      const row = await one(`SELECT doctor_id, display_name, category_code, max_assistants FROM doctors WHERE UPPER(display_name) = UPPER(:n)`, { n: name });
      return json(200, { ok: true, doctor: row });
    }
    default:
      throw new HttpError(400, 'Unknown action.');
  }
});
