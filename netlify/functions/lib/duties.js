// Daily duties, auto-rotated:
//   Instruments — 1 dental assistant AM (8:40) + 1 PM (12:40). Skips anyone not available that
//                 session or on Vitals in that same session; the skipped person keeps her place.
//   Crash cart  — 2 staff nurses before 8:30. Vitals allowed. The CIC fills a gap.
// The queue order comes from V_ROTATION_QUEUE (fewest turns → longest since last → A–Z), so the
// rotation only moves when a duty is actually recorded in ASSIGNMENT_LOGS.
const { query } = require('./db');
const { writeEntries } = require('./assignments');

const DUTY_TYPES = ['INSTRUMENTS', 'CRASH_CART'];

async function loadDay(date) {
  const [queue, board, cic] = await Promise.all([
    query(`
      SELECT rotation_code, staff_id, staff_name, total_count, queue_position
        FROM v_rotation_queue
       WHERE rotation_code IN ('INSTRUMENTS', 'CRASH_CART') AND is_eligible = 'Y'
       ORDER BY rotation_code, queue_position`),
    query(`
      SELECT log_id, staff_id, staff_name, session_code, type_code, category
        FROM v_assignments_current WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD')`, { d: date }),
    query(`SELECT staff_id, display_name FROM staff WHERE app_role = 'ADMIN' AND employment_status = 'ACTIVE' ORDER BY staff_id FETCH FIRST 1 ROWS ONLY`),
  ]);
  return { queue, board, cic: cic[0] || null };
}

const inSession = (r, sess) => r.session_code === sess || r.session_code === 'DAY';

function pick({ queue, board, cic }) {
  const unavailable = (sid, sess) => board.some((r) => Number(r.staff_id) === Number(sid) && r.category === 'UNAVAILABLE' && inSession(r, sess));
  const onVitals = (sid, sess) => board.some((r) => Number(r.staff_id) === Number(sid) && r.type_code === 'VITALS' && inSession(r, sess));
  const recorded = (type, sess) => board.filter((r) => r.type_code === type && (!sess || inSession(r, sess)));
  const skipped = [];
  const inst = queue.filter((q) => q.rotation_code === 'INSTRUMENTS');
  const nurses = queue.filter((q) => q.rotation_code === 'CRASH_CART');

  const out = { instruments: {}, crash: [], skipped };
  const taken = new Set();
  for (const sess of ['AM', 'PM']) {
    const rec = recorded('INSTRUMENTS', sess)[0];
    if (rec) { out.instruments[sess] = { staff_id: Number(rec.staff_id), name: rec.staff_name, recorded: true, log_id: rec.log_id, nowUnavailable: unavailable(rec.staff_id, sess) }; taken.add(Number(rec.staff_id)); continue; }
  }
  for (const sess of ['AM', 'PM']) {
    if (out.instruments[sess]) continue;
    for (const q of inst) {
      const sid = Number(q.staff_id);
      if (taken.has(sid)) continue;
      if (unavailable(sid, sess)) { skipped.push({ duty: `Instruments ${sess}`, name: q.staff_name, why: 'not available' }); continue; }
      if (onVitals(sid, sess)) { skipped.push({ duty: `Instruments ${sess}`, name: q.staff_name, why: 'on Vitals' }); continue; }
      out.instruments[sess] = { staff_id: sid, name: q.staff_name, recorded: false };
      taken.add(sid);
      break;
    }
  }

  const crashRec = recorded('CRASH_CART');
  for (const r of crashRec) out.crash.push({ staff_id: Number(r.staff_id), name: r.staff_name, recorded: true, log_id: r.log_id, nowUnavailable: unavailable(r.staff_id, 'AM') });
  for (const q of nurses) {
    if (out.crash.length >= 2) break;
    const sid = Number(q.staff_id);
    if (out.crash.some((c) => c.staff_id === sid)) continue;
    if (unavailable(sid, 'AM')) { skipped.push({ duty: 'Crash cart', name: q.staff_name, why: 'not available' }); continue; }
    out.crash.push({ staff_id: sid, name: q.staff_name, recorded: false });
  }
  if (out.crash.length < 2 && cic && !out.crash.some((c) => c.staff_id === Number(cic.staff_id))) {
    out.crash.push({ staff_id: Number(cic.staff_id), name: cic.display_name + ' (CIC)', recorded: false, cic: true });
  }
  out.allRecorded = !!(out.instruments.AM && out.instruments.AM.recorded && out.instruments.PM && out.instruments.PM.recorded && out.crash.length && out.crash.every((c) => c.recorded));
  return out;
}

async function computeDuties(date) {
  return pick(await loadDay(date));
}

// Write the picks that are not recorded yet. Returns the rows written.
async function recordDuties(date, recordedBy) {
  const d = await computeDuties(date);
  const entries = [];
  for (const sess of ['AM', 'PM']) {
    const p = d.instruments[sess];
    if (p && !p.recorded) entries.push({ session: sess, staff_id: p.staff_id, type_code: 'INSTRUMENTS', notes: 'auto-rotation' });
  }
  for (const c of d.crash) if (!c.recorded) entries.push({ session: 'AM', staff_id: c.staff_id, type_code: 'CRASH_CART', notes: c.cic ? 'CIC covering' : 'auto-rotation' });
  if (!entries.length) return { written: [], duties: d };
  const { written } = await writeEntries({ workDate: date, entries, recordedBy });
  return { written, duties: await computeDuties(date) };
}

// Same-day sick leave: if someone just put on sick leave holds today's Instruments duty in that
// session, cancel her duty and hand it to the next in line. Returns [{ session, from, to }].
const HANDOVER_TYPES = ['SICK_LEAVE'];
async function handOverDuties(date, written, recordedBy) {
  const sick = written.filter((w) => w.action !== 'CANCEL' && HANDOVER_TYPES.includes(w.type_code));
  if (!sick.length) return [];
  const { board } = await loadDay(date);
  const cancels = [];
  for (const s of sick) {
    for (const r of board) {
      if (r.type_code !== 'INSTRUMENTS' || Number(r.staff_id) !== Number(s.staff_id)) continue;
      const overlaps = s.session_code === 'DAY' || inSession(r, s.session_code);
      if (!overlaps || cancels.some((c) => c.log_id === r.log_id)) continue;
      cancels.push({ log_id: r.log_id, session: r.session_code, staff_id: Number(r.staff_id), name: r.staff_name });
    }
  }
  if (!cancels.length) return [];
  await writeEntries({
    workDate: date, recordedBy,
    entries: cancels.map((c) => ({ session: c.session, staff_id: c.staff_id, type_code: 'INSTRUMENTS', supersedes_log_id: Number(c.log_id), action: 'CANCEL', notes: 'sick leave' })),
  });
  const d = await computeDuties(date);
  const entries = [];
  const out = [];
  for (const c of cancels) {
    const p = d.instruments[c.session];
    if (p && !p.recorded) { entries.push({ session: c.session, staff_id: p.staff_id, type_code: 'INSTRUMENTS', notes: 'auto: ' + c.name + ' on sick leave' }); out.push({ session: c.session, from: c.name, to: p, fromId: c.staff_id }); }
    else out.push({ session: c.session, from: c.name, to: null, fromId: c.staff_id });
  }
  if (entries.length) await writeEntries({ workDate: date, entries, recordedBy });
  return out;
}

module.exports = { computeDuties, recordDuties, handOverDuties, pick, DUTY_TYPES };
