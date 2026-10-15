// Local preview of the dashboard with a fake in-memory API (no database).
// Run: node tests/mock-server.js  → http://localhost:8888   (CIC login: 9001 / Test1234)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const categories = [
  ['PG1', 'Postgraduate year 1', '#E6F1FC', '#12355E'], ['PG2', 'Postgraduate year 2', '#CDE2F8', '#12355E'], ['PG3', 'Postgraduate year 3', '#AFCEF1', '#0E2C50'],
  ['PG4', 'Postgraduate year 4', '#8DB8EA', '#0B2442'], ['BD1', 'Board year 1', '#E2F4EB', '#124434'], ['BD2', 'Board year 2', '#C3E6D4', '#124434'],
  ['BD3', 'Board year 3', '#9ED3B9', '#0C362A'], ['FC', 'Faculty', '#F4E3C4', '#5E3D06'], ['SP', 'Specialist', '#E4EAC5', '#434B0D'],
].map(([category_code, category_name, chip_bg, chip_fg]) => ({ category_code, category_name, chip_bg, chip_fg }));
const doctors = [['Dr. Reema', 'PG4'], ['Dr. Yazeed', 'BD3'], ['Dr. Muhannad', 'BD2'], ['Dr. Nada', 'BD1'], ['Dr. Abdullah B', 'BD1'], ['Prof. Ahmed', 'FC', 2], ['Dr. Alaa', 'SP'], ['Dr. Heba', 'PG1'], ['Dr. Talal', 'BD3'], ['Dr. New', null]]
  .map(([display_name, category_code, max = 1], i) => ({ doctor_id: i + 1, display_name, category_code, max_assistants: max }));
const staffNames = ['Rhoda', 'Saada', 'Nawal', 'Victoria', 'Raniya', 'Sharifah', 'Waad', 'Haifa', 'Deema', 'Aisha', 'Eman', 'Shouq', 'Muluk', 'Tahani', 'Zahraa', 'Leena', 'Abdulmohsen'];
const staff = staffNames.map((n, i) => ({ staff_id: i + 1, display_name: n, home_clinic_id: i + 2, staff_type: ['Victoria', 'Eman', 'Abdulmohsen'].includes(n) ? 'STAFF_NURSE' : 'DENTAL_ASSISTANT', employment_status: 'ACTIVE' }));
const clinics = Array.from({ length: 18 }, (_, i) => ({ clinic_id: i + 2, clinic_name: 'Clinic ' + (i + 2) }));
const types = [
  ['CLINIC', 'Clinic (with doctor)', 'CLINICAL', 'Y'], ['PEDO', 'PEDO clinic', 'CLINICAL', 'Y'], ['SURGERY', 'Surgery', 'SURGERY', 'Y'],
  ['VITALS', 'Vitals', 'DUTY', 'N'], ['IN_CHARGE', 'In charge (team leader duties)', 'DUTY', 'N'], ['FLOATER', 'Floater', 'DUTY', 'N'], ['STORE', 'Store', 'DUTY', 'N'],
  ['ON_LEAVE', 'On leave', 'UNAVAILABLE', 'N'], ['EXCUSE', 'Excuse', 'UNAVAILABLE', 'N'], ['SICK_LEAVE', 'Sick leave (SL)', 'UNAVAILABLE', 'N'],
].map(([type_code, type_name, category, needs_doctor], i) => ({ type_code, type_name, category, needs_doctor, sort_order: i }));
const T = Object.fromEntries(types.map((t) => [t.type_code, t]));
const D = Object.fromEntries(doctors.map((d) => [d.doctor_id, d]));
const ST = Object.fromEntries(staff.map((s) => [s.staff_id, s]));

let logSeq = 100, grpSeq = 100;
const logs = []; // all rows incl. cancelled
function addRow(r, by = 'seed') {
  const row = { log_id: ++logSeq, action: r.action || 'ASSIGN', supersedes_log_id: r.supersedes_log_id || null, work_date: r.work_date, session_code: r.session, staff_id: r.staff_id,
    staff_name: ST[r.staff_id].display_name, doctor_id: r.doctor_id || null, doctor_name: r.doctor_id ? D[r.doctor_id].display_name : null,
    doctor_category: r.doctor_id ? D[r.doctor_id].category_code : null, clinic_id: r.clinic_id || (T[r.type_code].category === 'CLINICAL' ? ST[r.staff_id].home_clinic_id : null),
    type_code: r.type_code, type_name: T[r.type_code].type_name, category: T[r.type_code].category, notes: r.notes || null,
    assignment_group_id: r.group || ++grpSeq, recorded_by: by, recorded_at: today + ' ' + new Date().toISOString().slice(11, 16) };
  logs.push(row); return row;
}
// seed today
[[8, 'AM', 'CLINIC', 1], [8, 'PM', 'CLINIC', 3], [1, 'AM', 'CLINIC', 6], [2, 'AM', 'CLINIC', 6], [3, 'AM', 'VITALS'], [3, 'PM', 'CLINIC', 4, 5], [4, 'DAY', 'ON_LEAVE'],
 [5, 'AM', 'IN_CHARGE'], [5, 'PM', 'CLINIC', 7], [6, 'AM', 'CLINIC', 8], [7, 'PM', 'EXCUSE']].forEach(([s, sess, t, d, c]) => addRow({ work_date: today, session: sess, staff_id: s, type_code: t, doctor_id: d, clinic_id: c }));
