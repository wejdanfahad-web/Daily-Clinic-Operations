/* ENDO Clinic Operations — dashboard (no build step).
   All data comes from /api/*. Text is always inserted with textContent, never as HTML. */
'use strict';

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === undefined || kid === null || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const svg = (paths, size = 13) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  for (const d of paths) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p); }
  return s;
};
const bellIcon = () => svg(['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0']);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/' + path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || 'Error ' + res.status); e.status = res.status; throw e; }
  return data;
}

let toastTimer;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ---------------------------------------------------------------- dates (Riyadh)
const riyadhIso = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const TODAY = () => riyadhIso();
const isoToDate = (iso) => new Date(iso + 'T12:00:00Z');
const addDays = (iso, n) => { const d = isoToDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso) => isoToDate(iso).getUTCDay();
const isWeekend = (iso) => dow(iso) === 5 || dow(iso) === 6;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (iso) => { const d = isoToDate(iso); return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const fmtLong = (iso) => { const d = isoToDate(iso); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const nextWorkday = (iso, dir = 1) => { let d = addDays(iso, dir); while (isWeekend(d)) d = addDays(d, dir); return d; };
const daysBetween = (a, b) => Math.round((isoToDate(b) - isoToDate(a)) / 86400e3);

// ---------------------------------------------------------------- state
const S = {
  me: null,
  ref: null,          // reference lists
  tab: 'assign',
  date: TODAY(),
  board: null,        // { date, assignments }
  boardsCache: {},    // public boards for other dates (find my clinic, bookings)
  bookings: null, queues: null, history: null,
  compliance: null, appraisals: null, staffAdmin: null, staffMsg: null,
};

const isCic = () => S.me && S.me.role === 'ADMIN' && !S.me.mustChange;
const isStaff = () => S.me && !S.me.mustChange;
const canEditDay = () => isCic() || (S.me && S.me.inCharge && S.date === TODAY());

const TABS = [
  { id: 'assign', label: 'Daily Assignment', who: 'public' },
  { id: 'compliance', label: 'Daily checklists Compliance', who: 'staff' },
  { id: 'appraisals', label: 'Annual Appraisal', who: 'staff' },
  { id: 'staff', label: 'Staff & logins', who: 'cic' },
];
const tabAllowed = (t) => t.who === 'public' || (t.who === 'staff' && isStaff()) || (t.who === 'cic' && isCic());

// ---------------------------------------------------------------- reference helpers
const refMaps = () => {
  if (S.ref._maps) return S.ref._maps;
  const cats = Object.fromEntries(S.ref.categories.map((c) => [c.category_code, c]));
  const docs = Object.fromEntries(S.ref.doctors.map((d) => [Number(d.doctor_id), d]));
  const staff = Object.fromEntries(S.ref.staff.map((s) => [Number(s.staff_id), s]));
  const types = Object.fromEntries(S.ref.types.map((t) => [t.type_code, t]));
  return (S.ref._maps = { cats, docs, staff, types });
};
function catStyle(code) {
  const c = code && refMaps().cats[code];
  return c ? { background: c.chip_bg, color: c.chip_fg, borderColor: c.chip_bg } : { background: '#FFFFFF', color: '#17262B', borderColor: '#9AA49F', borderStyle: 'dashed' };
}
const catLabel = (code) => code || '?';

// ---------------------------------------------------------------- routing
function readHash() {
  const [tab, date] = location.hash.replace(/^#\/?/, '').split('/');
  if (tab && TABS.some((t) => t.id === tab)) S.tab = tab;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) S.date = date;
}
function go(tab, date) {
  if (tab && tab !== S.tab) S.staffMsg = null;
  S.tab = tab || S.tab;
  if (date) S.date = date;
  const hash = '#/' + S.tab + (S.tab === 'assign' && S.date !== TODAY() ? '/' + S.date : '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
  render();
}

// ---------------------------------------------------------------- header
function renderHeader() {
  const nav = $('tabs'); nav.textContent = '';
  for (const t of TABS.filter(tabAllowed)) {
    nav.appendChild(h('button', { type: 'button', class: 'tab', 'aria-current': S.tab === t.id ? 'page' : null, onclick: () => go(t.id) }, t.label));
  }
  $('todayLabel').textContent = fmtLong(TODAY());
  $('roleLabel').textContent = !S.me ? 'Public view · read only'
    : S.me.role === 'ADMIN' ? `${S.me.name} · CIC`
    : `${S.me.name} · Staff${S.me.inCharge ? ' · in charge (' + S.me.inChargeSession + ')' : ''}`;
  $('authBtn').textContent = S.me ? 'Sign out' : 'Staff sign in';
}

// ---------------------------------------------------------------- dialogs
function openDialog(build) {
  const dlg = $('dlg'), body = $('dlgBody');
  body.textContent = '';
  build(body, () => dlg.close());
  if (!dlg.open) dlg.showModal();
}

function signInDialog() {
  openDialog((body, close) => {
    const msg = h('div', { class: 'msg bad', hidden: true, role: 'alert' });
    const id = h('input', { class: 'in', autocomplete: 'username', required: true, id: 'siId' });
    const pw = h('input', { class: 'in', type: 'password', autocomplete: 'current-password', required: true, id: 'siPw' });
    const form = h('form', { class: 'dlg', style: { padding: 0 } },
      h('h3', null, 'Staff sign in'),
      h('label', { class: 'f' }, 'Staff ID', id),
      h('label', { class: 'f' }, 'Password', pw),
      msg,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
        h('button', { type: 'submit', class: 'btn dark' }, 'Sign in')),
      h('div', { class: 'hint' }, 'Forgot your password? Ask the CIC for a new temporary one.'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('login', { method: 'POST', body: { employee_no: id.value, password: pw.value } });
        close(); await loadMe(); S.board = null; render();
      } catch (err) { msg.textContent = err.message; msg.hidden = false; }
    });
    body.appendChild(form);
    setTimeout(() => id.focus(), 30);
  });
}

function changePasswordDialog() {
  openDialog((body) => {
    const msg = h('div', { class: 'msg bad', hidden: true, role: 'alert' });
    const cur = h('input', { class: 'in', type: 'password', autocomplete: 'current-password', required: true });
    const nw = h('input', { class: 'in', type: 'password', autocomplete: 'new-password', required: true });
    const nw2 = h('input', { class: 'in', type: 'password', autocomplete: 'new-password', required: true });
    const form = h('form', { class: 'dlg', style: { padding: 0 } },
      h('h3', null, 'Choose your own password'),
      h('div', { class: 'note' }, 'You signed in with a temporary password. Pick a new one (8+ characters, letters and numbers).'),
      h('label', { class: 'f' }, 'Temporary password', cur),
      h('label', { class: 'f' }, 'New password', nw),
      h('label', { class: 'f' }, 'Repeat new password', nw2),
      msg,
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn dark' }, 'Save password')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (nw.value !== nw2.value) { msg.textContent = 'The two new passwords are different.'; msg.hidden = false; return; }
      try {
        await api('change-password', { method: 'POST', body: { current_password: cur.value, new_password: nw.value } });
        $('dlg').close(); await loadMe(); render(); toast('Password saved.');
      } catch (err) { msg.textContent = err.message; msg.hidden = false; }
    });
    body.appendChild(form);
  });
  $('dlg').addEventListener('cancel', (e) => { if (S.me && S.me.mustChange) e.preventDefault(); }, { once: true });
}

