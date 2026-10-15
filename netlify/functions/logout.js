// POST /api/logout
const { handler, json, clearCookie } = require('./lib/http');
exports.handler = handler(['POST'], async () => json(200, { ok: true }, { 'Set-Cookie': clearCookie() }));
