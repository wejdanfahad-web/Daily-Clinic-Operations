// Local preview of the dashboard with a fake in-memory API (no database).
// Run: node tests/mock-server.js  → http://localhost:8888   (CIC login: 9001 / Test1234)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const today = process.env.MOCK_TODAY || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const categories = [
  ['PG1', 'Postgraduate year 1', '#E6F1FC', '#12355E'], ['PG2', 'Postgraduate year 2', '#CDE2F8', '#12355E'], ['PG3', 'Postgraduate year 3', '#AFCEF1', '#0E2C50'],
  ['PG4', 'Postgraduate year 4', '#8DB8EA', '#0B2442'], ['BD1', 'Board year 1', '#E2F4EB', '#124434'], ['BD2', 'Board year 2', '#C3E6D4', '#124434'],
  ['BD3', 'Board year 3', '#9ED3B9', '#0C362A'], ['FC', 'Faculty', '#F4E3C4', '#5E3D06'], ['SP', 'Specialist', '#E4EAC5', '#434B0D'],
].map(([category_code, category_name, chip_bg, chip_fg]) => ({ category_code, category_name, chip_bg, chip_fg }));
const DOC_LIST = {
  FC: ['Dr. Maha', 'Prof. Fahd S', 'Dr. Abdullah R', 'Dr. Hussam', 'Prof. Fahad J', 'Dr. Mazen', 'Dr. Muath', 'Dr. Khaled Alamnei', 'Dr. Riyadh', 'Dr. Abdullah Q', 'Dr. Anas', 'Dr. Khalid Almadhi', 'Dr. Ibrahim', 'Dr. Ziyad', 'Prof. Ahmed', 'Prof. Obaida', 'Prof. Sara', 'Prof. Sulaiman', 'Prof. Alhadlaq', 'Prof. Aljarbou', 'Prof. Alsubait'],
  SP: ['Dr. Alaa', 'Dr. Nouf', 'Dr. Mohammed T', 'Dr. Abdullah S', 'Dr. Ahmed Z'],
  PG4: ['Dr. Reema', 'Dr. Noura H', 'Dr. Aljohara', 'Dr. Basmah'], BD3: ['Dr. Yazeed', 'Dr. Talal', 'Dr. Abdulrahman K', 'Dr. Hussain'],
  BD2: ['Dr. Ghaida', 'Dr. Abdulaziz', 'Dr. Muhannad', 'Dr. Noura R'], PG3: ['Dr. Yara', 'Dr. Rafal'], PG2: ['Dr. Noura K', 'Dr. Noura A', 'Dr. Marwa'],
  PG1: ['Dr. Heba', 'Dr. Moayad', 'Dr. Asmaa'], BD1: ['Dr. Nada', 'Dr. Abdullah B'],
};
const doctors = [];
for (const [cat, names] of Object.entries(DOC_LIST)) for (const n of names) doctors.push({ doctor_id: doctors.length + 1, display_name: n, category_code: cat, max_assistants: n === 'Prof. Ahmed' ? 2 : 1 });
const DID = (n) => doctors.find((d) => d.display_name === n).doctor_id;
const staffNames = ['Rhoda', 'Saada', 'Nawal', 'Victoria', 'Raniya', 'Sharifah', 'Waad', 'Haifa', 'Deema', 'Aisha', 'Eman', 'Shouq', 'Muluk', 'Tahani', 'Zahraa', 'Leena', 'Abdulmohsen'];
const staff = staffNames.map((n, i) => ({ staff_id: i + 1, display_name: n, home_clinic_id: i + 2, staff_type: ['Victoria', 'Eman', 'Abdulmohsen'].includes(n) ? 'STAFF_NURSE' : 'DENTAL_ASSISTANT', employment_status: 'ACTIVE' }));
const clinics = Array.from({ length: 18 }, (_, i) => ({ clinic_id: i + 2, clinic_name: 'Clinic ' + (i + 2) }));
const types = [
  ['CLINIC', 'Clinic (with doctor)', 'CLINICAL', 'Y'], ['PEDO', 'PEDO clinic', 'CLINICAL', 'Y'], ['SURGERY', 'Surgery', 'SURGERY', 'Y'],
  ['VITALS', 'Vitals', 'DUTY', 'N'], ['INSTRUMENTS', 'Instruments duty', 'DUTY', 'N'], ['CRASH_CART', 'Crash cart check', 'DUTY', 'N'], ['IN_CHARGE', 'In charge (team leader duties)', 'DUTY', 'N'], ['FLOATER', 'Floater', 'DUTY', 'N'], ['STORE', 'Store', 'DUTY', 'N'],
  ['ON_LEAVE', 'On leave', 'UNAVAILABLE', 'N'], ['EXCUSE', 'Excuse', 'UNAVAILABLE', 'N'], ['SICK_LEAVE', 'Sick leave (SL)', 'UNAVAILABLE', 'N'],
].map(([type_code, type_name, category, needs_doctor], i) => ({ type_code, type_name, category, needs_doctor, sort_order: i }));
const T = Object.fromEntries(types.map((t) => [t.type_code, t]));
const D = Object.fromEntries(doctors.map((d) => [d.doctor_id, d]));
const ST = Object.fromEntries(staff.map((s) => [s.staff_id, s]));

