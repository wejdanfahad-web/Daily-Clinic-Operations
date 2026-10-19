// Free web-push notifications to staff phones (the app added to the home screen).
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  – generate once with: npx web-push generate-vapid-keys
//   VAPID_SUBJECT                          – mailto:you@example.com
// Every attempt is written to NOTIFICATION_LOG. A staff member with no device is logged as
// SKIPPED_NO_DEVICE rather than silently dropped. dedupe_key stops double sends.
const webpush = require('web-push');
const { query, exec } = require('./db');

let configured = false;
function configure() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

// Returns false if this dedupe_key was already logged (so the caller skips sending).
async function logNotification({ eventType, staffId, dedupeKey, status, body, recipient = null, error = null, equipmentId = null, assignmentLogId = null }) {
  const res = await query(`
    SELECT COUNT(*) AS n FROM notification_log WHERE dedupe_key = :k`, { k: dedupeKey });
  if (res[0] && Number(res[0].n) > 0) return false;
  await exec(`
    BEGIN
      INSERT INTO notification_log (channel, event_type, staff_id, recipient, equipment_id, assignment_log_id,
                                    dedupe_key, status, message_body, error_message, sent_at)
      VALUES ('PUSH', :ev, :sid, :rcp, :eq, :al, :k, :st, :body, :err,
              CASE WHEN :st = 'SENT' THEN SYSTIMESTAMP END);
      COMMIT;
    EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
    END;`, {
    ev: eventType, sid: staffId ?? null, rcp: recipient, eq: equipmentId, al: assignmentLogId,
    k: dedupeKey.slice(0, 200), st: status, body: (body || '').slice(0, 1600), err: error ? String(error).slice(0, 1000) : null,
  });
  return true;
}

// Quiet hours: nothing is ever sent between 16:30 and 07:30 Riyadh time. Messages created then are
// stored as PENDING and delivered by flushPending() at 07:30 (ppm-check runs it every morning).
const QUIET_FROM = '16:30';
const QUIET_UNTIL = '07:30';
function riyadhClock(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}
let clock = () => new Date();            // replaceable in tests
const _setClock = (fn) => { clock = fn || (() => new Date()); };
const riyadhStamp = (now = clock()) => `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)} ${riyadhClock(now)}`;
const isQuietTime = (now = clock()) => { const t = riyadhClock(now); return t >= QUIET_FROM || t < QUIET_UNTIL; };

// Push one payload to every active device of one staff member.
async function sendToDevices(staffId, payload) {
  const subs = await query(`
    SELECT subscription_id, endpoint, p256dh_key, auth_key
      FROM push_subscriptions WHERE staff_id = :sid AND is_active = 'Y'`, { sid: staffId });
  if (!subs.length) return { status: 'SKIPPED_NO_DEVICE', sent: 0, total: 0 };
  if (!configure()) return { status: 'FAILED', sent: 0, total: subs.length, error: 'VAPID keys not set' };
  let sent = 0, lastErr = null;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } }, payload, { TTL: 6 * 3600 });
      sent++;
      await exec(`BEGIN UPDATE push_subscriptions SET last_success_at = SYSTIMESTAMP WHERE subscription_id = :id; COMMIT; END;`, { id: s.subscription_id });
    } catch (e) {
      lastErr = e.body || e.message;
      // 404/410 = the browser unsubscribed or the app was removed: stop using this device.
      if (e.statusCode === 404 || e.statusCode === 410) {
        await exec(`BEGIN UPDATE push_subscriptions SET is_active = 'N' WHERE subscription_id = :id; COMMIT; END;`, { id: s.subscription_id });
      }
    }
  }
  return { status: sent ? 'SENT' : 'FAILED', sent, total: subs.length, error: sent ? null : lastErr };
}

