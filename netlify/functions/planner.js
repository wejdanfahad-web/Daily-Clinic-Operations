// Schedule planner (CIC): plan a day as a draft, then publish it to the live board.
//
// GET  /api/planner?date=YYYY-MM-DD
//   → { draft, status, timetable (that weekday, confirmed semester), leave (covering the date), board, published_at }
// POST /api/planner
//   { action: "save_draft", date, draft }          draft = { "<staff_id>": { "AM": [entry], "PM": [entry] } }
//   { action: "publish", date, draft }             writes only the differences to ASSIGNMENT_LOGS and notifies changed staff
//   { action: "add_leave", staff_id, from_date, to_date, type_code, notes }
//   { action: "delete_leave", leave_id }
// entry = { type_code, doctor_ids: [], clinic_id, notes }
const { query, one, exec } = require('./lib/db');
const { writeEntries, assignmentTypes } = require('./lib/assignments');
const { notifyStaff } = require('./lib/push');
const { handler, json, parseBody, HttpError, requireCic, isIsoDate, riyadhToday } = require('./lib/http');

const weekdayOf = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = Sunday

// Comparable signature of one session's entries (order-independent).
function sig(entries) {
  return (entries || []).map((e) => [e.type_code, [...(e.doctor_ids || [])].map(Number).sort().join('+'), e.clinic_id ? Number(e.clinic_id) : '', e.notes || ''].join('|')).sort().join(';');
}

function validateDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new HttpError(400, 'Invalid draft.');
  const text = JSON.stringify(draft);
  if (text.length > 30000) throw new HttpError(400, 'The draft is too large.');
  return text;
}

async function currentBoard(date) {
  return query(`
    SELECT log_id, assignment_group_id, session_code, staff_id, staff_name, doctor_id, doctor_name, doctor_category,
           clinic_id, type_code, type_name, category, notes
      FROM v_assignments_current WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD')
     ORDER BY log_id`, { d: date });
}

// Board rows → { staff_id: { AM: [entry], PM: [entry] } }, keeping log ids for cancelling.
function boardToDraft(rows) {
  const out = {};
  const groups = new Map();
  for (const r of rows) {
    const k = r.assignment_group_id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const g of groups.values()) {
    const f = g[0];
    const entry = { type_code: f.type_code, doctor_ids: g.map((r) => r.doctor_id).filter(Boolean).map(Number), clinic_id: f.clinic_id ? Number(f.clinic_id) : null, notes: f.notes || '', _rows: g };
    const sessions = f.session_code === 'DAY' ? ['AM', 'PM'] : [f.session_code];
    for (const s of sessions) {
      out[f.staff_id] = out[f.staff_id] || { AM: [], PM: [] };
      out[f.staff_id][s].push(entry);
    }
  }
  return out;
}