let logSeq = 100, grpSeq = 100;
const n2o = [];
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
[[8, 'AM', 'CLINIC', 'Dr. Reema'], [8, 'PM', 'CLINIC', 'Dr. Muhannad'], [1, 'AM', 'CLINIC', 'Prof. Ahmed'], [2, 'AM', 'CLINIC', 'Prof. Ahmed'], [3, 'AM', 'VITALS'], [3, 'PM', 'CLINIC', 'Dr. Nada', 5], [4, 'DAY', 'ON_LEAVE'],
 [5, 'AM', 'IN_CHARGE'], [5, 'PM', 'CLINIC', 'Dr. Alaa'], [6, 'AM', 'CLINIC', 'Dr. Heba'], [7, 'PM', 'EXCUSE']].forEach(([s, sess, t, d, c]) => addRow({ work_date: today, session: sess, staff_id: s, type_code: t, doctor_id: d ? DID(d) : null, clinic_id: c }));
const g = ++grpSeq; addRow({ work_date: today, session: 'PM', staff_id: 13, type_code: 'SURGERY', doctor_id: DID('Dr. Yazeed'), group: g }); addRow({ work_date: today, session: 'PM', staff_id: 13, type_code: 'SURGERY', doctor_id: DID('Dr. Muhannad'), group: g });

const current = () => logs.filter((r) => r.action !== 'CANCEL' && !logs.some((n) => n.supersedes_log_id === r.log_id));
let bookings = [{ booking_id: 1, work_date: today, session_code: 'AM', note: 'needs microscope', status: 'NEW', doctor_id: DID('Dr. Yazeed'), doctor_name: 'Dr. Yazeed', doctor_category: 'BD3', assisting_doctor_id: DID('Dr. Muhannad'), assisting_doctor_name: 'Dr. Muhannad', assisting_category: 'BD2', assigned_staff: null }];
const compl = []; for (let c = 2; c <= 19; c++) for (let m = 1; m <= 9; m++) compl.push({ clinic_id: c, checklist_type: 'EQUIPMENT', month: `2026-${String(m).padStart(2, '0')}`, is_submitted: c === 12 && m > 3 ? 'N' : 'Y' });
const steps = [[1, 'SMART goals set', '2026-03-31'], [2, 'Objectives agreed', '2026-04-12'], [3, 'Self assessment', '2026-10-29'], [4, 'Final appraisal signed', '2026-11-30']].map(([step_no, step_name, due_date]) => ({ step_no, step_name, due_date }));
const appr = {}; staff.forEach((s) => steps.forEach((st) => { appr[`${s.staff_id}|${st.step_no}`] = st.step_no <= 2 ? 'Y' : 'N'; }));


