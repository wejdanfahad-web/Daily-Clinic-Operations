// Offline tests: a fake ORDS server answers the SQL the functions send, so we can check
// auth, validation, business rules and error handling without a real database.
// Run: npm test
const http = require('http');
const assert = require('assert');
const bcrypt = require('bcryptjs');

const calls = [];
let responder = () => ({ items: [{ resultSet: { items: [] } }] });

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body || '{}');
    calls.push({ auth: req.headers.authorization, ...j });
    const out = responder(j.statementText, Object.fromEntries((j.binds || []).map((b) => [b.name, b.value])));
    if (out && out.httpStatus) { res.writeHead(out.httpStatus); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

const rows = (items) => ({ items: [{ resultSet: { items } }] });
const done = (n = 1) => ({ items: [{ result: n }] });
const oraErr = (text) => ({ items: [{ errorCode: 20031, errorDetails: text }] });

let passed = 0, failed = 0;
async function t(name, fn) {
  calls.length = 0;
  try { await fn(); passed++; console.log('PASS ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n      ', e.message); }
}

function ev(method, { body, query, cookie } = {}) {
  return { httpMethod: method, body: body ? JSON.stringify(body) : null, queryStringParameters: query || {}, headers: cookie ? { cookie } : {} };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  process.env.ORDS_BASE_URL = `http://127.0.0.1:${server.address().port}/ords/endo/`;
  process.env.DB_USER = 'ENDO';
  process.env.DB_PASSWORD = 'secret';
  process.env.SESSION_SECRET = 'x'.repeat(40);
  const F = (n) => require('../netlify/functions/' + n).handler;
  const { signSession } = require('../netlify/functions/lib/http');
  const cic = 'endo_session=' + signSession({ sid: 1, name: 'Wejdan', role: 'ADMIN', mustChange: false });
  const staff = 'endo_session=' + signSession({ sid: 5, name: 'Haifa', role: 'STAFF', mustChange: false });
  const temp = 'endo_session=' + signSession({ sid: 5, name: 'Haifa', role: 'STAFF', mustChange: true });
  const hash = bcrypt.hashSync('Correct123', 4);

  await t('health: talks to ORDS with basic auth on /_/sql', async () => {
    responder = () => rows([{ STAFF: 18, DOCTORS: 48, CLINICS: 18, ASSIGNMENT_ROWS: 0, DB_TIME_RIYADH: '2026-10-15 17:00' }]);
    const r = await F('health')(ev('GET'));
    assert.strictEqual(r.statusCode, 200);
    const b = JSON.parse(r.body);
    assert.strictEqual(b.database.staff, 18, 'keys lower-cased');
    assert.strictEqual(calls[0].auth, 'Basic ' + Buffer.from('ENDO:secret').toString('base64'));
  });

  await t('health: database down → clear 503 message', async () => {
    responder = () => ({ httpStatus: 503 });
    const r = await F('health')(ev('GET'));
    assert.strictEqual(r.statusCode, 503);
    assert.match(JSON.parse(r.body).error, /not reachable/);
  });

  await t('login: correct password → cookie, failures reset', async () => {
    responder = (sql) => /FROM staff WHERE UPPER\(employee_no\)/.test(sql)
      ? rows([{ STAFF_ID: 5, DISPLAY_NAME: 'Haifa', APP_ROLE: 'STAFF', PASSWORD_HASH: hash, MUST_CHANGE_PW: 'Y', FAILED_LOGINS: 2, EMPLOYMENT_STATUS: 'ACTIVE', IS_LOCKED: 'N' }])
      : done();
    const r = await F('login')(ev('POST', { body: { employee_no: '12345', password: 'Correct123' } }));
    assert.strictEqual(r.statusCode, 200);
    assert.match(r.headers['Set-Cookie'], /endo_session=.+HttpOnly; Secure/);
    assert.strictEqual(JSON.parse(r.body).user.mustChange, true);
    assert(calls.some((c) => /failed_logins = 0/.test(c.statementText)));
  });

  await t('login: wrong password → counts attempt, says how many left', async () => {
    responder = (sql) => /FROM staff WHERE UPPER/.test(sql)
      ? rows([{ STAFF_ID: 5, DISPLAY_NAME: 'Haifa', APP_ROLE: 'STAFF', PASSWORD_HASH: hash, MUST_CHANGE_PW: 'N', FAILED_LOGINS: 3, EMPLOYMENT_STATUS: 'ACTIVE', IS_LOCKED: 'N' }])
      : done();
    const r = await F('login')(ev('POST', { body: { employee_no: '12345', password: 'nope' } }));
    assert.strictEqual(r.statusCode, 401);
    assert.match(JSON.parse(r.body).error, /1 attempt\(s\) left/);
    assert(calls.some((c) => /failed_logins \+ 1/.test(c.statementText)));
  });

  await t('login: locked account → 423', async () => {
    responder = () => rows([{ STAFF_ID: 5, PASSWORD_HASH: hash, IS_LOCKED: 'Y', LOCK_MINUTES_LEFT: 12, EMPLOYMENT_STATUS: 'ACTIVE' }]);
    const r = await F('login')(ev('POST', { body: { employee_no: '12345', password: 'Correct123' } }));
    assert.strictEqual(r.statusCode, 423);
    assert.match(JSON.parse(r.body).error, /12 minute/);
  });

  await t('login: unknown ID → same generic message', async () => {
    responder = () => rows([]);
    const r = await F('login')(ev('POST', { body: { employee_no: 'zzz', password: 'x' } }));
    assert.strictEqual(r.statusCode, 401);
    assert.match(JSON.parse(r.body).error, /not correct/);
  });

  await t('session: forged cookie is rejected', async () => {
    const r = await F('staff-admin')(ev('GET', { cookie: cic.slice(0, -3) + 'abc' }));
    assert.strictEqual(r.statusCode, 401);
  });

  await t('temporary password: blocked from everything except change-password', async () => {
    const r = await F('compliance')(ev('GET', { cookie: temp }));
    assert.strictEqual(r.statusCode, 403);
    assert.match(JSON.parse(r.body).error, /new password/);
  });

  await t('change-password: weak password refused', async () => {
    const r = await F('change-password')(ev('POST', { cookie: temp, body: { current_password: 'Abc12345x', new_password: 'short' } }));
    assert.strictEqual(r.statusCode, 400);
  });

  await t('change-password: success clears mustChange and re-issues cookie', async () => {
    const tempHash = bcrypt.hashSync('Temp234abc', 4);
    responder = (sql) => /SELECT password_hash/.test(sql) ? rows([{ PASSWORD_HASH: tempHash }]) : done();
    const r = await F('change-password')(ev('POST', { cookie: temp, body: { current_password: 'Temp234abc', new_password: 'MyNewPass9' } }));
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(JSON.parse(r.body).user.mustChange, false);
    const upd = calls.find((c) => /must_change_pw = 'N'/.test(c.statementText));
    assert(upd && upd.binds.find((b) => b.name === 'h').value.startsWith('$2'), 'stores a bcrypt hash, never the password');
  });

  await t('staff-admin: staff (non-CIC) gets 403', async () => {
    const r = await F('staff-admin')(ev('GET', { cookie: staff }));
    assert.strictEqual(r.statusCode, 403);
  });

  await t('staff-admin: CIC issues a temporary password', async () => {
    responder = (sql) => /UPPER\(employee_no\)/.test(sql) ? rows([]) : done();
    const r = await F('staff-admin')(ev('POST', { cookie: cic, body: { staff_id: 5, employee_no: '4471' } }));
    assert.strictEqual(r.statusCode, 200);
    const pw = JSON.parse(r.body).temporary_password;
    assert.match(pw, /^[A-Za-z]{6}[2-9]{3}$/);
  });

  await t('bootstrap: disabled when BOOTSTRAP_TOKEN not set', async () => {
    delete process.env.BOOTSTRAP_TOKEN;
    const r = await F('bootstrap')(ev('POST', { body: { token: 'x' } }));
    assert.strictEqual(r.statusCode, 404);
  });

  await t('bootstrap: refuses once the CIC already has a password', async () => {
    process.env.BOOTSTRAP_TOKEN = 'setup-token-123';
    responder = () => rows([{ STAFF_ID: 18, PASSWORD_HASH: '$2a$...' }]);
    const r = await F('bootstrap')(ev('POST', { body: { token: 'setup-token-123', employee_no: '9001', password: 'Wejdan2026' } }));
    assert.strictEqual(r.statusCode, 409);
  });

  await t('bookings: past date / Friday / same doctor / honeypot refused before touching DB', async () => {
    const B = F('bookings');
    const base = { doctor_id: 3, assisting_doctor_id: 8, supervisor_doctor_id: 20, session: 'AM' };
    let r = await B(ev('POST', { body: { ...base, work_date: '2020-01-05' } })); assert.match(JSON.parse(r.body).error, /passed/);
    r = await B(ev('POST', { body: { ...base, work_date: '2030-01-04' } })); assert.match(JSON.parse(r.body).error, /Friday/); // 2030-01-04 is a Friday
    r = await B(ev('POST', { body: { ...base, assisting_doctor_id: 3, work_date: '2030-01-06' } })); assert.match(JSON.parse(r.body).error, /different doctor/);
    r = await B(ev('POST', { body: { ...base, work_date: '2030-01-06', website: 'spam' } })); assert.strictEqual(r.statusCode, 400);
    r = await B(ev('POST', { body: { ...base, supervisor_doctor_id: null, work_date: '2030-01-06' } })); assert.match(JSON.parse(r.body).error, /case supervisor/);
    assert.strictEqual(calls.length, 0);
  });

  await t('bookings: rule error from DB is shown to the doctor as-is', async () => {
    responder = () => oraErr('ORA-20031: Both surgery slots on Sun 06 Jan · AM are taken. Please pick another session.\nORA-06512: at line 17');
    const r = await F('bookings')(ev('POST', { body: { doctor_id: 3, assisting_doctor_id: 8, supervisor_doctor_id: 20, session: 'AM', work_date: '2030-01-06' } }));
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(JSON.parse(r.body).error, 'Both surgery slots on Sun 06 Jan · AM are taken. Please pick another session.');
  });

  await t('bookings: the booking block checks 2/session, 3/day and doctor clashes under a lock', async () => {
    responder = (sql) => /display_name FROM doctors/.test(sql) ? rows([{ DOCTOR_ID: 3, DISPLAY_NAME: 'Dr. Yazeed' }, { DOCTOR_ID: 8, DISPLAY_NAME: 'Dr. Muhannad' }, { DOCTOR_ID: 20, DISPLAY_NAME: 'Prof. Ahmed' }])
      : /notification_log|push_subscriptions|app_role = 'ADMIN'/.test(sql) ? rows([]) : done();
    const r = await F('bookings')(ev('POST', { body: { doctor_id: 3, assisting_doctor_id: 8, supervisor_doctor_id: 20, session: 'pm', work_date: '2030-01-06', note: 'perio collab' } }));
    assert.strictEqual(r.statusCode, 200, r.body);
    const blk = calls[0];
    assert.match(blk.statementText, /FOR UPDATE/);
    assert.strictEqual(blk.binds.find((b) => b.name === 'per_sess').value, 2);
    assert.strictEqual(blk.binds.find((b) => b.name === 'per_day').value, 3);
    assert.strictEqual(blk.binds.find((b) => b.name === 's').value, 'PM');
    assert.strictEqual(blk.binds.find((b) => b.name === 'sup').value, 20);
    assert.match(blk.statementText, /category_code = 'FC'/);
    assert.match(JSON.parse(r.body).message, /Dr\. Yazeed \(assisted by Dr\. Muhannad, supervisor Prof\. Ahmed\)/);
  });

  await t('assign: staff not in charge → 403', async () => {
    responder = () => rows([]); // not in v_active_in_charge
    const r = await F('assign')(ev('POST', { cookie: staff, body: { work_date: '2026-10-15', entries: [{ session: 'AM', staff_id: 5, type_code: 'VITALS' }] } }));
    assert.strictEqual(r.statusCode, 403);
  });

  await t('assign: two-doctor surgery → one group, two rows; CLINIC needs a doctor', async () => {
    const types = [{ TYPE_CODE: 'SURGERY', NEEDS_DOCTOR: 'Y', NOTIFY_ON_ASSIGN: 'N', TYPE_NAME: 'Surgery' }, { TYPE_CODE: 'CLINIC', NEEDS_DOCTOR: 'Y', NOTIFY_ON_ASSIGN: 'N', TYPE_NAME: 'Clinic' }];
    responder = (sql) => /FROM assignment_types/.test(sql) ? rows(types) : /v_assignment_history/.test(sql) ? rows([]) : done();
    let r = await F('assign')(ev('POST', { cookie: cic, body: { work_date: '2026-10-20', entries: [{ session: 'AM', staff_id: 7, type_code: 'CLINIC' }] } }));
    assert.strictEqual(r.statusCode, 400);
    r = await F('assign')(ev('POST', { cookie: cic, body: { work_date: '2026-10-20', client_request_id: 'abc', entries: [{ session: 'AM', staff_id: 7, type_code: 'SURGERY', doctor_ids: [3, 8] }] } }));
    assert.strictEqual(r.statusCode, 200, r.body);
    const blk = calls.find((c) => /DECLARE/.test(c.statementText));
    assert.strictEqual((blk.statementText.match(/NEXTVAL/g) || []).length, 1, 'one group id');
    assert.strictEqual((blk.statementText.match(/INSERT INTO assignment_logs/g) || []).length, 2, 'two rows');
    assert.deepStrictEqual(blk.binds.filter((b) => /^e0_r/.test(b.name)).map((b) => b.value), ['abc:0:0', 'abc:0:1']);
  });

  await t('assign: in-charge staff cannot edit another day', async () => {
    responder = () => rows([{ SESSION_CODE: 'AM' }]);
    const r = await F('assign')(ev('POST', { cookie: staff, body: { work_date: '2030-01-06', entries: [{ session: 'AM', staff_id: 5, type_code: 'VITALS' }] } }));
    assert.strictEqual(r.statusCode, 403);
    assert.match(JSON.parse(r.body).error, /today/);
  });

  await t('compliance: CIC cannot tick a future month; staff cannot tick at all', async () => {
    let r = await F('compliance')(ev('POST', { cookie: cic, body: { clinic_id: 9, checklist_type: 'EQUIPMENT', month: '2099-01', checked: true } }));
    assert.match(JSON.parse(r.body).error, /hasn't started/);
    r = await F('compliance')(ev('POST', { cookie: staff, body: { clinic_id: 9, checklist_type: 'EQUIPMENT', month: '2026-01', checked: true } }));
    assert.strictEqual(r.statusCode, 403);
  });

  await t('appraisals: staff query is limited to their own staff_id', async () => {
    responder = () => rows([]);
    const r = await F('appraisals')(ev('GET', { cookie: staff, query: { year: '2026' } }));
    assert.strictEqual(r.statusCode, 200);
    const q = calls.find((c) => /v_appraisal_status/.test(c.statementText));
    assert.match(q.statementText, /staff_id = :sid/);
    assert.strictEqual(q.binds.find((b) => b.name === 'sid').value, 5);
  });

  await t('board: public response is CDN-cached; live=1 requires sign-in', async () => {
    responder = () => rows([]);
    let r = await F('board')(ev('GET', { query: { date: '2026-10-15' } }));
    assert.match(r.headers['Netlify-CDN-Cache-Control'], /s-maxage=60/);
    r = await F('board')(ev('GET', { query: { date: '2026-10-15', live: '1' } }));
    assert.strictEqual(r.statusCode, 401);
  });

  await t('push: staff with no phone registered is logged SKIPPED_NO_DEVICE', async () => {
    const { notifyStaff } = require('../netlify/functions/lib/push');
    responder = (sql) => /COUNT\(\*\) AS n/.test(sql) ? rows([{ N: 0 }]) : /push_subscriptions/.test(sql) ? rows([]) : done();
    const r = await notifyStaff(5, { eventType: 'PPM_DUE', title: 't', body: 'b', dedupeKey: 'K1' });
    assert.strictEqual(r.status, 'SKIPPED_NO_DEVICE');
    const ins = calls.find((c) => /INSERT INTO notification_log/.test(c.statementText));
    assert.strictEqual(ins.binds.find((b) => b.name === 'st').value, 'SKIPPED_NO_DEVICE');
  });

  await t('wrong HTTP method → 405', async () => {
    const r = await F('login')(ev('GET'));
    assert.strictEqual(r.statusCode, 405);
  });

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
