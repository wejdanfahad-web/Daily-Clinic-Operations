// Scheduled every day at 16:00 Riyadh (see netlify.toml): records tomorrow's daily duties
// (Instruments AM/PM + Crash cart). Staff are told at 07:30 on the day (held until then).
const { recordDuties, refreshDuties, announceRefresh } = require('./lib/duties');
const { notifyStaff } = require('./lib/push');
const { riyadhToday } = require('./lib/http');

exports.handler = async () => {
  const date = riyadhToday(1);
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  if (dow === 5 || dow === 6) return { statusCode: 200, body: 'no clinics tomorrow' };
  // fix any duty already recorded for tomorrow whose holder is now away, then record the rest
  try { await announceRefresh(date, await refreshDuties(date, 'system · duty rotation'), riyadhToday()); } catch (e) { console.error('duty refresh', e.message); }
  const { written, duties } = await recordDuties(date, 'system · duty rotation');
  const fresh = new Set(written.map((w) => Number(w.staff_id)));
  const label = { AM: 'AM instruments from CSSD at 8:40', PM: 'PM instruments from CSSD at 12:40' };
  const notBefore = `${date} 07:30`;
  const sent = [];
  for (const sess of ['AM', 'PM']) {
    const p = duties.instruments[sess];
    if (p && fresh.has(p.staff_id)) sent.push(await notifyStaff(p.staff_id, { eventType: 'DAILY_DUTY', title: 'Your duty today', body: label[sess], url: `/#/assign/${date}`, dedupeKey: `DUTY:${date}:INST_${sess}:${p.staff_id}`, notBefore }));
  }
  for (const c of duties.crash.filter((x) => fresh.has(x.staff_id))) sent.push(await notifyStaff(c.staff_id, { eventType: 'DAILY_DUTY', title: 'Your duty today', body: 'Crash cart check before 8:30', url: `/#/assign/${date}`, dedupeKey: `DUTY:${date}:CRASH:${c.staff_id}`, notBefore }));
  console.log('duties-cron', date, JSON.stringify(duties), sent.map((s) => s.status));
  return { statusCode: 200, body: JSON.stringify({ date, duties }) };
};
