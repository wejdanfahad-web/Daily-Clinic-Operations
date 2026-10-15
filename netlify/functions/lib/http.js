// Shared request/response helpers, signed session cookies and role checks.
const crypto = require('crypto');
const { DbError, one } = require('./db');

const COOKIE = 'endo_session';
const SESSION_HOURS = 12;

function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

// Public read endpoints: let Netlify's CDN cache them briefly so a whole clinic
// opening the page at 8:30 doesn't hit the database dozens of times.
function cachedJson(body, seconds = 60) {
  return json(200, body, {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Netlify-CDN-Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`,
    // signed-in people (CIC sees days ahead) never share a cached copy with the public
    'Netlify-Vary': 'query,cookie=endo_session',
  });
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new HttpError(500, 'SESSION_SECRET is missing or shorter than 32 characters.');
  return s;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function signSession(payload) {
  const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + SESSION_HOURS * 3600e3 }));
  const sig = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
  return body + '.' + sig;
}

function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readSession(event) {
  const header = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)').exec(header);
  return m ? verifySession(m[1]) : null;
}

// Throws unless signed in. A user still on a temporary password may only change it.
function requireUser(event, { allowMustChange = false } = {}) {
  const s = readSession(event);
  if (!s) throw new HttpError(401, 'Please sign in.');
  if (s.mustChange && !allowMustChange) throw new HttpError(403, 'Please set a new password first.');
  return s;
}

function requireCic(event) {
  const s = requireUser(event);
  if (s.role !== 'ADMIN') throw new HttpError(403, 'Only the CIC can do this.');
  return s;
}

// CIC always; otherwise the staff member who is "In charge" right now (derived live from the log).
async function requireCicOrInCharge(event) {
  const s = requireUser(event);
  if (s.role === 'ADMIN') return { ...s, inCharge: false };
  const row = await one('SELECT session_code FROM v_active_in_charge WHERE staff_id = :sid FETCH FIRST 1 ROWS ONLY', { sid: s.sid });
  if (!row) throw new HttpError(403, 'Only the CIC or the staff member in charge this session can do this.');
  return { ...s, inCharge: true, inChargeSession: row.session_code };
}

// Riyadh calendar date as YYYY-MM-DD.
function riyadhToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400e3);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Riyadh wall-clock time "HH:MM"
function riyadhTime(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}
// A day's schedule and duties are shown to staff (and the public) only from 07:30 Riyadh on that day.
// The CIC sees and confirms everything ahead of time.
const STAFF_RELEASE = '07:30';
function releasedToStaff(date) {
  const today = riyadhToday();
  if (date < today) return true;
  if (date > today) return false;
  return riyadhTime() >= STAFF_RELEASE;
}

const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));

// Wrap a handler: method check + uniform error responses.
function handler(methods, fn) {
  return async (event, context) => {
    if (!methods.includes(event.httpMethod)) return json(405, { error: 'Method not allowed.' }, { Allow: methods.join(', ') });
    try {
      return await fn(event, context);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      if (err instanceof DbError) return json(err.status, { error: err.message });
      console.error(err);
      return json(500, { error: 'Something went wrong. Please try again.' });
    }
  };
}

module.exports = {
  json, cachedJson, parseBody, HttpError, handler,
  signSession, verifySession, sessionCookie, clearCookie, readSession,
  requireUser, requireCic, requireCicOrInCharge, riyadhToday, riyadhTime, releasedToStaff, STAFF_RELEASE, isIsoDate,
};
