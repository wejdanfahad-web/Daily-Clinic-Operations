// Announcements from the CIC to all staff or chosen staff: a phone notification (held until 07:30 when
// sent in quiet hours) and a note shown in the app for 14 days.
//
// GET  /api/announce            signed-in staff: announcements for me (last 14 days)
// GET  /api/announce?list=sent  CIC: the last 15 sent, with who they went to
// POST /api/announce { title?, message, to: "ALL" | [staff_id, ...] }   CIC
const { query, one, exec } = require('./lib/db');
const { notifyStaff, isQuietTime } = require('./lib/push');
const { ensureSchema } = require('./lib/migrate');
const { handler, json, parseBody, HttpError, requireUser, requireCic } = require('./lib/http');

exports.handler = handler(['GET', 'POST'], async (event) => {
  await ensureSchema();
  const q = event.queryStringParameters || {};

  if (event.httpMethod === 'GET' && q.list === 'sent') {
    requireCic(event);
    const rows = await query(`
      SELECT announcement_id, title, message, audience, audience_label, sent_by,
             TO_CHAR(CAST(sent_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS sent_at
        FROM announcements ORDER BY announcement_id DESC FETCH FIRST 15 ROWS ONLY`);
    return json(200, { announcements: rows });
  }
  if (event.httpMethod === 'GET') {
    const user = requireUser(event);
    const rows = await query(`
      SELECT announcement_id, title, message, sent_by,
             TO_CHAR(CAST(sent_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS sent_at
        FROM announcements
       WHERE sent_at > SYSTIMESTAMP - INTERVAL '14' DAY
         AND (audience = 'ALL' OR INSTR(',' || audience || ',', ',' || :sid || ',') > 0)
       ORDER BY announcement_id DESC FETCH FIRST 10 ROWS ONLY`, { sid: String(user.sid) });
    return json(200, { announcements: rows });
  }

  const user = requireCic(event);
  const b = parseBody(event);
  const title = b.title ? String(b.title).trim().slice(0, 80) : '';
  const message = String(b.message || '').trim().slice(0, 500);
  if (message.length < 2) throw new HttpError(400, 'Write the message.');
  let staff;
  if (b.to === 'ALL') {
    staff = await query(`SELECT staff_id, display_name FROM staff WHERE employment_status = 'ACTIVE' AND app_role <> 'ADMIN'`);
  } else {
    const ids = (Array.isArray(b.to) ? b.to : []).map(Number).filter(Boolean).slice(0, 200);
    if (!ids.length) throw new HttpError(400, 'Choose who gets it: all staff or at least one person.');
    staff = await query(`SELECT staff_id, display_name FROM staff WHERE employment_status = 'ACTIVE'
                          AND staff_id IN (${ids.map((_, i) => ':i' + i).join(',')})`,
      Object.fromEntries(ids.map((v, i) => ['i' + i, v])));
    if (!staff.length) throw new HttpError(400, 'None of the chosen staff are active.');
  }
  const audience = b.to === 'ALL' ? 'ALL' : staff.map((s) => s.staff_id).join(',');
  const label = b.to === 'ALL' ? 'All staff' : staff.map((s) => s.display_name).join(', ').slice(0, 400);
  const by = user.name;
  await exec(`BEGIN INSERT INTO announcements (title, message, audience, audience_label, sent_by) VALUES (:t, :m, :a, :l, :by); COMMIT; END;`,
    { t: title || null, m: message, a: audience, l: label, by });
  const row = await one(`SELECT MAX(announcement_id) AS id FROM announcements WHERE sent_by = :by`, { by });

  const counts = {};
  for (const s of staff) {
    const r = await notifyStaff(s.staff_id, {
      eventType: 'ANNOUNCEMENT', title: title || 'Announcement from the CIC', body: message, url: '/#/assign',
      dedupeKey: `ANN:${row ? row.id : Date.now()}:ST${s.staff_id}`,
    });
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  return json(200, {
    ok: true, recipients: staff.length, held: isQuietTime(),
    delivered: counts.SENT || 0, queued: counts.QUEUED || 0, no_phone: counts.SKIPPED_NO_DEVICE || 0, failed: counts.FAILED || 0,
  });
});
