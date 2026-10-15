// POST /api/push-test — send a test notification to the signed-in user's own devices.
// Respects quiet hours (16:30–07:30): nothing is sent then, the app shows a local test instead.
const { sendToDevices, isQuietTime } = require('./lib/push');
const { handler, json, requireUser } = require('./lib/http');

exports.handler = handler(['POST'], async (event) => {
  const user = requireUser(event);
  if (isQuietTime()) return json(200, { status: 'QUIET_HOURS' });
  const r = await sendToDevices(user.sid, JSON.stringify({ title: 'ENDO Clinic · test', body: 'Notifications work on this device.', url: '/' }));
  return json(200, { status: r.status, sent: r.sent || 0, total: r.total || 0 });
});