// Send one message to a staff member (or hold it until 07:30 during quiet hours).
// notBefore: 'YYYY-MM-DD HH:MM' Riyadh — never deliver before then (e.g. a day's schedule at 07:30 on that day).
async function notifyStaff(staffId, { eventType, title, body, url = '/', dedupeKey, equipmentId = null, assignmentLogId = null, notBefore = null }) {
  const key = dedupeKey || `${eventType}:${staffId}:${Date.now()}`;
  const already = await query('SELECT COUNT(*) AS n FROM notification_log WHERE dedupe_key = :k', { k: key.slice(0, 200) });
  if (already[0] && Number(already[0].n) > 0) return { status: 'DUPLICATE' };

  if (isQuietTime() || (notBefore && riyadhStamp() < notBefore)) {
    await logNotification({ eventType, staffId, dedupeKey: key, status: 'PENDING', body: JSON.stringify({ title, body, url, notBefore }).slice(0, 1600), equipmentId, assignmentLogId });
    return { status: 'QUEUED' };
  }
  const r = await sendToDevices(staffId, JSON.stringify({ title, body, url }));
  await logNotification({ eventType, staffId, dedupeKey: key, status: r.status, body, recipient: r.total ? `${r.sent}/${r.total} devices` : null, error: r.error, equipmentId, assignmentLogId });
  return { status: r.status, sent: r.sent };
}

// Deliver messages held during quiet hours. Safe to run any time; does nothing during quiet hours.
async function flushPending() {
  if (isQuietTime()) return { sent: 0, held: true };
  const rows = await query(`
    SELECT notification_id, staff_id, message_body,
           CASE WHEN created_at < SYSTIMESTAMP - INTERVAL '2' DAY THEN 'Y' ELSE 'N' END AS is_old
      FROM notification_log
     WHERE status = 'PENDING' AND channel = 'PUSH' AND created_at > SYSTIMESTAMP - INTERVAL '30' DAY
     ORDER BY created_at`, {}, { limit: 1000 });
  let sent = 0;
  const now = riyadhStamp();
  for (const r of rows) {
    let msg = {};
    try { msg = JSON.parse(r.message_body || '{}'); } catch { msg = { title: 'ENDO Clinic', body: r.message_body }; }
    if (msg.notBefore && now < msg.notBefore) continue;            // not its day yet
    const dayPassed = msg.notBefore ? now.slice(0, 10) > msg.notBefore.slice(0, 10) : r.is_old === 'Y';
    if (dayPassed) {                                                // too late to be useful
      await exec(`BEGIN UPDATE notification_log SET status = 'FAILED', error_message = 'Expired before it could be delivered' WHERE notification_id = :id; COMMIT; END;`, { id: r.notification_id });
      continue;
    }
    const res = await sendToDevices(r.staff_id, JSON.stringify({ title: msg.title || 'ENDO Clinic', body: msg.body || '', url: msg.url || '/' }));
    if (res.status === 'SENT') sent++;
    await exec(`BEGIN UPDATE notification_log SET status = :st, message_body = :b, recipient = :rc, error_message = :er,
                       sent_at = CASE WHEN :st = 'SENT' THEN SYSTIMESTAMP END WHERE notification_id = :id; COMMIT; END;`,
    { st: res.status, b: String(msg.body || '').slice(0, 1600), rc: res.total ? `${res.sent}/${res.total} devices` : null, er: res.error ? String(res.error).slice(0, 1000) : null, id: r.notification_id });
  }
  await exec(`BEGIN UPDATE notification_log SET status = 'FAILED', error_message = 'Expired while waiting for working hours'
               WHERE status = 'PENDING' AND created_at <= SYSTIMESTAMP - INTERVAL '30' DAY; COMMIT; END;`);
  return { sent, total: rows.length };
}

async function notifyCic(message) {
  // the CIC, plus whoever is acting as CIC right now (in charge: from 15:00 the day before)
  const admins = await query(`SELECT staff_id FROM staff WHERE app_role = 'ADMIN' AND employment_status = 'ACTIVE'`);
  const ids = new Set(admins.map((a) => Number(a.staff_id)));
  try { for (const id of await require('./acting').actingStaff(clock())) ids.add(id); } catch { /* CIC still told */ }
  const cics = [...ids].map((staff_id) => ({ staff_id }));
  const out = [];
  for (const c of cics) out.push(await notifyStaff(c.staff_id, { ...message, dedupeKey: message.dedupeKey ? `${message.dedupeKey}:ST${c.staff_id}` : undefined }));
  return out;
}

module.exports = { notifyStaff, notifyCic, logNotification, flushPending, isQuietTime, riyadhClock, sendToDevices, _setClock, riyadhDate: () => riyadhStamp().slice(0, 10) };