// ---------------------------------------------------------------- data loading
async function loadMe() {
  try { S.me = (await api('me')).user; } catch { S.me = null; }
  if (S.me && S.me.mustChange) changePasswordDialog();
}
async function loadRef() { if (!S.ref) S.ref = await api('reference'); }
async function loadBoard(date, { live = !!S.me } = {}) {
  return api(`board?date=${date}${live && S.me && !S.me.mustChange ? '&live=1' : ''}`);
}
async function publicBoard(date) {
  if (!S.boardsCache[date]) S.boardsCache[date] = api(`board?date=${date}`).catch((e) => { delete S.boardsCache[date]; throw e; });
  return S.boardsCache[date];
}

// ---------------------------------------------------------------- board model
function groupsFor(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = r.assignment_group_id;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return [...by.values()];
}

function chipFor(group, homeClinic) {
  const first = group[0];
  const { types } = refMaps();
  const t = types[first.type_code] || { category: first.category, type_name: first.type_name };
  if (first.type_code === 'SURGERY') {
    return [h('span', { class: 'chip surg' }, 'Surgery · ' + group.map((g) => g.doctor_name).filter(Boolean).join(' + '))];
  }
  if (first.type_code === 'IN_CHARGE') return [h('span', { class: 'chip charge' }, bellIcon(), 'In charge')];
  if (t.category === 'UNAVAILABLE') return [h('span', { class: 'chip off' }, t.type_name || first.type_name)];
  if (t.category === 'DUTY') return [h('span', { class: 'chip duty' }, first.type_name + (first.notes ? ' · ' + first.notes : ''))];
  // clinical: one chip per doctor
  return group.map((g) => {
    const away = g.clinic_id && Number(g.clinic_id) !== Number(homeClinic);
    return h('span', { class: 'chip', style: catStyle(g.doctor_category) },
      h('span', { class: 'cat' }, catLabel(g.doctor_category)),
      g.doctor_name || g.type_name,
      first.type_code === 'PEDO' ? ' · PEDO' : null,
      away ? h('span', { class: 'tag' }, 'Cl ' + g.clinic_id) : null);
  });
}

function boardModel(assignments) {
  const staff = [...S.ref.staff].sort((a, b) => (a.home_clinic_id ?? 999) - (b.home_clinic_id ?? 999) || a.display_name.localeCompare(b.display_name));
  const bySid = new Map();
  for (const a of assignments) {
    const k = Number(a.staff_id);
    if (!bySid.has(k)) bySid.set(k, []);
    bySid.get(k).push(a);
  }
  // also show staff not in the reference list (e.g. CIC covering)
  const known = new Set(staff.map((s) => Number(s.staff_id)));
  for (const [sid, rows] of bySid) if (!known.has(sid)) staff.push({ staff_id: sid, display_name: rows[0].staff_name, home_clinic_id: null });

  return staff.map((s) => {
    const rows = bySid.get(Number(s.staff_id)) || [];
    const am = rows.filter((r) => r.session_code === 'AM' || r.session_code === 'DAY');
    const pm = rows.filter((r) => r.session_code === 'PM' || r.session_code === 'DAY');
    const unavailable = rows.length > 0 && rows.every((r) => r.category === 'UNAVAILABLE');
    return { staff: s, am, pm, rows, unavailable };
  });
}