const g = ++grpSeq; addRow({ work_date: today, session: 'PM', staff_id: 13, type_code: 'SURGERY', doctor_id: 2, group: g }); addRow({ work_date: today, session: 'PM', staff_id: 13, type_code: 'SURGERY', doctor_id: 3, group: g });

const current = () => logs.filter((r) => r.action !== 'CANCEL' && !logs.some((n) => n.supersedes_log_id === r.log_id));
let bookings = [{ booking_id: 1, work_date: today, session_code: 'AM', note: 'needs microscope', status: 'NEW', doctor_id: 2, doctor_name: 'Dr. Yazeed', doctor_category: 'BD3', assisting_doctor_id: 3, assisting_doctor_name: 'Dr. Muhannad', assisting_category: 'BD2', assigned_staff: null }];
const compl = []; for (let c = 2; c <= 19; c++) for (let m = 1; m <= 9; m++) compl.push({ clinic_id: c, checklist_type: 'EQUIPMENT', month: `2026-${String(m).padStart(2, '0')}`, is_submitted: c === 12 && m > 3 ? 'N' : 'Y' });
const steps = [[1, 'SMART goals set', '2026-03-31'], [2, 'Objectives agreed', '2026-04-12'], [3, 'Self assessment', '2026-10-29'], [4, 'Final appraisal signed', '2026-11-30']].map(([step_no, step_name, due_date]) => ({ step_no, step_name, due_date }));
const appr = {}; staff.forEach((s) => steps.forEach((st) => { appr[`${s.staff_id}|${st.step_no}`] = st.step_no <= 2 ? 'Y' : 'N'; }));

let session = null; // single-user mock: { sid, name, role }
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };

