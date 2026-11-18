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
    const s = readSession(event);
    const cic = s && s.role === 'ADMIN';
    // a preview of a later day assumes the earlier unconfirmed picks happen first (no repeated names)
    let prior = [];
    const today = riyadhToday();
    if (date > today) {
      let day = today;
      const seen = [];
      for (let i = 0; i < 6 && day < date; i++) {
        if (isWorkday(day)) {
          const p = await computeDuties(day, seen);
          for (const x of [p.instruments.AM, p.instruments.PM, ...p.crash]) if (x && !x.recorded && !x.cic) seen.push(x.staff_id);
        }
        day = new Date(Date.parse(day + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
      }
      prior = seen;
    }
    const d = await computeDuties(date, prior);
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
    // changing a preview: confirm the day's picks first, so the person passed over is on record
    // (her turn counts as taken and she goes to the back of the queue)
    if (!b.replace_log_id && b.replace_staff_id && Number(b.replace_staff_id) !== sid) {
      const r = await recordDuties(b.date, `system · duty rotation (confirmed by ${user.name})`);
      const d = r.duties;
      const cur = slot === 'CRASH' ? d.crash.find((c) => c.staff_id === Number(b.replace_staff_id)) : d.instruments[slot === 'INST_PM' ? 'PM' : 'AM'];
      if (cur && cur.recorded && cur.staff_id === Number(b.replace_staff_id)) b.replace_log_id = cur.log_id;
    }
    if (b.replace_log_id) entries.push({ session: slot === 'INST_PM' ? 'PM' : 'AM', staff_id: Number(b.replace_staff_id) || sid, type_code: slot === 'CRASH' ? 'CRASH_CART' : 'INSTRUMENTS', supersedes_log_id: Number(b.replace_log_id), action: 'CANCEL', notes: 'replaced by CIC' });
    entries.push({ session: slot === 'INST_PM' ? 'PM' : 'AM', staff_id: sid, type_code: slot === 'CRASH' ? 'CRASH_CART' : 'INSTRUMENTS', notes: 'set by CIC' });
    await writeEntries({ workDate: b.date, entries, recordedBy: by });
    const label = slot === 'CRASH' ? 'Crash cart check before 8:30' : slot === 'INST_AM' ? 'AM instruments from CSSD at 8:40' : 'PM instruments from CSSD at 12:40';
    await notifyStaff(sid, { eventType: 'DAILY_DUTY', title: 'Your duty today', body: label, url: `/#/assign/${b.date}`, dedupeKey: `DUTY:${b.date}:${slot}:${sid}:${Date.now()}`, notBefore: `${b.date} 07:30` });
    return json(200, { ok: true, duties: await computeDuties(b.date) });
  }
  throw new HttpError(400, 'Unknown action.');
});