function kpis(assignments, model) {
  const onDuty = model.filter((m) => m.rows.some((r) => r.category !== 'UNAVAILABLE')).length;
  const off = model.filter((m) => m.unavailable).length;
  const docs = (sess) => new Set(assignments.filter((a) => a.doctor_id && (a.session_code === sess || a.session_code === 'DAY')).map((a) => a.doctor_id)).size;
  const surg = new Set(assignments.filter((a) => a.type_code === 'SURGERY').map((a) => a.assignment_group_id)).size;
  const card = (l, v, s) => h('div', { class: 'kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 's' }, s));
  return h('div', { class: 'kpis' },
    card('On duty', onDuty, `of ${S.ref.staff.length} staff`),
    card('Not available', off, 'leave, excuse or sick leave'),
    card('Doctors in session', `${docs('AM')} · ${docs('PM')}`, 'AM · PM'),
    card('Surgeries', surg, surg === 1 ? 'surgery today' : 'surgeries'));
}

// ---------------------------------------------------------------- page: daily assignment
async function renderAssign(app) {
  await loadRef();
  const date = S.date;
  const weekend = isWeekend(date);
  if (!S.board || S.board.date !== date) {
    app.appendChild(h('div', { class: 'loading' }, 'Loading the board…'));
    S.board = weekend ? { date, assignments: [] } : await loadBoard(date);
    app.textContent = '';
  }
  const assignments = S.board.assignments;
  const model = boardModel(assignments);
  const editable = canEditDay() && !weekend;

  if (!weekend) app.appendChild(kpis(assignments, model));

  const today = TODAY();
  const badge = date === today ? h('span', { class: 'badge-day' }, 'TODAY') : h('span', { class: 'badge-day other' }, date < today ? 'PAST' : 'UPCOMING');

  const board = h('section', { class: 'card board', 'aria-label': 'Daily assignment' },
    h('div', { class: 'card-head' },
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, h('h2', null, 'Daily assignment · ' + fmtLong(date)), badge),
      h('div', { class: 'note' }, editable ? 'Tap a cell to assign, change or remove' : 'Cl = clinic number, shown when the doctor is not in the assistant\'s own clinic')));

  if (weekend) {
    board.appendChild(h('div', { class: 'closed' }, h('b', null, `No clinic sessions on ${DAYS[dow(date)]}`), 'Clinics run Sunday to Thursday.'));
  } else {
    if (!assignments.length) {
      board.appendChild(h('div', { class: 'msg', style: { margin: '12px 20px 0', background: '#F7F8F6', color: '#3E4B48' } },
        editable ? 'Nothing recorded for this day yet. Tap any cell below to start assigning.' : 'The assignments for this day have not been published yet.'));
    }
    const tbody = h('tbody');
    for (const m of model) {
      const cell = (sess, rows) => {
        const chips = groupsFor(rows).flatMap((g) => chipFor(g, m.staff.home_clinic_id));
        const inner = chips.length ? chips : [h('span', { class: 'empty' }, editable ? '+ assign' : '—')];
        return editable
          ? h('button', { type: 'button', class: 'cell', 'aria-label': `${m.staff.display_name}, ${sess}: edit`, onclick: () => editCell(m, sess) }, inner)
          : h('div', { class: 'cell' }, inner);
      };
      tbody.appendChild(h('tr', { class: m.unavailable ? 'unavail' : null },
        h('td', { class: 'name' }, m.staff.display_name),
        h('td', { class: 'ci' }, m.staff.home_clinic_id ?? '—'),
        h('td', null, cell('AM', m.am)),
        h('td', null, cell('PM', m.pm))));
    }
    board.appendChild(h('div', { class: 'scroll-x' },
      h('table', { class: 'grid board-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col', style: { width: '150px' } }, 'Assistant'),
          h('th', { scope: 'col', style: { width: '76px' } }, 'Clinic #'),
          h('th', { scope: 'col' }, 'AM · 9:00'),
          h('th', { scope: 'col' }, 'PM · 13:00'))),
        tbody)));

    const leg = h('div', { class: 'legend' }, h('b', { style: { color: '#17262B' } }, 'Doctor category'));
    for (const c of S.ref.categories) {
      leg.appendChild(h('span', { class: 'item' }, h('span', { class: 'sw', style: { background: c.chip_bg, color: c.chip_fg } }, c.category_code),
        ['FC', 'SP'].includes(c.category_code) ? c.category_name : null));
    }
    board.appendChild(leg);
    board.appendChild(h('div', { class: 'legend', style: { borderTop: 0, paddingTop: 0 } },
      h('span', { class: 'item' }, h('i', { class: 'dot', style: { background: '#F6DE6A' } }), 'Surgery'),
      h('span', { class: 'item' }, h('i', { class: 'dot', style: { background: '#EAE3F8' } }), 'Duty'),
      h('span', { class: 'item' }, h('i', { class: 'dot', style: { background: '#2447B8' } }), 'In charge · staff notified'),
      h('span', { class: 'item' }, h('i', { class: 'dot', style: { background: '#F7DDE1' } }), 'Not available')));
  }

  const dateInput = h('input', { type: 'date', value: date, onchange: (e) => e.target.value && go('assign', e.target.value) });
  board.appendChild(h('nav', { class: 'daynav', 'aria-label': 'Choose day' },
    h('button', { type: 'button', class: 'btn', onclick: () => go('assign', nextWorkday(date, -1)) }, '← Previous day'),
    h('div', { class: 'mid' },
      h('label', null, 'Go to date', dateInput),
      date !== today ? h('button', { type: 'button', class: 'btn dark', onclick: () => go('assign', today) }, 'Back to today') : null),
    h('button', { type: 'button', class: 'btn', onclick: () => go('assign', nextWorkday(date, 1)) }, 'Next day →')));

  const side = h('div', { class: 'side' });
  app.appendChild(h('div', { class: 'daily' }, board, side));

  if (isStaff()) side.appendChild(notifyCard());
  side.appendChild(findMyClinicCard());
  side.appendChild(bookSurgeryCard());
  if (isCic()) {
    side.appendChild(await upcomingSurgeriesCard());
    side.appendChild(await logCard(date));
  }
}