// ---- planner / timetable / workload / inventory (mock)
const semesters = [{ semester_id: 1, semester_name: 'First semester 2026-27', starts_on: '2026-08-30', ends_on: '2027-01-14', source_file: 'tt.xlsx', confirmed_at: '2026-10-01 10:00', entries: 0 }];
let ttSeq = 10;
const timetable = [['Prof. Ahmed', 0, 'AM', 2], ['Prof. Ahmed', 0, 'AM', 3], ['Dr. Yazeed', 0, 'PM', 12], ['Dr. Nada', 0, 'AM', 4], ['Dr. Abdullah B', 0, 'AM', 5], ['Dr. Reema', 0, 'PM', 5], ['Dr. Heba', 0, 'PM', 9], ['Dr. Alaa', 0, 'AM', 9], ['Dr. Muhannad', 0, 'AM', 7]]
  .map(([n, weekday, session_code, clinic_id]) => ({ n, weekday, session_code, clinic_id })).map(({ n, weekday, session_code, clinic_id }) => ({ doctor_id: DID(n), weekday, session_code, clinic_id })).map(({ doctor_id, weekday, session_code, clinic_id }) => ({ timetable_id: ++ttSeq, semester_id: 1, doctor_id, weekday, session_code, clinic_id }));
const aliases = [];
for (const m of require('fs').readFileSync(path.join(__dirname, '..', 'db', '06_timetable_presence.sql'), 'utf8').matchAll(/SELECT '([^']+)', doctor_id, 'seed' FROM doctors WHERE display_name = '([^']+)'/g)) aliases.push({ alias_norm: m[1], doctor_id: DID(m[2]) });
const drafts = {};
let leave = [{ leave_id: 1, staff_id: 4, staff_name: 'Victoria', from_date: '2026-10-18', to_date: '2026-10-20', session_code: null, type_code: 'ON_LEAVE', notes: null }];
let eqSeq = 0; const equipment = [];
let catSeq = 5; const catalog = [{ item_id: 1, item_name: 'Endo motor', item_kind: 'MACHINE', requires_ppm: 'Y', ppm_interval_months: 12, list_status: 'STANDARD' }, { item_id: 2, item_name: 'Apex locator', item_kind: 'MACHINE', requires_ppm: 'N', ppm_interval_months: null, list_status: 'STANDARD' }, { item_id: 3, item_name: 'Endo explorer DG16', item_kind: 'INSTRUMENT', list_status: 'STANDARD' }, { item_id: 4, item_name: 'Mouth mirror', item_kind: 'INSTRUMENT', list_status: 'STANDARD' }, { item_id: 5, item_name: 'Buchanan Blue', item_kind: 'INSTRUMENT', list_status: 'STANDARD' }];
function extraApi(req, res, p, q, body, need) {
  const wdOf = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
  if (p === 'duties') {
    const { pick } = require('../netlify/functions/lib/duties');
    const date = q.date || body.date;
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    if (req.method === 'GET' && (dow === 5 || dow === 6)) { send(res, 200, { date, closed: true }); return true; }
    const queue = [...staff.filter((s) => s.staff_type === 'DENTAL_ASSISTANT').map((s, i) => ({ rotation_code: 'INSTRUMENTS', staff_id: s.staff_id, staff_name: s.display_name, queue_position: i + 1 })),
      ...staff.filter((s) => s.staff_type === 'STAFF_NURSE').map((s, i) => ({ rotation_code: 'CRASH_CART', staff_id: s.staff_id, staff_name: s.display_name, queue_position: i + 1 }))];
    const board = current().filter((r) => r.work_date === date);
    if (req.method === 'POST') {
      if (!need('ADMIN')) return true;
      const d = pick({ queue, board, cic: { staff_id: 99, display_name: 'Wejdan' } });
      if (body.action === 'record') { for (const sess of ['AM', 'PM']) if (d.instruments[sess] && !d.instruments[sess].recorded) addRow({ work_date: date, session: sess, staff_id: d.instruments[sess].staff_id, type_code: 'INSTRUMENTS' }, session.name); for (const c of d.crash) if (!c.recorded && ST[c.staff_id]) addRow({ work_date: date, session: 'AM', staff_id: c.staff_id, type_code: 'CRASH_CART' }, session.name); }
      if (body.action === 'set') { if (body.replace_log_id) addRow({ work_date: date, session: body.slot === 'INST_PM' ? 'PM' : 'AM', staff_id: body.replace_staff_id, type_code: body.slot === 'CRASH' ? 'CRASH_CART' : 'INSTRUMENTS', action: 'CANCEL', supersedes_log_id: body.replace_log_id }, session.name); addRow({ work_date: date, session: body.slot === 'INST_PM' ? 'PM' : 'AM', staff_id: body.staff_id, type_code: body.slot === 'CRASH' ? 'CRASH_CART' : 'INSTRUMENTS' }, session.name); }
      send(res, 200, { ok: true }); return true;
    }
    const d = pick({ queue, board, cic: { staff_id: 99, display_name: 'Wejdan' } });
    send(res, 200, { date, instruments: d.instruments, crash: d.crash, allRecorded: d.allRecorded, skipped: session && session.role === 'ADMIN' ? d.skipped : undefined }); return true;
  }
  if (p === 'planner') {
    if (!need('ADMIN')) return true;
    if (req.method === 'GET') {
      const sem = semesters.find((s) => s.confirmed_at);
      send(res, 200, { date: q.date, draft: drafts[q.date] ? drafts[q.date].draft : null, status: drafts[q.date] ? drafts[q.date].status : null, published_at: null,
        semester: sem ? sem.semester_name : null,
        timetable: sem ? timetable.filter((t) => t.weekday === wdOf(q.date)).map((t) => ({ ...t, doctor_name: D[t.doctor_id].display_name, category_code: D[t.doctor_id].category_code, max_assistants: D[t.doctor_id].max_assistants })) : [],
        leave, board: current().filter((r) => r.work_date === q.date) });
      return true;
    }
    if (body.action === 'save_draft') { drafts[body.date] = { draft: body.draft, status: 'DRAFT' }; send(res, 200, { ok: true }); return true; }
    if (body.action === 'publish') {
      let n = 0;
      for (const r of current().filter((x) => x.work_date === body.date)) { addRow({ work_date: body.date, session: r.session_code, staff_id: r.staff_id, type_code: r.type_code, doctor_id: r.doctor_id, action: 'CANCEL', supersedes_log_id: r.log_id }, session.name); n++; }
      for (const [sid, d] of Object.entries(body.draft)) for (const sess of ['AM', 'PM']) for (const e of d[sess] || []) { const g = ++grpSeq; for (const doc of (e.doctor_ids.length ? e.doctor_ids : [null])) { addRow({ work_date: body.date, session: sess, staff_id: Number(sid), type_code: e.type_code, doctor_id: doc, clinic_id: e.clinic_id, group: g }, session.name); n++; } }
      drafts[body.date] = { draft: body.draft, status: 'PUBLISHED' };
      send(res, 200, { ok: true, changes: n, notified: [] }); return true;
    }
    if (body.action === 'add_leave') { leave.push({ leave_id: leave.length + 2, staff_id: body.staff_id, staff_name: ST[body.staff_id].display_name, from_date: body.from_date, to_date: body.to_date, type_code: body.type_code }); send(res, 200, { ok: true }); return true; }
    if (body.action === 'delete_leave') { leave = leave.filter((l) => l.leave_id !== body.leave_id); send(res, 200, { ok: true }); return true; }
  }
  if (p === 'timetable') {
    if (!need('ADMIN')) return true;
    if (body.action === 'save_alias') { aliases.push({ alias_norm: body.alias.toLowerCase(), doctor_id: body.doctor_id }); send(res, 200, { ok: true }); return true; }
    if (body.action === 'add_doctor') { const d = { doctor_id: doctors.length + 1, display_name: body.display_name, category_code: body.category_code, max_assistants: 1 }; doctors.push(d); D[d.doctor_id] = d; send(res, 200, { ok: true, doctor: d }); return true; }
    if (req.method === 'GET') { send(res, 200, { aliases, semesters: semesters.map((s) => ({ ...s, entries: timetable.length })), entries: q.semester_id ? timetable.map((t) => ({ ...t, doctor_name: D[t.doctor_id].display_name, category_code: D[t.doctor_id].category_code, max_assistants: D[t.doctor_id].max_assistants })) : [] }); return true; }
    if (body.action === 'import') { timetable.length = 0; body.rows.forEach((r) => timetable.push({ timetable_id: ++ttSeq, semester_id: 1, doctor_id: r.doctor_id, weekday: r.weekday, session_code: r.session, clinic_id: r.clinic_id || null })); semesters[0].confirmed_at = null; send(res, 200, { ok: true, saved: body.rows.length }); return true; }
    if (body.action === 'add_entry') { timetable.push({ timetable_id: ++ttSeq, semester_id: 1, doctor_id: body.doctor_id, weekday: body.weekday, session_code: body.session, clinic_id: body.clinic_id || null }); send(res, 200, { ok: true }); return true; }
    if (body.action === 'delete_entry') { const i = timetable.findIndex((t) => t.timetable_id === body.timetable_id); if (i >= 0) timetable.splice(i, 1); send(res, 200, { ok: true }); return true; }
    if (body.action === 'confirm') { semesters[0].confirmed_at = today + ' 20:00'; send(res, 200, { ok: true }); return true; }
    if (body.action === 'create_semester') { semesters.unshift({ semester_id: 2, semester_name: body.semester_name, starts_on: body.starts_on, ends_on: body.ends_on, confirmed_at: null }); send(res, 200, { ok: true, semester_id: 2 }); return true; }
  }
  if (p === 'workload') {
    if (!need('ADMIN')) return true;
    if (q.view === 'surgeries') {
      const groups = {};
      for (const r of current().filter((x) => x.type_code === 'SURGERY')) { const k = r.assignment_group_id; groups[k] = groups[k] || { work_date: r.work_date, session_code: r.session_code, staff_id: r.staff_id, staff_name: r.staff_name, doctors: [], recorded_by: r.recorded_by + ' (#99)', recorded_at: r.recorded_at, supervisor: 'Prof. Ahmed', note: null }; groups[k].doctors.push(r.doctor_name); }
      send(res, 200, { surgeries: Object.values(groups).map((g) => ({ ...g, doctors: g.doctors.join(' + ') })).filter((g) => !q.staff_id || String(g.staff_id) === q.staff_id), totals: [] }); return true;
    }
    send(res, 200, { quarter: '2026-10-01', quarters: ['2026-10-01', '2026-07-01'], rows: staff.slice(0, 8).map((s, i) => ({ staff_id: s.staff_id, staff_name: s.display_name, sessions_available: 40 - i, workload_points: 38 - i * 3, load_per_session: ((38 - i * 3) / (40 - i)).toFixed(2), multi_clinic_sessions: i % 3, annual_leave_days: i, excuses: i % 2, sick_sessions: 0, appointments: 0 })) });
    return true;
  }
  if (p === 'inventory') {
    if (!need()) return true;
    if (req.method === 'GET') {
      const cid = Number(q.clinic_id);
      send(res, 200, { clinic_id: cid, editable: session.role === 'ADMIN' || ST[session.sid]?.home_clinic_id === cid, items: equipment.filter((e) => e.clinic_id === cid && e.condition_status !== 'RETIRED'),
        summary: clinics.map((c) => ({ clinic_id: c.clinic_id, items: equipment.filter((e) => e.clinic_id === c.clinic_id).length, overdue: equipment.filter((e) => e.clinic_id === c.clinic_id && e.ppm_status === 'OVERDUE').length, due_soon: 0, missing_date: 0 })),
        catalog: catalog.filter((c) => c.list_status === 'STANDARD'),
        pending: session.role === 'ADMIN' ? catalog.filter((c) => c.list_status === 'PENDING').map((c) => ({ ...c, clinics: equipment.filter((e) => e.item_id === c.item_id).map((e) => 'Cl ' + e.clinic_id).join(', ') })) : undefined });
      return true;
    }
    if (String(body.action).startsWith('catalog_')) {
      const c = catalog.find((x) => x.item_id === body.item_id);
      if (body.action === 'catalog_add') catalog.push({ item_id: ++catSeq, item_name: body.item_name, item_kind: body.item_kind, ppm_interval_months: body.ppm_interval_months, list_status: 'STANDARD' });
      if (body.action === 'catalog_bulk') body.items.forEach((it) => catalog.push({ item_id: ++catSeq, ...it, list_status: 'STANDARD' }));
      if (body.action === 'catalog_remove') c.list_status = 'REMOVED';
      if (body.action === 'catalog_ppm') c.requires_ppm = body.requires_ppm;
      if (body.action === 'catalog_approve') c.list_status = 'STANDARD';
      if (body.action === 'catalog_merge') { const into = catalog.find((x) => x.item_id === body.into_item_id); equipment.filter((e) => e.item_id === c.item_id).forEach((e) => { e.item_id = into.item_id; e.item_name = into.item_name; e.list_status = 'STANDARD'; }); c.list_status = 'REMOVED'; }
      send(res, 200, { ok: true }); return true;
    }
    if (body.action === 'add_instruments') {
      let updated = 0;
      const resp = session.role === 'ADMIN' ? null : session.sid;
      for (const it of body.items) {
        let cat = it.item_id ? catalog.find((x) => x.item_id === it.item_id) : catalog.find((x) => x.item_name.toLowerCase() === it.item_name.toLowerCase() && x.item_kind === 'INSTRUMENT');
        if (!cat) { cat = { item_id: ++catSeq, item_name: it.item_name, item_kind: 'INSTRUMENT', requires_ppm: 'N', list_status: 'PENDING' }; catalog.push(cat); }
        const ex = equipment.find((e) => e.clinic_id === body.clinic_id && e.item_id === cat.item_id && (e.responsible_staff_id ?? null) === resp);
        if (ex) { ex.quantity = it.quantity; updated++; continue; }
        equipment.push({ equipment_id: ++eqSeq, clinic_id: body.clinic_id, item_id: cat.item_id, item_name: cat.item_name, item_kind: 'INSTRUMENT', requires_ppm: 'N', list_status: cat.list_status, quantity: it.quantity,
          ppm_status: 'NOT_REQUIRED', condition_status: 'IN_SERVICE', responsible_staff_id: resp, responsible_name: resp ? session.name : null, last_verified_by_name: session.name, last_verified_on: today });
      }
      send(res, 200, { ok: true, saved: body.items.length, updated }); return true;
    }
    if (body.action === 'import') {
      let n = 0;
      for (const r of body.rows) {
        if (!clinics.some((c) => c.clinic_id === r.clinic_id)) continue;
        let cat = catalog.find((x) => x.item_name.toLowerCase() === r.item_name.toLowerCase() && x.item_kind === 'MACHINE');
        if (!cat) { cat = { item_id: ++catSeq, item_name: r.item_name, item_kind: 'MACHINE', requires_ppm: r.ppm_due_date ? 'Y' : 'N', list_status: 'STANDARD' }; catalog.push(cat); }
        const ex = equipment.find((e) => e.item_id === cat.item_id && e.clinic_id === r.clinic_id && r.serial_no && e.serial_no === r.serial_no);
        const due = r.ppm_due_date;
        const row = { clinic_id: r.clinic_id, item_id: cat.item_id, item_name: cat.item_name, item_kind: 'MACHINE', requires_ppm: cat.requires_ppm, list_status: 'STANDARD', serial_no: r.serial_no, asset_tag: r.asset_tag, quantity: 1,
          last_ppm_date: r.last_ppm_date, ppm_due_date: due, ppm_status: cat.requires_ppm !== 'Y' ? 'NOT_REQUIRED' : !due ? 'MISSING_DATE' : due < today ? 'OVERDUE' : 'OK',
          condition_status: /non/i.test(r.status) ? 'OUT_OF_SERVICE' : 'IN_SERVICE',
          responsible_name: ({ '111942': 'Rhoda', '144058': 'Haifa', '140536': 'Sharifah' })[r.staff_no] || null };
        row.responsible_staff_id = row.responsible_name ? staff.find((x) => x.display_name === row.responsible_name).staff_id : null;
        if (ex) Object.assign(ex, row); else equipment.push({ equipment_id: ++eqSeq, ...row });
        n++;
      }
      send(res, 200, { ok: true, saved: n, skipped_clinics: [] }); return true;
    }
    if (body.action === 'add') {
      let cat = body.item_id ? catalog.find((x) => x.item_id === body.item_id) : catalog.find((x) => x.item_name.toLowerCase() === String(body.item_name).toLowerCase() && x.item_kind === body.item_kind);
      if (!cat) { cat = { item_id: ++catSeq, item_name: body.item_name, item_kind: body.item_kind, list_status: 'PENDING' }; catalog.push(cat); }
      body.item_name = cat.item_name; body.item_id = cat.item_id;
      if (body.item_kind === 'MACHINE' && !body.serial_no) { send(res, 400, { error: 'Serial # is required for a machine.' }); return true; }
      const due = body.ppm_due_date || (body.last_ppm_date && body.ppm_interval_months ? new Date(new Date(body.last_ppm_date).setMonth(new Date(body.last_ppm_date).getMonth() + Number(body.ppm_interval_months))).toISOString().slice(0, 10) : null);
      equipment.push({ equipment_id: ++eqSeq, responsible_staff_id: session.role === 'ADMIN' ? null : session.sid, responsible_name: session.role === 'ADMIN' ? null : session.name, clinic_id: body.clinic_id, item_id: body.item_id, requires_ppm: cat.requires_ppm || 'N', list_status: cat.list_status, item_name: body.item_name, item_kind: body.item_kind, serial_no: body.item_kind === 'MACHINE' ? body.serial_no : null, quantity: body.item_kind === 'MACHINE' ? 1 : body.quantity, last_ppm_date: body.last_ppm_date || null, ppm_due_date: due,
        ppm_status: cat.requires_ppm !== 'Y' ? 'NOT_REQUIRED' : !due ? 'MISSING_DATE' : due < today ? 'OVERDUE' : 'OK', condition_status: 'IN_SERVICE', last_verified_by_name: session.name, last_verified_on: today });
      send(res, 200, { ok: true }); return true;
    }
    const e = equipment.find((x) => x.equipment_id === body.equipment_id);
    if (session.role !== 'ADMIN' && e.responsible_staff_id == null) { if (body.action !== 'update') { send(res, 403, { error: 'General machines are kept by the CIC.' }); return true; } for (const k of Object.keys(body)) if (!['action', 'equipment_id', 'last_ppm_date', 'ppm_due_date'].includes(k)) delete body[k]; }
    if (body.action === 'update') Object.assign(e, Object.fromEntries(Object.entries(body).filter(([k]) => ['quantity', 'serial_no', 'last_ppm_date', 'ppm_due_date', 'condition_status', 'notes'].includes(k))));
    e.last_verified_by_name = session.name; e.last_verified_on = today;
    send(res, 200, { ok: true }); return true;
  }
  return false;
}

