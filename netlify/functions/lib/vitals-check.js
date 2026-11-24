// 15 minutes before each session (AM 08:45, PM 12:45 Riyadh) the CIC is told if nobody is on Vitals,
// or nobody is on Screening while 18 clinics or fewer are in use.
// Fridays and Saturdays are skipped. Used by vitals-check-am.js and vitals-check-pm.js.
const { query } = require('./db');
const { notifyCic, riyadhDate } = require('./push');

const isWorkday = (iso) => { const d = new Date(iso + 'T12:00:00Z').getUTCDay(); return d !== 5 && d !== 6; };

// Screening (CIC, Nov 2026): also needed in every session, unless more than 18 clinics are in use.
const SCREENING_FREE_ABOVE = 18;

async function checkVitals(sess) {
  const today = riyadhDate();
  if (!isWorkday(today)) return { statusCode: 200, body: JSON.stringify({ today, sess, skipped: 'weekend' }) };
  const r = await query(`
    SELECT COUNT(*) AS n FROM v_assignments_current
     WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND type_code = 'VITALS' AND session_code IN (:s, 'DAY')`, { d: today, s: sess });
  const n = Number((r[0] || {}).n || 0);
  const sc = await query(`
    SELECT SUM(CASE WHEN type_code = 'SCREENING' THEN 1 ELSE 0 END) AS screening,
           COUNT(DISTINCT CASE WHEN category = 'CLINICAL' OR type_code = 'SURGERY' THEN clinic_id END) AS clinics
      FROM v_assignments_current
     WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND session_code IN (:s, 'DAY')`, { d: today, s: sess }).catch(() => []);
  const screening = Number((sc[0] || {}).screening || 0);
  const clinics = Number((sc[0] || {}).clinics || 0);
  const needScreening = !screening && clinics <= SCREENING_FREE_ABOVE;
  const start = sess === 'AM' ? '9:00' : '1:00';
  let sent = [];
  if (!n) sent = sent.concat(await notifyCic({
    eventType: 'SCHEDULE_CHANGE', title: 'No Vitals assigned',
    body: `${sess} session starts at ${start} and nobody is on Vitals.`,
    url: `/#/assign/${today}`, dedupeKey: `NOVITALS:${today}:${sess}`,
  }));
  if (needScreening) sent = sent.concat(await notifyCic({
    eventType: 'SCHEDULE_CHANGE', title: 'No Screening assigned',
    body: `${sess} session starts at ${start} and nobody is on Screening (${clinics} clinics in use).`,
    url: `/#/assign/${today}`, dedupeKey: `NOSCREENING:${today}:${sess}`,
  }));
  console.log('vitals-check', today, sess, n, screening, clinics, sent.map((x) => x.status));
  return { statusCode: 200, body: JSON.stringify({ today, sess, vitals: n, screening, clinics, notified: sent.length }) };
}

module.exports = { checkVitals, SCREENING_FREE_ABOVE };