// ---------- CIC cell editor
function editCell(m, sess) {
  const { types, docs } = refMaps();
  const date = S.date;
  const current = groupsFor(sess === 'AM' ? m.am : m.pm);

  openDialog((body, close) => {
    const msg = h('div', { class: 'msg bad', hidden: true, role: 'alert' });
    const showErr = (t) => { msg.textContent = t; msg.hidden = false; };

    body.appendChild(h('h3', null, `${m.staff.display_name} · ${fmtDay(date)} · ${sess}`));

    // current assignments with remove
    const cur = h('div', { class: 'current' });
    if (!current.length) cur.appendChild(h('div', { class: 'note' }, 'Nothing assigned yet.'));
    for (const g of current) {
      const label = chipFor(g, m.staff.home_clinic_id);
      cur.appendChild(h('div', { class: 'item' }, h('div', { class: 'cell' }, label),
        h('button', { type: 'button', class: 'btn small danger', onclick: async () => {
          try {
            await api('assign', { method: 'POST', body: { work_date: date, client_request_id: crypto.randomUUID(),
              entries: g.map((r) => ({ session: r.session_code, staff_id: r.staff_id, type_code: r.type_code, doctor_ids: r.doctor_id ? [r.doctor_id] : [], clinic_id: r.clinic_id, supersedes_log_id: r.log_id, action: 'CANCEL' })) } });
            close(); toast('Removed. The change is kept in the log.'); await refreshBoard();
          } catch (err) { showErr(err.message); }
        } }, g[0].session_code === 'DAY' ? 'Remove (whole day)' : 'Remove')));
    }
    body.append(h('div', { class: 'f', style: { fontSize: '12px', color: '#4F5D5A' } }, 'Current'), cur);

    // add form
    const typeSel = h('select', { class: 'in' });
    const groups = { CLINICAL: 'Clinic', SURGERY: 'Surgery', DUTY: 'Duty', UNAVAILABLE: 'Not available' };
    for (const [cat, label] of Object.entries(groups)) {
      const og = h('optgroup', { label });
      S.ref.types.filter((t) => t.category === cat).forEach((t) => og.appendChild(h('option', { value: t.type_code }, t.type_name)));
      typeSel.appendChild(og);
    }
    const docOpts = () => [h('option', { value: '' }, 'Choose…'), ...S.ref.doctors.map((d) => h('option', { value: d.doctor_id }, `${d.display_name}${d.category_code ? ' · ' + d.category_code : ''}`))];
    const doc1 = h('select', { class: 'in' }, docOpts());
    const doc2 = h('select', { class: 'in' }, docOpts());
    const clinicSel = h('select', { class: 'in' }, S.ref.clinics.map((c) => h('option', { value: c.clinic_id }, c.clinic_name)));
    clinicSel.value = m.staff.home_clinic_id || '';
    const wholeDay = h('input', { type: 'checkbox' });
    const notes = h('input', { class: 'in', maxlength: 120, placeholder: 'Optional note' });

    const doc1Label = h('label', { class: 'f' }, 'Doctor', doc1);
    const doc2Label = h('label', { class: 'f' }, 'Assisted by (2nd doctor)', doc2);
    const clinicLabel = h('label', { class: 'f' }, 'Clinic', clinicSel);
    const dayLabel = h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' } }, wholeDay, 'Whole day (AM + PM)');
    const sync = () => {
      const t = types[typeSel.value];
      const needsDoc = t && t.needs_doctor === 'Y';
      doc1Label.hidden = !needsDoc;
      doc1Label.firstChild.textContent = typeSel.value === 'SURGERY' ? 'Operator' : 'Doctor';
      doc2Label.hidden = typeSel.value !== 'SURGERY';
      clinicLabel.hidden = !(t && t.category === 'CLINICAL');
      dayLabel.hidden = !(t && (t.category === 'UNAVAILABLE' || t.category === 'DUTY'));
    };
    typeSel.addEventListener('change', sync);
    doc1.addEventListener('change', () => {
      // a doctor already placed in another clinic this session → suggest that clinic (shared cell)
      const d = Number(doc1.value);
      const other = S.board.assignments.find((a) => Number(a.doctor_id) === d && a.clinic_id && (a.session_code === sess || a.session_code === 'DAY'));
      if (other && typeSel.value !== 'SURGERY') clinicSel.value = other.clinic_id;
    });
    sync();

    body.appendChild(h('div', { class: 'f', style: { fontSize: '12px', color: '#4F5D5A', marginTop: '6px' } }, 'Add'));
    body.appendChild(h('label', { class: 'f' }, 'Type', typeSel));
    body.appendChild(h('div', { class: 'grid2' }, doc1Label, doc2Label));
    body.appendChild(clinicLabel);
    body.appendChild(dayLabel);
    body.appendChild(h('label', { class: 'f' }, 'Note', notes));
    body.appendChild(msg);

    const save = h('button', { type: 'button', class: 'btn dark', onclick: async () => {
      const t = types[typeSel.value];
      const ids = [doc1.value, typeSel.value === 'SURGERY' ? doc2.value : ''].filter(Boolean).map(Number);
      if (t.needs_doctor === 'Y' && !ids.length) return showErr('Choose the doctor.');
      if (typeSel.value === 'SURGERY' && ids.length === 2 && ids[0] === ids[1]) return showErr('The two doctors must be different.');
      // max assistants per doctor this session (Prof. Ahmed = 2)
      if (t.category === 'CLINICAL') {
        const d = docs[ids[0]];
        const already = new Set(S.board.assignments.filter((a) => Number(a.doctor_id) === ids[0] && a.category === 'CLINICAL' && (a.session_code === sess || a.session_code === 'DAY')).map((a) => a.staff_id)).size;
        if (d && already >= Number(d.max_assistants || 1) && !confirm(`${d.display_name} already has ${already} assistant(s) this session (allowed: ${d.max_assistants}). Assign anyway?`)) return;
      }
      save.disabled = true;
      try {
        await api('assign', { method: 'POST', body: { work_date: date, client_request_id: crypto.randomUUID(), entries: [{
          session: wholeDay.checked && !dayLabel.hidden ? 'DAY' : sess, staff_id: m.staff.staff_id, type_code: typeSel.value,
          doctor_ids: ids, clinic_id: clinicLabel.hidden ? null : Number(clinicSel.value) || null, notes: notes.value || null }] } });
        close(); toast('Saved.'); await refreshBoard();
      } catch (err) { showErr(err.message); save.disabled = false; }
    } }, 'Save');
    body.appendChild(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: close }, 'Close'), save));
  });
}

async function refreshBoard() {
  S.board = null; S.history = null; S.boardsCache = {};
  render();
}

