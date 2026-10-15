// Daily duties (Instruments AM/PM + Crash cart) for a day.
// GET  /api/duties?date=YYYY-MM-DD      everyone; the "passed over" details only for the CIC
// POST /api/duties (CIC)
//   { action: "record", date }                          record today's/that day's picks now
//   { action: "set", date, slot: "INST_AM"|"INST_PM"|"CRASH", staff_id, replace_log_id }   manual change
const { readSession, handler, json, cachedJson, parseBody, HttpError, isIsoDate, riyadhToday, requireCic } = require('./lib/http');
const { computeDuties, recordDuties } = require('./lib/duties');
const { writeEntries } = require('./lib/assignments');
const { notifyStaff } = require('./lib/push');

const isWorkday = (iso) => { const d = new Date(iso + 'T12:00:00Z').getUTCDay(); return d !== 5 && d !== 6; };

exports.handler = handler(['GET', 'POST'], async (event) => {
  if (event.httpMethod === 'GET') {
    const date = (event.queryStringParameters || {}).date || riyadhToday();
    if (!isIsoDate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD.');
    if (!isWorkday(date)) return cachedJson({ date, closed: true }, 300);
    const d = await computeDuties(date);
    const s = readSession(event);
    const cic = s && s.role === 'ADMIN';
    const body = { date, instruments: d.instruments, crash: d.crash, allRecorded: d.allRecorded, skipped: cic ? d.skipped : undefined };
    return cic ? json(200, body) : cachedJson(body, 60);
  }

  const user = requireCic(event);
  const b = parseBody(event);
  if (!isIsoDate(b.date)) throw new HttpError(400, 'date must be YYYY-MM-DD.');
  if (b.date < riyadhToday()) throw new HttpError(400, 'That day has passed.');
  const by = `${user.name} (#${user.sid})`;

  if (b.action === 'record') {
    const r = await recordDuties(b.date, by);
    return json(200, { ok: true, written: r.written.length, duties: r.duties });
  }
  if (b.action === 'set') {
    const sid = Number(b.staff_id);
    const slot = String(b.slot || '');
    if (!sid || !['INST_AM', 'INST_PM', 'CRASH'].includes(slot)) throw new HttpError(400, 'Choose the duty and the staff member.');
    const entries = [];
    if (b.replace_log_id) entries.push({ session: slot === 'INST_PM' ? 'PM' : 'AM', staff_id: Number(b.replace_staff_id) || sid, type_code: slot === 'CRASH' ? 'CRASH_CART' : 'INSTRUMENTS', supersedes_log_id: Number(b.replace_log_id), action: 'CANCEL' });
    entries.push({ session: slot === 'INST_PM' ? 'PM' : 'AM', staff_id: sid, type_code: slot === 'CRASH' ? 'CRASH_CART' : 'INSTRUMENTS', notes: 'set by CIC' });
    await writeEntries({ workDate: b.date, entries, recordedBy: by });
    const label = slot === 'CRASH' ? 'Crash cart check before 8:30' : slot === 'INST_AM' ? 'AM instruments from CSSD at 8:40' : 'PM instruments from CSSD at 12:40';
    await notifyStaff(sid, { eventType: 'DAILY_DUTY', title: 'Daily duty', body: `${b.date}: ${label}`, url: `/#/assign/${b.date}`, dedupeKey: `DUTY:${b.date}:${slot}:${sid}:${Date.now()}` });
    return json(200, { ok: true, duties: await computeDuties(b.date) });
  }
  throw new HttpError(400, 'Unknown action.');
});
