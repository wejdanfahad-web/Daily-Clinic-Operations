// Scheduled every day at 14:00 Riyadh (see netlify.toml), before quiet hours: tells the CIC when the
// schedule for the next two working days is not published yet. A day counts as published once it has
// any assignment other than the automatic Instruments / Crash cart duties (a published plan or
// cells filled on the board). Fridays and Saturdays are skipped.
const { query } = require('./lib/db');
const { notifyCic, riyadhDate } = require('./lib/push');

const isWorkday = (iso) => { const d = new Date(iso + 'T12:00:00Z').getUTCDay(); return d !== 5 && d !== 6; };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

exports.handler = async () => {
  const today = riyadhDate();
  if (!isWorkday(today)) return { statusCode: 200, body: 'weekend' };
  const days = [];
  for (let d = addDays(today, 1); days.length < 2; d = addDays(d, 1)) if (isWorkday(d)) days.push(d);

  const missing = [];
  for (const d of days) {
    const r = await query(`
      SELECT COUNT(*) AS n FROM v_assignments_current
       WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND type_code NOT IN ('INSTRUMENTS', 'CRASH_CART')`, { d });
    if (!r[0] || Number(r[0].n) === 0) missing.push(d);
  }
  if (!missing.length) return { statusCode: 200, body: JSON.stringify({ today, missing }) };

  const sent = await notifyCic({
    eventType: 'SCHEDULE_CHANGE',
    title: 'Schedule not published yet',
    body: `${missing.map(label).join(' and ')}: no schedule yet. Plan it in the Schedule Planner and publish.`,
    url: `/#/planner/${missing[0]}`,
    dedupeKey: `UNPUBLISHED:${today}:${missing.join(',')}`,
  });
  console.log('publish-check', today, missing, sent.map((s) => s.status));
  return { statusCode: 200, body: JSON.stringify({ today, missing }) };
};