let session = null; // single-user mock: { sid, name, role }
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };

function apiHandler(req, res, url, body) {
  const p = url.pathname.replace('/api/', '');
  const q = Object.fromEntries(url.searchParams);
  const need = (role) => { if (!session) { send(res, 401, { error: 'Please sign in.' }); return false; } if (role === 'ADMIN' && session.role !== 'ADMIN') { send(res, 403, { error: 'Only the CIC can do this.' }); return false; } return true; };
  if (extraApi(req, res, p, q, body, need)) return;
  switch (p) {
    case 'me': return send(res, 200, { user: session ? { ...session, homeClinic: ST[session.sid] ? ST[session.sid].home_clinic_id : null } : null });
    case 'login':
      if (body.employee_no === '9001' && body.password === 'Test1234') { session = { sid: 99, name: 'Wejdan', role: 'ADMIN', mustChange: false }; return send(res, 200, { user: session }); }
      if (body.employee_no === '4471' && body.password === 'Temp234abc') { session = { sid: 8, name: 'Haifa', role: 'STAFF', mustChange: true }; return send(res, 200, { user: session }); }
      return send(res, 401, { error: 'Staff ID or password is not correct. 4 attempt(s) left.' });
    case 'logout': session = null; return send(res, 200, { ok: true });
    case 'change-password': session.mustChange = false; return send(res, 200, { user: session });
    case 'reference': return send(res, 200, { clinics, categories, doctors, staff, types, sessions: [] });
    case 'board': if (!(session && session.role === 'ADMIN') && q.date > today) return send(res, 200, { date: q.date, hidden: true, assignments: [] });
      return send(res, 200, { date: q.date, assignments: current().filter((r) => r.work_date === q.date) });
    case 'assign': {
      if (!need()) return;
      const out = [];
      for (const e of body.entries) {
        const grp = ++grpSeq;
        (e.doctor_ids && e.doctor_ids.length ? e.doctor_ids : [null]).forEach((d, j) => out.push(addRow({ ...e, work_date: body.work_date, doctor_id: d, group: grp, supersedes_log_id: (e.supersedes_log_ids || [])[j] || e.supersedes_log_id }, session.name)));
      }
      return send(res, 200, { ok: true, written: out });
    }
    case 'history': if (!need('ADMIN')) return; return send(res, 200, { from: q.from, to: q.to, rows: logs.filter((r) => r.work_date >= q.from && r.work_date <= q.to && (!q.staff_id || r.staff_id === Number(q.staff_id))).slice().reverse() });
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
    case 'n2o-bookings': {
      if (req.method === 'GET' && q.list) { if (!need('ADMIN')) return; return send(res, 200, { bookings: n2o.filter((x) => x.status !== 'CANCELLED') }); }
      if (req.method === 'GET') { const t = n2o.filter((x) => x.work_date === q.date && x.status !== 'CANCELLED'); return send(res, 200, { date: q.date, AM: t.some((x) => x.session_code === 'AM'), PM: t.some((x) => x.session_code === 'PM') }); }
      if (body.action) { const x = n2o.find((y) => y.booking_id === body.booking_id); x.status = body.action === 'cancel' ? 'CANCELLED' : 'SEEN'; return send(res, 200, { ok: true }); }
      if (!String(body.pedo_resident || '').trim()) return send(res, 400, { error: 'Type the name of the PEDO resident.' });
      if (n2o.some((x) => x.work_date === body.work_date && x.session_code === body.session && x.status !== 'CANCELLED')) return send(res, 400, { error: 'Clinic 11 is already booked for nitrous oxide that session.' });
      n2o.push({ booking_id: n2o.length + 1, work_date: body.work_date, session_code: body.session, status: 'NEW', pedo_resident: body.pedo_resident, note: body.note, doctor_name: D[body.doctor_id].display_name, doctor_category: D[body.doctor_id].category_code, supervisor_name: D[body.supervisor_doctor_id].display_name });
      return send(res, 200, { ok: true, message: 'Booked. The CIC has been notified.' });
    }
    case 'booking-action': {
      if (!need('ADMIN')) return;
      const b = bookings.find((x) => x.booking_id === body.booking_id);
      if (body.action === 'cancel') b.status = 'CANCELLED';
      if (body.action === 'assign') { b.status = 'ASSIGNED'; b.assigned_staff = ST[body.staff_id].display_name;
        const g = ++grpSeq; [b.doctor_id, DID(b.assisting_doctor_name)].forEach((d) => addRow({ work_date: b.work_date, session: b.session_code, staff_id: body.staff_id, type_code: 'SURGERY', doctor_id: d, clinic_id: body.clinic_id, group: g, notes: 'Booking #' + b.booking_id }, session.name)); }
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
      return send(res, 200, { staff: [{ staff_id: 99, display_name: 'Wejdan', employee_no: '9001', staff_type: 'CIC', app_role: 'ADMIN', login_status: 'ACTIVE', last_login: today + ' 18:40', devices: 0 }, ...staff.map((s) => ({ ...s, app_role: 'STAFF', employee_no: { Rhoda: '111942', Haifa: '144058', Sharifah: '140536' }[s.display_name] || null, login_status: 'NOT_SET', last_login: null, devices: 0 }))] });
    case 'push-key': return send(res, 200, { publicKey: null });
    case 'push-test': if (!need()) return; return send(res, 200, { status: 'QUIET_HOURS' });
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