// ---------- notifications card (signed-in staff)
function notifyCard() {
  const card = h('section', { class: 'card pad', 'aria-label': 'Phone notifications' }, h('h2', null, 'Phone notifications'));
  const status = h('div', { class: 'note' });
  const btn = h('button', { type: 'button', class: 'btn primary', onclick: enablePush }, 'Turn on notifications');
  card.append(status, btn);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (ios && !standalone) status.textContent = 'On iPhone: tap Share → "Add to Home Screen", open the app from your home screen, then turn notifications on here.';
    else status.textContent = 'This browser can\'t receive notifications. Try Chrome or Safari on your phone.';
    btn.hidden = true;
  } else if (Notification.permission === 'granted') {
    status.textContent = 'You get alerts for your assignments, schedule changes and PPM reminders on this device.';
    btn.textContent = 'Re-register this device';
    btn.className = 'btn small';
  } else if (Notification.permission === 'denied') {
    status.textContent = 'Notifications are blocked for this site. Allow them in your browser settings, then reload.';
    btn.hidden = true;
  } else {
    status.textContent = 'Get alerts for your assignments, schedule changes and PPM reminders.';
  }
  return card;
}

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function enablePush() {
  try {
    const { publicKey } = await api('push-key');
    if (!publicKey) return toast('Notifications are not set up on the server yet.');
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications were not allowed.');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) });
    const label = (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Computer') + ' · ' + (/Edg\//.test(navigator.userAgent) ? 'Edge' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'Browser');
    await api('push-subscribe', { method: 'POST', body: { subscription: sub.toJSON(), label } });
    toast('Notifications are on for this device.');
    render();
  } catch (err) { toast('Could not turn on notifications: ' + err.message); }
}

// ---------- find my clinic
function findMyClinicCard() {
  let saved = '';
  try { saved = localStorage.getItem('findDoc') || ''; } catch { /* private mode */ }
  const sel = h('select', { class: 'in' }, h('option', { value: '' }, 'Choose your name…'), S.ref.doctors.map((d) => h('option', { value: d.doctor_id }, d.display_name)));
  sel.value = saved;
  const list = h('ol', { class: 'plain find' });
  const fill = async () => {
    list.textContent = '';
    const id = Number(sel.value);
    try { localStorage.setItem('findDoc', sel.value); } catch { /* ignore */ }
    if (!id) return;
    const days = []; let d = isWeekend(TODAY()) ? nextWorkday(TODAY()) : TODAY();
    while (days.length < 5) { days.push(d); d = nextWorkday(d); }
    for (const day of days) {
      const li = h('li', null, h('b', null, fmtDay(day)), h('span', { class: 'note' }, 'Loading…'));
      list.appendChild(li);
      publicBoard(day).then((b) => {
        const mine = b.assignments.filter((a) => Number(a.doctor_id) === id);
        const part = (sess) => {
          const rows = mine.filter((a) => a.session_code === sess || a.session_code === 'DAY');
          if (!rows.length) return null;
          return `${sess} · ` + rows.map((r) => (r.type_code === 'SURGERY' ? 'Surgery' : (r.clinic_id ? 'Clinic ' + r.clinic_id : 'Clinic ?')) + ' with ' + r.staff_name).join(', ');
        };
        const text = [part('AM'), part('PM')].filter(Boolean).join('  ·  ');
        li.lastChild.textContent = text || 'Not published yet / no clinic';
        li.lastChild.className = text ? '' : 'note';
      }).catch(() => { li.lastChild.textContent = 'Could not load'; });
    }
  };
  sel.addEventListener('change', fill);
  if (saved) fill();
  return h('section', { class: 'card pad', 'aria-label': 'Find my clinic' },
    h('h2', null, 'Find my clinic'),
    h('label', { class: 'f' }, 'Doctor', sel), list,
    h('div', { class: 'hint' }, 'Next 5 working days. Open to everyone, no login needed.'));
}

// ---------- book a surgery (public)
function bookSurgeryCard() {
  const docOpts = (first) => [h('option', { value: '' }, first), ...S.ref.doctors.map((d) => h('option', { value: d.doctor_id }, d.display_name))];
  const op = h('select', { class: 'in' }, docOpts('Choose…'));
  const as = h('select', { class: 'in' }, docOpts('Choose…'));
  const sup = h('select', { class: 'in' }, h('option', { value: '' }, 'Choose…'), S.ref.doctors.filter((d) => d.category_code === 'FC').map((d) => h('option', { value: d.doctor_id }, d.display_name)));
  const date = h('input', { class: 'in', type: 'date', min: TODAY() });
  const note = h('input', { class: 'in', maxlength: 120, placeholder: 'e.g. apicoectomy, perio collab' });
  const honey = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'sr-only', 'aria-hidden': 'true' });
  let sess = 'AM';
  const segBtns = ['AM', 'PM'].map((k) => h('button', { type: 'button', 'aria-pressed': k === sess ? 'true' : 'false', onclick: () => { sess = k; segBtns.forEach((b) => b.setAttribute('aria-pressed', b.textContent === k ? 'true' : 'false')); } }, k));
  const slots = h('div', { class: 'note' }, 'Max 2 surgeries per session · 3 per day');
  const err = h('div', { class: 'msg bad', hidden: true, role: 'alert' });
  const ok = h('div', { class: 'msg ok', hidden: true, role: 'status' });

  date.addEventListener('change', async () => {
    if (!date.value) return;
    if (isWeekend(date.value)) { slots.textContent = 'Clinics are closed on Friday and Saturday.'; return; }
    try {
      const r = await api('bookings?date=' + date.value);
      slots.textContent = `${fmtDay(date.value)}: AM ${r.AM} of ${r.limits.per_session} booked · PM ${r.PM} of ${r.limits.per_session} booked · day ${r.day} of ${r.limits.per_day}`;
    } catch { /* keep default text */ }
  });

  const send = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    err.hidden = true; ok.hidden = true;
    send.disabled = true;
    try {
      const r = await api('bookings', { method: 'POST', body: { doctor_id: Number(op.value), assisting_doctor_id: Number(as.value), supervisor_doctor_id: Number(sup.value), work_date: date.value, session: sess, note: note.value, website: honey.value } });
      ok.textContent = r.message; ok.hidden = false;
      note.value = ''; date.dispatchEvent(new Event('change'));
      if (isCic()) { S.bookings = null; render(); }
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    send.disabled = false;
  } }, 'Send to CIC');

  return h('section', { class: 'card pad', 'aria-label': 'Book a surgery slot' },
    h('div', { class: 'row-between' }, h('h2', null, 'Book a surgery slot'), h('span', { class: 'pill surg' }, 'FOR DOCTORS')),
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Operator', op), h('label', { class: 'f' }, 'Assisted by', as)),
    h('label', { class: 'f' }, 'Case Supervisor (faculty)', sup),
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Date', date), h('div', { class: 'f', role: 'group', 'aria-label': 'Session', style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#4F5D5A' } }, 'Session', h('div', { class: 'seg' }, segBtns))),
    h('label', { class: 'f' }, 'Note (optional, no patient details)', note), honey,
    slots, err, send, ok);
}

