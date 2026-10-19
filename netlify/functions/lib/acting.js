// Who is acting as CIC right now: the staff assigned "In charge" on a working day, from 15:00 on the
// previous working day until the end of the session they are in charge of (AM 13:00, PM/DAY 16:30).
const { query } = require('./db');

const SESSION_END = { AM: '13:00', PM: '16:30', DAY: '16:30' };
const FROM_TIME = '15:00';
const isWorkday = (iso) => { const d = new Date(iso + 'T12:00:00Z').getUTCDay(); return d !== 5 && d !== 6; };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const prevWorkday = (iso) => { let d = addDays(iso, -1); while (!isWorkday(d)) d = addDays(d, -1); return d; };
const riyadh = (now) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

// rows: [{ staff_id, work_date 'YYYY-MM-DD', session_code }] -> Set of staff ids acting now
function actingFrom(rows, now) {
  const stamp = riyadh(now);
  const end = new Map();     // staff|date -> latest session end that day
  for (const r of rows) {
    const k = `${r.staff_id}|${r.work_date}`;
    const e = SESSION_END[r.session_code] || '16:30';
    if (!end.has(k) || end.get(k) < e) end.set(k, e);
  }
  const ids = new Set();
  for (const [k, e] of end) {
    const [sid, date] = k.split('|');
    const start = `${prevWorkday(date)} ${FROM_TIME}`;
    if (stamp >= start && stamp < `${date} ${e}`) ids.add(Number(sid));
  }
  return ids;
}

// In-charge rows from today up to 4 days ahead (covers a Thursday -> Sunday weekend).
async function actingStaff(now = new Date(), staffId = null) {
  const today = riyadh(now).slice(0, 10);
  const rows = await query(`
    SELECT staff_id, TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date, session_code
      FROM v_assignments_current
     WHERE type_code = 'IN_CHARGE'
       AND work_date BETWEEN TO_DATE(:d, 'YYYY-MM-DD') AND TO_DATE(:d, 'YYYY-MM-DD') + 4
       AND (:sid IS NULL OR staff_id = :sid)`, { d: today, sid: staffId });
  return actingFrom(rows, now);
}

module.exports = { actingStaff, actingFrom, prevWorkday };