exports.handler = handler(['GET', 'POST'], async (event) => {
  const user = requireCic(event);
  const by = `${user.name} (#${user.sid})`;

  if (event.httpMethod === 'GET') {
    const date = (event.queryStringParameters || {}).date;
    if (!isIsoDate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD.');
    const wd = weekdayOf(date);
    const [draftRow, timetable, leave, board, semester] = await Promise.all([
      one(`SELECT draft_json, status, updated_by, TO_CHAR(CAST(updated_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS updated_at,
                  TO_CHAR(CAST(published_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS published_at
             FROM schedule_drafts WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD')`, { d: date }),
      wd <= 4 ? query(`
        SELECT t.doctor_id, d.display_name AS doctor_name, d.category_code, d.max_assistants, t.session_code, t.clinic_id
          FROM doctor_timetable t
          JOIN semesters s ON s.semester_id = t.semester_id
          JOIN doctors d ON d.doctor_id = t.doctor_id
         WHERE s.confirmed_at IS NOT NULL AND t.weekday = :wd
           AND TO_DATE(:d, 'YYYY-MM-DD') BETWEEN s.starts_on AND s.ends_on
         ORDER BY t.session_code, t.clinic_id`, { wd, d: date }) : [],
      query(`
        SELECT l.leave_id, l.staff_id, s.display_name AS staff_name, TO_CHAR(l.from_date, 'YYYY-MM-DD') AS from_date,
               TO_CHAR(l.to_date, 'YYYY-MM-DD') AS to_date, l.session_code, l.type_code, l.notes
          FROM staff_leave l JOIN staff s ON s.staff_id = l.staff_id
         WHERE l.to_date >= TO_DATE(:d, 'YYYY-MM-DD') - 31
         ORDER BY l.from_date`, { d: date }),
      currentBoard(date),
      one(`SELECT semester_name FROM semesters WHERE confirmed_at IS NOT NULL AND TO_DATE(:d, 'YYYY-MM-DD') BETWEEN starts_on AND ends_on
            ORDER BY starts_on DESC FETCH FIRST 1 ROWS ONLY`, { d: date }),
    ]);
    let draft = null;
    if (draftRow && draftRow.draft_json) { try { draft = typeof draftRow.draft_json === 'string' ? JSON.parse(draftRow.draft_json) : draftRow.draft_json; } catch { draft = null; } }
    return json(200, {
      date, draft, status: draftRow ? draftRow.status : null, updated_at: draftRow ? draftRow.updated_at : null,
      updated_by: draftRow ? draftRow.updated_by : null, published_at: draftRow ? draftRow.published_at : null,
      semester: semester ? semester.semester_name : null, timetable, leave, board,
    });
  }

  const b = parseBody(event);

  if (b.action === 'add_leave') {
    const sid = Number(b.staff_id);
    if (!sid) throw new HttpError(400, 'Choose the staff member.');
    if (!isIsoDate(b.from_date) || !isIsoDate(b.to_date) || b.to_date < b.from_date) throw new HttpError(400, 'Enter a valid from and to date.');
    const type = b.type_code || 'ON_LEAVE';
    await exec(`BEGIN INSERT INTO staff_leave (staff_id, from_date, to_date, type_code, notes, entered_by)
                VALUES (:s, TO_DATE(:f, 'YYYY-MM-DD'), TO_DATE(:t, 'YYYY-MM-DD'), :ty, :n, :by); COMMIT; END;`,
    { s: sid, f: b.from_date, t: b.to_date, ty: type, n: b.notes ? String(b.notes).slice(0, 200) : null, by });
    return json(200, { ok: true });
  }
  if (b.action === 'delete_leave') {
    await exec(`BEGIN DELETE FROM staff_leave WHERE leave_id = :id; COMMIT; END;`, { id: Number(b.leave_id) });
    return json(200, { ok: true });
  }

  const date = b.date;
  if (!isIsoDate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD.');
  const text = validateDraft(b.draft);

  if (b.action === 'save_draft') {
    await exec(`
      BEGIN
        MERGE INTO schedule_drafts t USING (SELECT TO_DATE(:d, 'YYYY-MM-DD') AS work_date FROM dual) s ON (t.work_date = s.work_date)
        WHEN MATCHED THEN UPDATE SET draft_json = :js, updated_by = :by, updated_at = SYSTIMESTAMP,
                                     status = CASE WHEN status = 'PUBLISHED' THEN 'DRAFT' ELSE status END
        WHEN NOT MATCHED THEN INSERT (work_date, draft_json, status, updated_by) VALUES (s.work_date, :js, 'DRAFT', :by);
        COMMIT;
      END;`, { d: date, js: text, by });
    return json(200, { ok: true });
  }

  if (b.action !== 'publish') throw new HttpError(400, 'Unknown action.');
  if (date < riyadhToday()) throw new HttpError(400, 'You can\'t publish a plan for a past day. Edit the board directly instead.');

  const typeMap = await assignmentTypes();
  // daily duties (Instruments / Crash cart) are managed by the rotation, not by the plan
  const current = boardToDraft((await currentBoard(date)).filter((r) => !['INSTRUMENTS', 'CRASH_CART'].includes(r.type_code)));
  const draft = b.draft;
  const entries = [];
  const changedStaff = new Set();
  const cancelled = new Set();
  const staffIds = new Set([...Object.keys(current), ...Object.keys(draft)]);

  for (const sid of staffIds) {
    for (const sess of ['AM', 'PM']) {
      const cur = (current[sid] && current[sid][sess]) || [];
      const want = (draft[sid] && draft[sid][sess]) || [];
      if (sig(cur) === sig(want)) continue;
      changedStaff.add(Number(sid));
      for (const e of cur) {
        for (const r of e._rows) {
          if (cancelled.has(r.log_id)) continue;
          cancelled.add(r.log_id);
          entries.push({ session: r.session_code, staff_id: Number(sid), type_code: r.type_code, doctor_ids: r.doctor_id ? [r.doctor_id] : [], clinic_id: r.clinic_id, supersedes_log_id: r.log_id, action: 'CANCEL' });
          // a whole-day row that is cancelled must be re-added for the session that did not change
          if (r.session_code === 'DAY') {
            const other = sess === 'AM' ? 'PM' : 'AM';
            const otherWant = (draft[sid] && draft[sid][other]) || [];
            const otherCur = (current[sid] && current[sid][other]) || [];
            if (sig(otherCur) === sig(otherWant)) {
              for (const oe of otherWant) entries.push({ session: other, staff_id: Number(sid), type_code: oe.type_code, doctor_ids: oe.doctor_ids || [], clinic_id: oe.clinic_id || null, notes: oe.notes || null });
            }
          }
        }
      }
      for (const e of want) {
        if (!typeMap[e.type_code]) throw new HttpError(400, `Unknown assignment type "${e.type_code}".`);
        entries.push({ session: sess, staff_id: Number(sid), type_code: e.type_code, doctor_ids: e.doctor_ids || [], clinic_id: e.clinic_id || null, notes: e.notes || null });
      }
    }
  }

  let written = [];
  if (entries.length) ({ written } = await writeEntries({ workDate: date, entries, recordedBy: by + ' · planner', typeMap }));

  await exec(`
    BEGIN
      MERGE INTO schedule_drafts t USING (SELECT TO_DATE(:d, 'YYYY-MM-DD') AS work_date FROM dual) s ON (t.work_date = s.work_date)
      WHEN MATCHED THEN UPDATE SET draft_json = :js, status = 'PUBLISHED', updated_by = :by, updated_at = SYSTIMESTAMP, published_by = :by, published_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (work_date, draft_json, status, updated_by, published_by, published_at) VALUES (s.work_date, :js, 'PUBLISHED', :by, :by, SYSTIMESTAMP);
      COMMIT;
    END;`, { d: date, js: text, by });

  // A surgery booking added in the planner ("Booking #id" on the row) now counts as assigned.
  try {
    await exec(`
      BEGIN
        UPDATE surgery_bookings b
           SET status = 'ASSIGNED', seen_at = NVL(seen_at, SYSTIMESTAMP),
               assignment_log_id = (SELECT MIN(v.log_id) FROM v_assignments_current v
                                     WHERE v.work_date = b.work_date AND v.type_code = 'SURGERY' AND v.notes = 'Booking #' || b.booking_id)
         WHERE b.work_date = TO_DATE(:d, 'YYYY-MM-DD') AND b.status IN ('NEW', 'SEEN')
           AND EXISTS (SELECT 1 FROM v_assignments_current v
                        WHERE v.work_date = b.work_date AND v.type_code = 'SURGERY' AND v.notes = 'Booking #' || b.booking_id);
        COMMIT;
      END;`, { d: date });
  } catch (e) { console.error('booking link', e.message); }

  // One notification per staff member whose day changed.
  const notified = [];
  const dayLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  for (const sid of changedStaff) {
    const d = draft[sid] || {};
    const describe = (sess) => (d[sess] || []).map((e) => typeMap[e.type_code] ? typeMap[e.type_code].type_name.replace(' (with doctor)', '') + (e.clinic_id ? ' Cl ' + e.clinic_id : '') : e.type_code).join(', ') || '—';
    const r = await notifyStaff(sid, {
      eventType: 'SCHEDULE_CHANGE', title: `Your schedule today (${dayLabel})`,
      body: `AM: ${describe('AM')} · PM: ${describe('PM')}`, url: `/#/assign/${date}`,
      dedupeKey: `PUB:${date}:${sid}:${Date.now()}`,
      notBefore: `${date} 07:30`, // delivered at 07:30 on the day
    });
    notified.push({ staff_id: sid, status: r.status });
  }
  return json(200, { ok: true, changes: entries.length, written: written.length, notified });
});