// ---------- upcoming surgeries (CIC)
async function upcomingSurgeriesCard() {
  const card = h('section', { class: 'card pad', 'aria-label': 'Upcoming surgeries' });
  try {
    if (!S.bookings) S.bookings = (await api('bookings?list=upcoming')).bookings;
    if (!S.queues) S.queues = (await api('queues')).queues;
  } catch (e) { card.append(h('h2', null, 'Upcoming surgeries'), h('div', { class: 'msg bad' }, e.message)); return card; }

  const newCount = S.bookings.filter((b) => b.status === 'NEW').length;
  card.appendChild(h('div', { class: 'row-between' }, h('h2', null, 'Upcoming surgeries'), newCount ? h('span', { class: 'pill red' }, `${newCount} new`) : null));
  if (!S.bookings.length) { card.appendChild(h('div', { class: 'note' }, 'No surgeries booked. Doctors book with the form above; you get a notification for each one.')); return card; }

  const queue = S.queues.filter((q) => q.rotation_code === 'SURGERY' && q.is_eligible === 'Y').sort((a, b) => a.queue_position - b.queue_position);
  const ul = h('ul', { class: 'plain', style: { gap: '8px' } });
  for (const b of S.bookings) {
    // next in line for that session: skip anyone not available or already in surgery then
    let busy = new Set();
    try {
      const day = await publicBoard(b.work_date);
      busy = new Set(day.assignments.filter((a) => (a.session_code === b.session_code || a.session_code === 'DAY') && (a.category === 'UNAVAILABLE' || a.type_code === 'SURGERY')).map((a) => Number(a.staff_id)));
    } catch { /* show queue order without the skip */ }
    const candidates = queue.filter((q) => !busy.has(Number(q.staff_id)));
    const pick = h('select', { class: 'in', style: { height: '36px' } }, candidates.map((q, i) => h('option', { value: q.staff_id }, `${q.staff_name} · ${q.total_count} surgeries${i === 0 ? ' (next in line)' : ''}`)));
    const assigned = b.status === 'ASSIGNED';
    const li = h('li', { class: 'booking' + (b.status === 'NEW' ? ' new' : '') },
      h('div', { class: 'row-between' }, h('b', null, `${fmtDay(b.work_date)} · ${b.session_code}`), h('span', { class: 'status ' + (assigned ? 'done' : b.status === 'NEW' ? 'new' : '') }, assigned ? 'Assigned' : b.status === 'NEW' ? 'New' : 'Seen')),
      h('div', { class: 'who2' },
        h('span', { class: 'catchip', style: catStyle(b.doctor_category) }, catLabel(b.doctor_category)), b.doctor_name,
        h('span', { class: 'note' }, '· assisted by'),
        h('span', { class: 'catchip', style: catStyle(b.assisting_category) }, catLabel(b.assisting_category)), b.assisting_doctor_name),
      b.supervisor_name ? h('div', { class: 'note' }, 'Case supervisor: ', h('b', { style: { color: '#17262B' } }, b.supervisor_name)) : null,
      b.note ? h('div', { class: 'note' }, b.note) : null);
    if (assigned) li.appendChild(h('div', { style: { fontSize: '13px', color: '#1F5145' } }, 'Assistant: ', h('b', null, b.assigned_staff)));
    else {
      li.appendChild(pick);
      li.appendChild(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button', { type: 'button', class: 'btn primary small', disabled: !candidates.length, onclick: async (e) => {
          e.target.disabled = true;
          try { await api('booking-action', { method: 'POST', body: { booking_id: b.booking_id, action: 'assign', staff_id: Number(pick.value) } }); toast('Assigned and notified.'); S.bookings = null; S.queues = null; await refreshBoard(); }
          catch (err) { toast(err.message); e.target.disabled = false; }
        } }, 'Assign'),
        h('button', { type: 'button', class: 'btn small', onclick: async () => {
          if (!confirm(`Cancel the surgery of ${b.doctor_name} on ${fmtDay(b.work_date)} ${b.session_code}?`)) return;
          try { await api('booking-action', { method: 'POST', body: { booking_id: b.booking_id, action: 'cancel' } }); S.bookings = null; render(); }
          catch (err) { toast(err.message); }
        } }, 'Cancel booking')));
    }
    ul.appendChild(li);
  }
  card.appendChild(ul);
  card.appendChild(h('div', { class: 'hint' }, 'Order: fewest surgeries → longest since last → A–Z. Staff not available or already in surgery that session are skipped. Not-yet-trained staff are never listed.'));
  return card;
}

// ---------- assignment log (CIC)
async function logCard(date) {
  const card = h('section', { class: 'card pad' }, h('div', { class: 'row-between' }, h('h2', null, 'Assignment log'), h('span', { class: 'note' }, 'Permanent · cannot be edited')));
  try {
    if (!S.history || S.history.from !== date) S.history = await api(`history?from=${date}&to=${date}`);
  } catch (e) { card.appendChild(h('div', { class: 'msg bad' }, e.message)); return card; }
  if (!S.history.rows.length) { card.appendChild(h('div', { class: 'note' }, 'Every assignment recorded for this day appears here with the time and who entered it.')); return card; }
  const ol = h('ol', { class: 'plain log' });
  for (const r of S.history.rows.slice(0, 60)) {
    const verb = r.action === 'CANCEL' ? 'removed: ' : r.action === 'AMEND' ? 'changed to ' : '';
    const what = `${r.type_name}${r.doctor_name ? ' · ' + r.doctor_name : ''}${r.clinic_id ? ' · Cl ' + r.clinic_id : ''} (${r.session_code})`;
    ol.appendChild(h('li', null, h('span', { class: 't' }, (r.recorded_at || '').slice(11)), h('span', null, h('b', null, r.staff_name), ' → ', verb + what, h('br'), h('span', { class: 'm' }, `by ${r.recorded_by} · #${r.log_id}`))));
  }
  card.appendChild(ol);
  return card;
}

