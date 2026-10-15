// GET /api/push-key — the public key a phone needs to subscribe to notifications.
const { handler, json } = require('./lib/http');
exports.handler = handler(['GET'], async () => json(200, { publicKey: process.env.VAPID_PUBLIC_KEY || null }));
