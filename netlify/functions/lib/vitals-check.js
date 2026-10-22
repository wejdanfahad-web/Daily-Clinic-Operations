// 15 minutes before each session (AM 08:45, PM 12:45 Riyadh) the CIC is told if nobody is on Vitals.
// Fridays and Saturdays are skipped. Used by vitals-check-am.js and vitals-check-pm.js.
const { query } = require('./db');
const { notifyCic, riyadhDate } = require('./push');

const isWorkday = (iso) => { const d = new Date(iso + 'T12:00:00Z').getUTCDay(); return d !== 5 && d !== 6; };

async function checkVitals(sess) {
  const today = riyadhDate();
  if (!isWorkday(today)) return { statusCode: 200, body: JSON.stringify({ today, sess, skipped: 'weekend' }) };
  const r = await query(`
    SELECT COUNT(*) AS n FROM v_assignments_current
     WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND type_code = 'VITALS' AND session_code IN (:s, 'DAY')`, { d: today, s: sess });
  const n = Number((r[0] || {}).n || 0);
  if (n > 0) return { statusCode: 200, body: JSON.stringify({ today, sess, vitals: n }) };
  const sent = await notifyCic({
    eventType: 'SCHEDULE_CHANGE',
    title: 'No Vitals assigned',
    body: `${sess} session starts at ${sess === 'AM' ? '9:00' : '1:00'} and nobody is on Vitals.`,
    url: `/#/assign/${today}`,
    dedupeKey: `NOVITALS:${today}:${sess}`,
  });
  console.log('vitals-check', today, sess, sent.map((x) => x.status));
  return { statusCode: 200, body: JSON.stringify({ today, sess, vitals: 0, notified: sent.length }) };
}

module.exports = { checkVitals };