// ---------------------------------------------------------------- page: compliance
async function renderCompliance(app) {
  const year = Number(TODAY().slice(0, 4));
  if (!S.compliance) S.compliance = await api('compliance?year=' + year);
  const { clinics, rows } = S.compliance;
  const thisMonth = TODAY().slice(0, 7);
  const months = MONTHS.map((m, i) => ({ label: m, key: `${year}-${String(i + 1).padStart(2, '0')}` }));
  const state = {};
  for (const r of rows) state[`${r.checklist_type}|${r.clinic_id}|${r.month}`] = r.is_submitted === 'Y';
  const cic = isCic();

  app.appendChild(h('div', { class: 'page-title' }, h('h2', null, `Daily checklists Compliance · ${year}`),
    h('span', { class: 'note' }, cic ? 'Tap a box to mark that month\'s sheet as checked.' : 'Ticked by the CIC after checking each clinic\'s monthly sheet.')));
  app.appendChild(h('div', { class: 'legend-row' },
    h('span', null, h('i', { style: { background: '#1F7A5C' } }), 'Done'),
    h('span', null, h('i', { style: { background: '#FBE3E1', border: '1px solid #F1B9B3' } }), 'Missed (past month)'),
    h('span', null, h('i', { style: { background: '#fff', border: '1px solid #E3B58C' } }), 'This month, not yet'),
    h('span', null, h('i', { style: { background: '#F7F8F6', border: '1px dashed #DDE1DC' } }), 'Not due yet / before tracking started')));

  // A tracker only counts from its first recorded month (room disinfection starts empty → this month).
  const startOf = (type) => rows.filter((r) => r.checklist_type === type).map((r) => r.month).sort()[0] || thisMonth;
  const grid = (type, title, sub) => {
    const start = startOf(type);
    const tbody = h('tbody');
    const totals = months.map(() => 0);
    for (const c of clinics) {
      let done = 0, due = 0;
      const cells = months.map((m, i) => {
        const key = `${type}|${c.clinic_id}|${m.key}`;
        const on = !!state[key];
        const future = m.key > thisMonth;
        const before = m.key < start && !on;
        if (!future && !before) due++;
        if (on) { done++; totals[i]++; }
        const cls = on ? 'box done' : future || before ? 'box future' : m.key === thisMonth ? 'box current' : 'box missed';
        const btn = h('button', { type: 'button', class: cls, disabled: !cic || future, 'aria-pressed': on ? 'true' : 'false',
          'aria-label': `${c.clinic_name} ${m.label}: ${on ? 'done' : future ? 'not due yet' : before ? 'not tracked' : 'not done'}` }, on ? '✓' : (!future && !before && m.key !== thisMonth ? '✗' : ''));
        if (cic && !future) btn.addEventListener('click', async () => {
          btn.disabled = true;
          try { await api('compliance', { method: 'POST', body: { clinic_id: c.clinic_id, checklist_type: type, month: m.key, checked: !on } }); state[key] = !on;
            const r = rows.find((x) => x.checklist_type === type && Number(x.clinic_id) === Number(c.clinic_id) && x.month === m.key);
            if (r) r.is_submitted = !on ? 'Y' : 'N'; else rows.push({ checklist_type: type, clinic_id: c.clinic_id, month: m.key, is_submitted: !on ? 'Y' : 'N' });
            render();
          } catch (e) { toast(e.message); btn.disabled = false; }
        });
        return h('td', null, btn);
      });
      const pct = due ? Math.round((done / due) * 100) : 0;
      tbody.appendChild(h('tr', null, h('th', { scope: 'row' }, c.clinic_name), cells,
        h('td', null, h('span', { class: 'score', style: { color: pct === 100 ? '#1F5145' : pct >= 80 ? '#3E4B48' : '#7A1E2C' } }, `${done}/${due}`))));
    }
    tbody.appendChild(h('tr', { class: 'total' }, h('th', { scope: 'row', style: { fontWeight: 600, fontSize: '12px' } }, 'Compliance'),
      months.map((m, i) => h('td', null, m.key > thisMonth || (m.key < start && !totals[i]) ? '—' : Math.round((totals[i] / clinics.length) * 100) + '%')), h('td')));
    return h('section', { class: 'card', 'aria-label': title, style: { overflow: 'hidden' } },
      h('div', { class: 'card-head' }, h('h2', { style: { fontSize: '16px' } }, title), h('span', { class: 'note' }, sub)),
      h('div', { class: 'scroll-x' }, h('table', { class: 'mgrid' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Clinic'), months.map((m) => h('th', { scope: 'col' }, m.label)), h('th', { scope: 'col' }, 'Done'))), tbody)));
  };
  app.appendChild(grid('EQUIPMENT', 'Daily equipment checklists', 'Monthly submission per clinic'));
  app.appendChild(grid('DISINFECTION', 'Room disinfection compliance', 'Monthly per clinic'));
}

// ---------------------------------------------------------------- page: annual appraisal
async function renderAppraisals(app) {
  const year = Number(TODAY().slice(0, 4));
  if (!S.appraisals) S.appraisals = await api('appraisals?year=' + year);
  const { steps, rows } = S.appraisals;
  const cic = isCic();
  const today = TODAY();
  const people = [];
  const byStaff = new Map();
  for (const r of rows) {
    if (!byStaff.has(r.staff_id)) { byStaff.set(r.staff_id, { id: r.staff_id, name: r.staff_name, steps: {} }); people.push(byStaff.get(r.staff_id)); }
    byStaff.get(r.staff_id).steps[r.step_no] = r;
  }

  app.appendChild(h('div', { class: 'page-title' }, h('h2', null, `Annual Appraisal · ${year}`),
    h('span', { class: 'note' }, cic ? 'Tap a step to mark it done or not done.' : 'Your appraisal progress. Only the CIC can update it.')));

  const heads = h('div', { class: 'ap-heads' });
  for (const s of steps) {
    const done = people.filter((p) => p.steps[s.step_no] && p.steps[s.step_no].is_done === 'Y').length;
    const left = daysBetween(today, s.due_date);
    const all = done === people.length && people.length > 0;
    const when = all ? 'Completed' : left > 0 ? `In ${left} days` : left === 0 ? 'Due today' : `Overdue ${-left} days`;
    heads.appendChild(h('div', { class: 'ap-head' }, h('b', null, s.step_name), h('span', { class: 'note' }, 'Due ' + fmtLong(s.due_date)),
      h('div', { class: 'row-between' }, h('span', { class: 'score' }, `${done}/${people.length} done`),
        h('span', { style: { fontSize: '12px', fontWeight: 600, color: all ? '#1F5145' : left < 0 ? '#7A1E2C' : left <= 14 ? '#8A4B0F' : '#4F5D5A' } }, when))));
  }
  app.appendChild(heads);

  const tbody = h('tbody');
  for (const p of people) {
    let done = 0;
    const cells = steps.map((s) => {
      const r = p.steps[s.step_no] || { is_done: 'N', status: 'PENDING' };
      const on = r.is_done === 'Y'; if (on) done++;
      const btn = h('button', { type: 'button', class: 'ap-btn' + (on ? ' done' : r.status === 'OVERDUE' ? ' overdue' : ''), disabled: !cic,
        'aria-pressed': on ? 'true' : 'false', 'aria-label': `${p.name}, ${s.step_name}: ${on ? 'done' : r.status.toLowerCase()}` },
        on ? '✓ Done' + (r.done_on ? ' · ' + fmtDay(r.done_on) : '') : r.status === 'OVERDUE' ? 'Overdue' : 'Pending');
      if (cic) btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await api('appraisals', { method: 'POST', body: { staff_id: p.id, year, step_no: s.step_no, done: !on } }); S.appraisals = null; render(); }
        catch (e) { toast(e.message); btn.disabled = false; }
      });
      return h('td', null, btn);
    });
    const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
    tbody.appendChild(h('tr', null, h('th', { scope: 'row', style: { textAlign: 'left', fontWeight: 500, padding: '6px 16px' } }, p.name), cells,
      h('td', null, h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { class: 'bar' }, h('i', { style: { width: pct + '%' } })), h('span', { class: 'score' }, pct + '%')))));
  }
  app.appendChild(h('section', { class: 'card', 'aria-label': 'Appraisal status by staff', style: { overflow: 'hidden' } },
    h('div', { class: 'scroll-x' }, h('table', { class: 'grid', style: { minWidth: '760px', fontSize: '13px' } },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Staff'), steps.map((s) => h('th', { scope: 'col' }, s.step_name)), h('th', { scope: 'col' }, 'Progress'))), tbody))));
}

// ---------------------------------------------------------------- page: staff & logins (CIC)
async function renderStaff(app) {
  if (!S.staffAdmin) S.staffAdmin = (await api('staff-admin')).staff;
  const labels = { NOT_SET: 'Not set up', TEMPORARY: 'Temporary password', LOCKED: 'Locked', ACTIVE: 'Active' };
  const sel = h('select', { class: 'in' }, S.staffAdmin.filter((s) => s.app_role !== 'ADMIN').map((s) => h('option', { value: s.staff_id }, s.display_name)));
  const emp = h('input', { class: 'in', placeholder: 'Hospital staff ID' });
  const out = h('div', { class: 'msg ' + (S.staffMsg && S.staffMsg.ok ? 'ok' : 'bad'), hidden: !S.staffMsg, role: 'status' }, S.staffMsg ? S.staffMsg.text : '');
  const pre = (s) => { sel.value = s.staff_id; emp.value = s.employee_no || ''; emp.focus(); };

  const create = h('button', { type: 'button', class: 'btn dark', onclick: async () => {
    const name = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
    create.disabled = true;
    try {
      const r = await api('staff-admin', { method: 'POST', body: { staff_id: Number(sel.value), employee_no: emp.value } });
      S.staffMsg = { ok: true, text: `Temporary password for ${name}: ${r.temporary_password} (shown once, copy it now). They choose their own password at first sign-in.` };
      S.staffAdmin = null; render();
    } catch (e) { out.className = 'msg bad'; out.textContent = e.message; out.hidden = false; create.disabled = false; }
  } }, 'Create login / reset password');

  app.appendChild(h('div', { class: 'page-title' }, h('h2', null, 'Staff & logins'), h('span', { class: 'note' }, 'Logins use the hospital staff ID. Passwords are never shown again after creation.')));
  app.appendChild(h('section', { class: 'card pad' },
    h('h2', null, 'Create a login or reset a forgotten password'),
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Staff member', sel), h('label', { class: 'f' }, 'Their staff ID', emp)),
    h('div', null, create), out));

  const tbody = h('tbody');
  for (const s of S.staffAdmin) {
    tbody.appendChild(h('tr', null,
      h('td', { class: 'name', style: { fontWeight: 500 } }, s.display_name),
      h('td', { style: { fontFamily: 'var(--mono)' } }, s.employee_no || '—'),
      h('td', null, s.staff_type === 'STAFF_NURSE' ? 'Staff nurse' : s.staff_type === 'CIC' ? 'CIC' : 'Dental assistant'),
      h('td', null, h('span', { class: 'status ' + (s.login_status === 'ACTIVE' ? 'done' : s.login_status === 'LOCKED' ? 'new' : '') }, labels[s.login_status] || s.login_status)),
      h('td', { class: 'note' }, s.last_login || '—'),
      h('td', null, String(s.devices)),
      h('td', null, s.app_role === 'ADMIN' ? null : h('button', { type: 'button', class: 'btn small', onclick: () => pre(s) }, s.employee_no ? 'Reset' : 'Set up'))));
  }
  app.appendChild(h('section', { class: 'card', style: { overflow: 'hidden' } }, h('div', { class: 'scroll-x' },
    h('table', { class: 'grid', style: { minWidth: '720px' } },
      h('thead', null, h('tr', null, ['Name', 'Staff ID', 'Role', 'Login', 'Last sign-in', 'Phones', ''].map((t) => h('th', { scope: 'col' }, t)))), tbody))));
}

// ---------------------------------------------------------------- render loop
let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  if (!TABS.find((t) => t.id === S.tab && tabAllowed(t))) S.tab = 'assign';
  renderHeader();
  const app = $('app');
  const frag = h('div', { style: { display: 'contents' } });
  try {
    if (S.tab === 'assign') await renderAssign(frag);
    else if (S.tab === 'compliance') await renderCompliance(frag);
    else if (S.tab === 'appraisals') await renderAppraisals(frag);
    else if (S.tab === 'staff') await renderStaff(frag);
  } catch (e) {
    frag.textContent = '';
    frag.appendChild(h('div', { class: 'card pad' }, h('h2', null, 'Could not load this page'), h('div', { class: 'msg bad' }, e.message),
      h('button', { type: 'button', class: 'btn', onclick: () => render() }, 'Try again')));
    if (e.status === 401) { S.me = null; renderHeader(); }
  }
  if (seq !== renderSeq) return; // a newer render started meanwhile
  app.textContent = '';
  app.appendChild(frag);
}

// ---------------------------------------------------------------- start
$('authBtn').addEventListener('click', async () => {
  if (S.me) {
    await api('logout', { method: 'POST' }).catch(() => {});
    S.me = null; S.board = null; S.bookings = S.queues = S.history = S.compliance = S.appraisals = S.staffAdmin = S.staffMsg = null;
    go('assign');
  } else signInDialog();
});
window.addEventListener('hashchange', () => { readHash(); S.board = null; render(); });

(async function start() {
  readHash();
  await loadMe();
  render();
  // refresh the board every 2 minutes while the page is open
  setInterval(() => { if (S.tab === 'assign' && !$('dlg').open && document.visibilityState === 'visible') { S.board = null; S.boardsCache = {}; render(); } }, 120000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