function apiHandler(req, res, url, body) {
  const p = url.pathname.replace('/api/', '');
  const q = Object.fromEntries(url.searchParams);
  const need = (role) => { if (!session) { send(res, 401, { error: 'Please sign in.' }); return false; } if (role === 'ADMIN' && session.role !== 'ADMIN') { send(res, 403, { error: 'Only the CIC can do this.' }); return false; } return true; };
  switch (p) {
    case 'me': return send(res, 200, { user: session });
    case 'login':
      if (body.employee_no === '9001' && body.password === 'Test1234') { session = { sid: 99, name: 'Wejdan', role: 'ADMIN', mustChange: false }; return send(res, 200, { user: session }); }
      if (body.employee_no === '4471' && body.password === 'Temp234abc') { session = { sid: 8, name: 'Haifa', role: 'STAFF', mustChange: true }; return send(res, 200, { user: session }); }
      return send(res, 401, { error: 'Staff ID or password is not correct. 4 attempt(s) left.' });
    case 'logout': session = null; return send(res, 200, { ok: true });
    case 'change-password': session.mustChange = false; return send(res, 200, { user: session });
    case 'reference': return send(res, 200, { clinics, categories, doctors, staff, types, sessions: [] });
    case 'board': return send(res, 200, { date: q.date, assignments: current().filter((r) => r.work_date === q.date) });
    case 'assign': {
      if (!need()) return;
      const out = [];
      for (const e of body.entries) {
        const grp = ++grpSeq;
        for (const d of (e.doctor_ids && e.doctor_ids.length ? e.doctor_ids : [null])) out.push(addRow({ ...e, work_date: body.work_date, doctor_id: d, group: grp }, session.name));
      }
      return send(res, 200, { ok: true, written: out });
    }
    case 'history': if (!need('ADMIN')) return; return send(res, 200, { from: q.from, to: q.to, rows: logs.filter((r) => r.work_date === q.from).slice().reverse() });
    case 'queues': if (!need()) return; return send(res, 200, { queues: staff.map((s, i) => ({ rotation_code: 'SURGERY', staff_id: s.staff_id, staff_name: s.display_name, total_count: i % 5, is_eligible: ['Leena', 'Saada', 'Abdulmohsen'].includes(s.display_name) ? 'N' : 'Y', queue_position: i + 1 })) });
    case 'bookings':
      if (req.method === 'POST') {
        if (body.doctor_id === body.assisting_doctor_id) return send(res, 400, { error: 'The assisting doctor must be a different doctor.' });
        if (!body.supervisor_doctor_id) return send(res, 400, { error: 'Choose the case supervisor.' });
        const n = bookings.filter((b) => b.work_date === body.work_date && b.session_code === body.session && b.status !== 'CANCELLED').length;
        if (n >= 2) return send(res, 400, { error: 'Both surgery slots are taken. Please pick another session.' });
        bookings.push({ booking_id: bookings.length + 1, work_date: body.work_date, session_code: body.session, note: body.note, status: 'NEW', doctor_id: body.doctor_id, doctor_name: D[body.doctor_id].display_name, doctor_category: D[body.doctor_id].category_code, assisting_doctor_name: D[body.assisting_doctor_id].display_name, assisting_category: D[body.assisting_doctor_id].category_code, supervisor_name: D[body.supervisor_doctor_id].display_name });
        return send(res, 200, { ok: true, message: `Sent. The CIC has been notified about ${D[body.doctor_id].display_name} · ${body.work_date} · ${body.session}.` });
      }
      if (q.list) { if (!need('ADMIN')) return; return send(res, 200, { bookings: bookings.filter((b) => b.status !== 'CANCELLED') }); }
      { const bs = bookings.filter((b) => b.work_date === q.date && b.status !== 'CANCELLED'); return send(res, 200, { AM: bs.filter((b) => b.session_code === 'AM').length, PM: bs.filter((b) => b.session_code === 'PM').length, day: bs.length, limits: { per_session: 2, per_day: 3 } }); }
    case 'booking-action': {
      if (!need('ADMIN')) return;
      const b = bookings.find((x) => x.booking_id === body.booking_id);
      if (body.action === 'cancel') b.status = 'CANCELLED';
      if (body.action === 'assign') { b.status = 'ASSIGNED'; b.assigned_staff = ST[body.staff_id].display_name; }
      return send(res, 200, { ok: true });
    }
    case 'compliance':
      if (!need()) return;
      if (req.method === 'POST') { if (!need('ADMIN')) return; const r = compl.find((x) => x.clinic_id === body.clinic_id && x.checklist_type === body.checklist_type && x.month === body.month); if (r) r.is_submitted = body.checked ? 'Y' : 'N'; else compl.push({ clinic_id: body.clinic_id, checklist_type: body.checklist_type, month: body.month, is_submitted: body.checked ? 'Y' : 'N' }); return send(res, 200, { ok: true }); }
      return send(res, 200, { year: 2026, clinics, rows: compl });
    case 'appraisals':
      if (!need()) return;
      if (req.method === 'POST') { if (!need('ADMIN')) return; appr[`${body.staff_id}|${body.step_no}`] = body.done ? 'Y' : 'N'; return send(res, 200, { ok: true }); }
      return send(res, 200, { year: 2026, steps, rows: staff.filter((s) => session.role === 'ADMIN' || s.staff_id === session.sid).flatMap((s) => steps.map((st) => {
        const done = appr[`${s.staff_id}|${st.step_no}`];
        return { staff_id: s.staff_id, staff_name: s.display_name, step_no: st.step_no, is_done: done, status: done === 'Y' ? 'DONE' : st.due_date < today ? 'OVERDUE' : 'PENDING', done_on: done === 'Y' ? '2026-03-20' : null };
      })) });
    case 'staff-admin':
      if (!need('ADMIN')) return;
      if (req.method === 'POST') return send(res, 200, { ok: true, temporary_password: 'AbcDef234' });
      return send(res, 200, { staff: [{ staff_id: 99, display_name: 'Wejdan', employee_no: '9001', staff_type: 'CIC', app_role: 'ADMIN', login_status: 'ACTIVE', last_login: today + ' 18:40', devices: 0 }, ...staff.map((s) => ({ ...s, app_role: 'STAFF', employee_no: null, login_status: 'NOT_SET', last_login: null, devices: 0 }))] });
    case 'push-key': return send(res, 200, { publicKey: null });
    default: return send(res, 404, { error: 'Not found' });
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => apiHandler(req, res, url, b ? JSON.parse(b) : {}));
    return;
  }
  const f = path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!f.startsWith(PUB) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 8888, () => console.log('mock on', process.env.PORT || 8888, 'today', today));
