// Daily duties, auto-rotated:
//   Instruments — 1 dental assistant AM (8:40) + 1 PM (12:40). Skips anyone not available that
//                 session or on Vitals in that same session; the skipped person keeps her place.
//   Crash cart  — 2 staff nurses before 8:30. Vitals allowed. The CIC fills a gap.
// The queue order comes from V_ROTATION_QUEUE (Nov 2026: a true rotation - whoever had the duty longest
// ago goes next, fewer turns breaks a tie), so the rotation only moves when a duty is actually recorded.
// "Not available" is read from the published board, or the saved planner draft while the day is not
// published yet, plus planned leave - so duties picked at 16:00 already know tomorrow's leave and Vitals.
const { query } = require('./db');
const { writeEntries } = require('./assignments');

const DUTY_TYPES = ['INSTRUMENTS', 'CRASH_CART'];

async function loadDay(date) {
  await require('./migrate').ensureSchema();
  const [queue, board, cic, extra] = await Promise.all([
    query(`
      SELECT rotation_code, staff_id, staff_name, total_count, queue_position
        FROM v_rotation_queue
       WHERE rotation_code IN ('INSTRUMENTS', 'CRASH_CART') AND is_eligible = 'Y'
       ORDER BY rotation_code, queue_position`),
    query(`
      SELECT log_id, staff_id, staff_name, session_code, type_code, category
        FROM v_assignments_current WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD')`, { d: date }),
    query(`SELECT staff_id, display_name FROM staff WHERE app_role = 'ADMIN' AND employment_status = 'ACTIVE' ORDER BY staff_id FETCH FIRST 1 ROWS ONLY`),
    plannedRows(date),
  ]);
  return { queue, board: [...board, ...extra(board)], cic: cic[0] || null };
}

// Planned leave, and the saved draft while the day is not published yet, as extra board-like rows
// (no log_id, so they never count as recorded duties).
async function plannedRows(date) {
  let leave = [], draft = null, types = [];
  try {
    [leave, draft, types] = await Promise.all([
      query(`SELECT staff_id, session_code, type_code FROM staff_leave
              WHERE TO_DATE(:d, 'YYYY-MM-DD') BETWEEN from_date AND to_date`, { d: date }),
      query(`SELECT draft_json FROM schedule_drafts WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD')`, { d: date }).then((r) => r[0] || null),
      query(`SELECT type_code, category FROM assignment_types`),
    ]);
  } catch (e) { console.error('duties planned rows', e.message); }
  const cat = Object.fromEntries(types.map((t) => [t.type_code, t.category]));
  return (board) => {
    const rows = leave.map((l) => ({ staff_id: Number(l.staff_id), session_code: l.session_code || 'DAY', type_code: l.type_code, category: 'UNAVAILABLE', planned: true }));
    const published = board.some((r) => !DUTY_TYPES.includes(r.type_code));
    if (!published && draft && draft.draft_json) {
      let d = null;
      try { d = typeof draft.draft_json === 'string' ? JSON.parse(draft.draft_json) : draft.draft_json; } catch { d = null; }
      for (const [sid, cell] of Object.entries(d || {})) {
        for (const sess of ['AM', 'PM']) {
          for (const e of (cell && cell[sess]) || []) {
            if (!e || DUTY_TYPES.includes(e.type_code)) continue;
            rows.push({ staff_id: Number(sid), session_code: sess, type_code: e.type_code, category: cat[e.type_code] || null, planned: true });
          }
        }
      }
    }
    return rows;
  };
}

const inSession = (r, sess) => r.session_code === sess || r.session_code === 'DAY';

