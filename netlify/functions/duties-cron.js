// Scheduled every day at 16:00 Riyadh, before the 16:30 quiet hours (see netlify.toml): records tomorrow's daily duties
// (Instruments AM/PM + Crash cart) and notifies each person on her phone.
const { recordDuties } = require('./lib/duties');
const { notifyStaff } = require('./lib/push');
const { riyadhToday } = require('./lib/http');

exports.handler = async () => {
  const date = riyadhToday(1);
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  if (dow === 5 || dow === 6) return { statusCode: 200, body: 'no clinics tomorrow' };
  const { duties } = await recordDuties(date, 'system · duty rotation');
  const label = { AM: 'AM instruments from CSSD at 8:40', PM: 'PM instruments from CSSD at 12:40' };
  const sent = [];
  for (const sess of ['AM', 'PM']) {
    const p = duties.instruments[sess];
    if (p) sent.push(await notifyStaff(p.staff_id, { eventType: 'DAILY_DUTY', title: 'Tomorrow\'s duty', body: `${date}: ${label[sess]}`, url: `/#/assign/${date}`, dedupeKey: `DUTY:${date}:INST_${sess}:${p.staff_id}` }));
  }
  for (const c of duties.crash) sent.push(await notifyStaff(c.staff_id, { eventType: 'DAILY_DUTY', title: 'Tomorrow\'s duty', body: `${date}: Crash cart check before 8:30`, url: `/#/assign/${date}`, dedupeKey: `DUTY:${date}:CRASH:${c.staff_id}` }));
  console.log('duties-cron', date, JSON.stringify(duties), sent.map((s) => s.status));
  return { statusCode: 200, body: JSON.stringify({ date, duties }) };
};
