// POST /api/push-subscribe { subscription: { endpoint, keys: { p256dh, auth } }, label }
// Saves this phone/browser so the signed-in staff member can receive notifications.
const { exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireUser } = require('./lib/http');

exports.handler = handler(['POST'], async (event) => {
  const user = requireUser(event);
  const { subscription, label } = parseBody(event);
  const ep = subscription && subscription.endpoint;
  const keys = (subscription && subscription.keys) || {};
  if (!ep || !/^https:\/\//.test(ep) || !keys.p256dh || !keys.auth) throw new HttpError(400, 'Invalid push subscription.');

  await exec(`
    BEGIN
      MERGE INTO push_subscriptions t USING (SELECT :ep AS endpoint FROM dual) s ON (t.endpoint = s.endpoint)
      WHEN MATCHED THEN UPDATE SET staff_id = :sid, p256dh_key = :p, auth_key = :a, device_label = :l, is_active = 'Y'
      WHEN NOT MATCHED THEN INSERT (staff_id, endpoint, p256dh_key, auth_key, device_label) VALUES (:sid, :ep, :p, :a, :l);
      COMMIT;
    END;`, { ep: ep.slice(0, 1000), sid: user.sid, p: String(keys.p256dh).slice(0, 200), a: String(keys.auth).slice(0, 100), l: label ? String(label).slice(0, 100) : null });
  return json(200, { ok: true });
});
