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

// Send one message to every active device of one staff member.
async function notifyStaff(staffId, { eventType, title, body, url = '/', dedupeKey, equipmentId = null, assignmentLogId = null }) {
  const key = dedupeKey || `${eventType}:${staffId}:${Date.now()}`;
  const already = await query('SELECT COUNT(*) AS n FROM notification_log WHERE dedupe_key = :k', { k: key.slice(0, 200) });
  if (already[0] && Number(already[0].n) > 0) return { status: 'DUPLICATE' };

  const subs = await query(`
    SELECT subscription_id, endpoint, p256dh_key, auth_key
      FROM push_subscriptions WHERE staff_id = :sid AND is_active = 'Y'`, { sid: staffId });

  if (!subs.length) {
    await logNotification({ eventType, staffId, dedupeKey: key, status: 'SKIPPED_NO_DEVICE', body, equipmentId, assignmentLogId });
    return { status: 'SKIPPED_NO_DEVICE' };
  }
  if (!configure()) {
    await logNotification({ eventType, staffId, dedupeKey: key, status: 'FAILED', body, error: 'VAPID keys not set', equipmentId, assignmentLogId });
    return { status: 'FAILED' };
  }

  const payload = JSON.stringify({ title, body, url });
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
  const status = sent ? 'SENT' : 'FAILED';
  await logNotification({ eventType, staffId, dedupeKey: key, status, body, recipient: `${sent}/${subs.length} devices`, error: sent ? null : lastErr, equipmentId, assignmentLogId });
  return { status, sent };
}

async function notifyCic(message) {
  const cics = await query(`SELECT staff_id FROM staff WHERE app_role = 'ADMIN' AND employment_status = 'ACTIVE'`);
  const out = [];
  for (const c of cics) out.push(await notifyStaff(c.staff_id, { ...message, dedupeKey: message.dedupeKey ? `${message.dedupeKey}:ST${c.staff_id}` : undefined }));
  return out;
}

module.exports = { notifyStaff, notifyCic, logNotification };