function pick({ queue, board, cic }) {
  const unavailable = (sid, sess) => board.some((r) => Number(r.staff_id) === Number(sid) && r.category === 'UNAVAILABLE' && inSession(r, sess));
  const onVitals = (sid, sess) => board.some((r) => Number(r.staff_id) === Number(sid) && r.type_code === 'VITALS' && inSession(r, sess));
  const recorded = (type, sess) => board.filter((r) => r.log_id && r.type_code === type && (!sess || inSession(r, sess)));
  const skipped = [];
  const inst = queue.filter((q) => q.rotation_code === 'INSTRUMENTS');
  const nurses = queue.filter((q) => q.rotation_code === 'CRASH_CART');

  const out = { instruments: {}, crash: [], skipped };
  const taken = new Set();
  for (const sess of ['AM', 'PM']) {
    const rec = recorded('INSTRUMENTS', sess)[0];
    if (rec) { out.instruments[sess] = { staff_id: Number(rec.staff_id), name: rec.staff_name, recorded: true, log_id: rec.log_id, nowUnavailable: unavailable(rec.staff_id, sess), nowVitals: onVitals(rec.staff_id, sess) }; taken.add(Number(rec.staff_id)); continue; }
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

// A recorded duty whose holder is no longer free (leave, sick leave, excuse... or Vitals for instruments)
// is cancelled and given to the next in line. Days not recorded yet are left alone (the 16:00 run
// records them). Returns [{ slot, session, from, fromId, to }] where to = { staff_id, name } or null.
async function refreshDuties(date, recordedBy) {
  const d = await computeDuties(date);
  const bad = [];
  for (const sess of ['AM', 'PM']) {
    const p = d.instruments[sess];
    if (p && p.recorded && (p.nowUnavailable || p.nowVitals)) bad.push({ slot: 'INST_' + sess, session: sess, type: 'INSTRUMENTS', log_id: p.log_id, staff_id: p.staff_id, name: p.name, why: p.nowVitals ? 'on Vitals' : 'not available' });
  }
  for (const c of d.crash) if (c.recorded && c.nowUnavailable) bad.push({ slot: 'CRASH', session: 'AM', type: 'CRASH_CART', log_id: c.log_id, staff_id: c.staff_id, name: c.name, why: 'not available' });
  if (!bad.length) return [];
  await writeEntries({
    workDate: date, recordedBy,
    entries: bad.map((b) => ({ session: b.session, staff_id: b.staff_id, type_code: b.type, supersedes_log_id: Number(b.log_id), action: 'CANCEL', notes: b.why })),
  });
  const n = await computeDuties(date);
  const entries = [];
  const out = [];
  const crashNew = n.crash.filter((c) => !c.recorded);
  for (const b of bad) {
    const p = b.type === 'INSTRUMENTS' ? n.instruments[b.session] : crashNew.shift();
    const ok = p && !p.recorded;
    if (ok) entries.push({ session: b.session, staff_id: p.staff_id, type_code: b.type, notes: (p.cic ? 'CIC covering' : 'auto') + ': ' + b.name + ' ' + b.why });
    out.push({ slot: b.slot, session: b.session, from: b.name, fromId: b.staff_id, why: b.why, to: ok ? { staff_id: p.staff_id, name: p.name } : null });
  }
  if (entries.length) await writeEntries({ workDate: date, entries, recordedBy });
  return out;
}

const DUTY_LABEL = { INST_AM: 'AM instruments from CSSD at 8:40', INST_PM: 'PM instruments from CSSD at 12:40', CRASH: 'Crash cart check before 8:30' };

// Tell the new holders (from 07:30 on the day) and, for today, the CIC.
async function announceRefresh(date, changes, today) {
  const { notifyStaff, notifyCic } = require('./push');
  for (const c of changes) {
    if (c.to) await notifyStaff(c.to.staff_id, { eventType: 'DAILY_DUTY', title: 'Your duty today', body: `${DUTY_LABEL[c.slot]} (covering ${c.from})`, url: `/#/assign/${date}`, dedupeKey: `DUTY-SWAP:${date}:${c.slot}:${c.to.staff_id}:${Date.now()}`, notBefore: `${date} 07:30` });
    if (date === today || !c.to) {
      await notifyCic({
        eventType: 'SCHEDULE_CHANGE',
        title: c.to ? 'Duty handed over' : 'Duty needs someone',
        body: c.to ? `${c.from} is ${c.why}. ${DUTY_LABEL[c.slot].split(' from')[0].split(' before')[0]} now: ${c.to.name}.` : `${c.from} is ${c.why} and nobody is free for ${DUTY_LABEL[c.slot]}. Please choose someone.`,
        url: `/#/assign/${date}`,
        dedupeKey: `DUTY-SWAP-CIC:${date}:${c.slot}:${c.fromId}:${Date.now()}`,
      });
    }
  }
}

module.exports = { computeDuties, recordDuties, refreshDuties, announceRefresh, handOverDuties, pick, DUTY_TYPES };
