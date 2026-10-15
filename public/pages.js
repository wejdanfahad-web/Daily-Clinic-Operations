/* Extra pages: Schedule Planner, Timetable, Workload & rotations, Clinic inventory.
   Uses the helpers defined in app.js (h, api, S, toast, openDialog, refMaps, …). */
'use strict';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const sessLabel = (s) => (s === 'AM' ? 'AM · 9:00' : 'PM · 13:00');
const cardSection = (title, ...kids) => h('section', { class: 'card pad' }, h('h2', null, title), ...kids);
const errorBox = (text) => h('div', { class: 'msg bad', role: 'alert' }, text);

// Draft entry → chip(s) (same look as the live board)
function draftChips(entry, homeClinic) {
  const { types, docs } = refMaps();
  const t = types[entry.type_code] || { category: 'DUTY', type_name: entry.type_code };
  if (entry.type_code === 'SURGERY') return [h('span', { class: 'chip surg' }, 'Surgery · ' + (entry.doctor_ids || []).map((d) => (docs[d] || {}).display_name || '?').join(' + '))];
  if (entry.type_code === 'IN_CHARGE') return [h('span', { class: 'chip charge' }, bellIcon(), 'In charge')];
  if (t.category === 'UNAVAILABLE') return [h('span', { class: 'chip off' }, t.type_name)];
  if (t.category === 'DUTY') return [h('span', { class: 'chip duty' }, t.type_name + (entry.notes ? ' · ' + entry.notes : ''))];
  return (entry.doctor_ids || []).map((id) => {
    const d = docs[id] || { display_name: '?', category_code: null };
    const away = entry.clinic_id && Number(entry.clinic_id) !== Number(homeClinic);
    return h('span', { class: 'chip', style: catStyle(d.category_code) }, h('span', { class: 'cat' }, catLabel(d.category_code)), d.display_name,
      entry.type_code === 'PEDO' ? ' · PEDO' : null, away ? h('span', { class: 'tag' }, 'Cl ' + entry.clinic_id) : null);
  });
}

// Generic editor for a list of entries (used by the planner draft)
function entryEditor({ title, entries, homeClinic, staffList, onSave, onMove }) {
  const { types } = refMaps();
  openDialog((body, close) => {
    let list = entries.map((e) => ({ ...e }));
    const msg = h('div', { class: 'msg bad', hidden: true, role: 'alert' });
    const showErr = (t) => { msg.textContent = t; msg.hidden = false; };
    const cur = h('div', { class: 'current' });
    const paint = () => {
      cur.textContent = '';
      if (!list.length) cur.appendChild(h('div', { class: 'note' }, 'Nothing planned yet.'));
      list.forEach((e, i) => {
        const moveSel = onMove && staffList ? h('select', { class: 'in', style: { height: '36px', width: 'auto' }, 'aria-label': 'Move to' },
          h('option', { value: '' }, 'Move to…'), staffList.map((s) => h('option', { value: s.staff_id }, s.display_name))) : null;
        if (moveSel) moveSel.addEventListener('change', () => { if (moveSel.value) { onMove(e, Number(moveSel.value)); close(); } });
        cur.appendChild(h('div', { class: 'item' }, h('div', { class: 'cell' }, draftChips(e, homeClinic)),
          h('div', { style: { display: 'flex', gap: '6px' } }, moveSel,
            h('button', { type: 'button', class: 'btn small danger', onclick: () => { list.splice(i, 1); paint(); } }, 'Remove'))));
      });
    };
    paint();
    body.append(h('h3', null, title), cur);

    const typeSel = h('select', { class: 'in' });
    const groups = { CLINICAL: 'Clinic', SURGERY: 'Surgery', DUTY: 'Duty', UNAVAILABLE: 'Not available' };
    for (const [cat, label] of Object.entries(groups)) {
      const og = h('optgroup', { label });
      S.ref.types.filter((t) => t.category === cat && !DUTY_TYPES.includes(t.type_code)).forEach((t) => og.appendChild(h('option', { value: t.type_code }, t.type_name)));
      typeSel.appendChild(og);
    }
    const docOpts = () => [h('option', { value: '' }, 'Choose…'), ...S.ref.doctors.map((d) => h('option', { value: d.doctor_id }, `${d.display_name}${d.category_code ? ' · ' + d.category_code : ''}`))];
    const doc1 = h('select', { class: 'in' }, docOpts());
    const doc2 = h('select', { class: 'in' }, docOpts());
    const clinicSel = h('select', { class: 'in' }, S.ref.clinics.map((c) => h('option', { value: c.clinic_id }, c.clinic_name)));
    clinicSel.value = homeClinic || '';
    const notes = h('input', { class: 'in', maxlength: 120, placeholder: 'Optional note' });
    const doc1L = h('label', { class: 'f' }, 'Doctor', doc1);
    const doc2L = h('label', { class: 'f' }, 'Assisted by (2nd doctor)', doc2);
    const clinicL = h('label', { class: 'f' }, 'Clinic', clinicSel);
    const sync = () => {
      const t = types[typeSel.value];
      doc1L.hidden = !(t && t.needs_doctor === 'Y');
      doc2L.hidden = typeSel.value !== 'SURGERY';
      clinicL.hidden = !(t && t.category === 'CLINICAL');
    };
    typeSel.addEventListener('change', sync); sync();
    const add = h('button', { type: 'button', class: 'btn small', onclick: () => {
      msg.hidden = true;
      const t = types[typeSel.value];
      const ids = [doc1.value, typeSel.value === 'SURGERY' ? doc2.value : ''].filter(Boolean).map(Number);
      if (t.needs_doctor === 'Y' && !ids.length) return showErr('Choose the doctor.');
      if (ids.length === 2 && ids[0] === ids[1]) return showErr('The two doctors must be different.');
      if (t.category === 'UNAVAILABLE') list = [];
      list.push({ type_code: typeSel.value, doctor_ids: ids, clinic_id: clinicL.hidden ? null : Number(clinicSel.value) || null, notes: notes.value || '' });
      doc1.value = ''; doc2.value = ''; notes.value = ''; paint();
    } }, '+ Add to this cell');
    body.append(h('div', { class: 'f', style: { fontSize: '12px', color: '#4F5D5A', marginTop: '6px' } }, 'Add'),
      h('label', { class: 'f' }, 'Type', typeSel), h('div', { class: 'grid2' }, doc1L, doc2L), clinicL, h('label', { class: 'f' }, 'Note', notes),
      h('div', null, add), msg,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
        h('button', { type: 'button', class: 'btn dark', onclick: () => { onSave(list); close(); } }, 'Done')));
  });
}

// =====================================================================================
// SCHEDULE PLANNER
// =====================================================================================
const P = { date: null, data: null, draft: null, dirty: false, saving: false, saveTimer: null, dragging: null };

function plannerDefaultDate() {
  let d = addDays(TODAY(), 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function leaveOn(date, staffId) {
  return (P.data.leave || []).find((l) => Number(l.staff_id) === Number(staffId) && l.from_date <= date && l.to_date >= date);
}

const LOAD = { PG1: 0.5, BD1: 0.5, PG2: 0.75, BD2: 0.75 };
const loadOf = (docId) => LOAD[(refMaps().docs[docId] || {}).category_code] ?? 1;

function autoPlan() {
  const date = P.date;
  const { docs } = refMaps();
  const staff = S.ref.staff.filter((s) => s.employment_status === 'ACTIVE')
    .sort((a, b) => (a.home_clinic_id ?? 999) - (b.home_clinic_id ?? 999));
  const draft = {};
  const off = { AM: new Set(), PM: new Set() };
  for (const s of staff) {
    draft[s.staff_id] = { AM: [], PM: [] };
    const l = leaveOn(date, s.staff_id);
    if (l) for (const sess of ['AM', 'PM']) {
      if (!l.session_code || l.session_code === sess) { draft[s.staff_id][sess] = [{ type_code: l.type_code, doctor_ids: [], clinic_id: null, notes: '' }]; off[sess].add(Number(s.staff_id)); }
    }
  }
  const assistants = staff.filter((s) => s.staff_type === 'DENTAL_ASSISTANT');
  for (const sess of ['AM', 'PM']) {
    const free = () => assistants.filter((s) => !off[sess].has(Number(s.staff_id)) && draft[s.staff_id][sess].length === 0);
    const place = (s, docId, clinicId) => draft[s.staff_id][sess].push({ type_code: 'CLINIC', doctor_ids: [Number(docId)], clinic_id: Number(clinicId) || Number(s.home_clinic_id) || null, notes: '' });
    const present = P.data.timetable.filter((x) => x.session_code === sess);
    const placed = new Set();
    // 1) timetable rows that name a clinic → the assistant whose home clinic it is
    for (const t of present.filter((x) => x.clinic_id)) {
      const home = free().find((s) => Number(s.home_clinic_id) === Number(t.clinic_id));
      if (home) { place(home, t.doctor_id, t.clinic_id); placed.add(Number(t.doctor_id)); }
    }
    // 2) everyone else, heaviest patient load first → one doctor per free assistant, in her own clinic
    const rest = [...new Set(present.map((x) => Number(x.doctor_id)))].filter((d) => !placed.has(d)).sort((a, b) => loadOf(b) - loadOf(a));
    const leftover = [];
    for (const d of rest) {
      const s = free()[0];
      if (s) { place(s, d, null); placed.add(d); } else leftover.push(d);
    }
    // 3) more doctors than assistants: pair light clinics (BD1/PG1 first); 3 doctors only if all BD1
    for (const d of leftover.sort((a, b) => loadOf(a) - loadOf(b))) {
      const target = assistants
        .filter((s) => !off[sess].has(Number(s.staff_id)))
        .map((s) => {
          const ids = draft[s.staff_id][sess].filter((e) => e.type_code === 'CLINIC').flatMap((e) => e.doctor_ids);
          return { s, ids, load: ids.reduce((a, x) => a + loadOf(x), 0) };
        })
        .filter((x) => x.ids.length > 0 && (x.ids.length < 2 || (x.ids.length === 2 && [...x.ids, d].every((y) => (docs[y] || {}).category_code === 'BD1'))))
        .sort((a, b) => a.load - b.load)[0];
      if (target && target.load + loadOf(d) <= 1.5) place(target.s, d, null);
    }
    // 4) doctors allowed 2 assistants (Prof. Ahmed) get a second one if someone is still free
    for (const t of present) {
      const doc = docs[t.doctor_id];
      if (doc && Number(doc.max_assistants) > 1 && placed.has(Number(t.doctor_id))) {
        const s = free()[0];
        if (s) place(s, t.doctor_id, null);
      }
    }
  }
  return draft;
}

function boardAsDraft(rows) {
  const out = {};
  for (const g of groupsFor(rows.filter((r) => !DUTY_TYPES.includes(r.type_code)))) {
    const f = g[0];
    const e = { type_code: f.type_code, doctor_ids: g.map((r) => r.doctor_id).filter(Boolean).map(Number), clinic_id: f.clinic_id ? Number(f.clinic_id) : null, notes: f.notes || '' };
    for (const sess of f.session_code === 'DAY' ? ['AM', 'PM'] : [f.session_code]) {
      out[f.staff_id] = out[f.staff_id] || { AM: [], PM: [] };
      out[f.staff_id][sess].push({ ...e });
    }
  }
  return out;
}

function plannerChecks() {
  const issues = [];
  const { docs, types, staff: staffMap } = refMaps();
  const draft = P.draft || {};
  for (const sess of ['AM', 'PM']) {
    const docUse = new Map();       // doctor → staff ids
    const clinicUse = new Map();    // clinic → staff ids (clinical)
    let vitals = 0;
    for (const s of S.ref.staff) {
      const cell = (draft[s.staff_id] && draft[s.staff_id][sess]) || [];
      if (!cell.length && s.employment_status === 'ACTIVE') issues.push({ sev: 'low', text: `${s.display_name} has nothing in the ${sess}.` });
      const clinDocs = [];
      for (const e of cell) {
        if (e.type_code === 'VITALS') vitals++;
        const t = types[e.type_code];
        for (const d of e.doctor_ids || []) {
          if (!docUse.has(d)) docUse.set(d, new Set());
          docUse.get(d).add(Number(s.staff_id));
          if (t && t.category === 'CLINICAL') clinDocs.push(d);
        }
        if (t && t.category === 'CLINICAL' && e.clinic_id) {
          if (!clinicUse.has(e.clinic_id)) clinicUse.set(e.clinic_id, new Set());
          clinicUse.get(e.clinic_id).add(Number(s.staff_id));
        }
      }
      if (clinDocs.length >= 3 && !clinDocs.every((d) => (docs[d] || {}).category_code === 'BD1')) issues.push({ sev: 'high', text: `${s.display_name} (${sess}) has ${clinDocs.length} doctors. 3 doctors are allowed only if all are BD1.` });
      if (clinDocs.length > 3) issues.push({ sev: 'high', text: `${s.display_name} (${sess}) has more than 3 doctors.` });
    }
    if (!vitals) issues.push({ sev: 'high', text: `Nobody is on Vitals in the ${sess} (every session needs one).` });
    for (const [d, set] of docUse) {
      const doc = docs[d];
      if (doc && set.size > Number(doc.max_assistants || 1)) issues.push({ sev: 'high', text: `${doc.display_name} has ${set.size} assistants in the ${sess} (allowed: ${doc.max_assistants}).` });
    }
    for (const [c, set] of clinicUse) {
      if (set.size > 1) {
        const names = [...set].map((id) => (staffMap[id] || {}).display_name).join(' & ');
        const sharedDoc = [...docUse.entries()].some(([d, st]) => Number((docs[d] || {}).max_assistants) > 1 && [...set].every((x) => st.has(x)));
        if (!sharedDoc) issues.push({ sev: 'high', text: `Clinic ${c} has 2 assistants in the ${sess}: ${names}.` });
      }
    }
    const seenDoc = new Set();
    for (const t of P.data.timetable.filter((x) => x.session_code === sess)) {
      if (seenDoc.has(Number(t.doctor_id))) continue;
      seenDoc.add(Number(t.doctor_id));
      if (!docUse.has(Number(t.doctor_id))) issues.push({ sev: 'high', text: `${t.doctor_name} is in the timetable for the ${sess}${t.clinic_id ? ' (Clinic ' + t.clinic_id + ')' : ''} but has no assistant.`, doctor: t, sess });
    }
  }
  return issues;
}

function scheduleSave() {
  P.dirty = true;
  try { localStorage.setItem('plannerDraft:' + P.date, JSON.stringify(P.draft)); } catch { /* ignore */ }
  clearTimeout(P.saveTimer);
  P.saveTimer = setTimeout(saveDraftNow, 1500);
}
async function saveDraftNow() {
  if (!P.dirty || !P.draft) return;
  P.saving = true; paintSaveState();
  try {
    await api('planner', { method: 'POST', body: { action: 'save_draft', date: P.date, draft: P.draft } });
    P.dirty = false;
    P.data.status = 'DRAFT';
    try { localStorage.removeItem('plannerDraft:' + P.date); } catch { /* ignore */ }
  } catch (e) { toast('Draft not saved: ' + e.message); }
  P.saving = false; paintSaveState();
}
function saveStateText() {
  return P.saving ? 'Saving…' : P.dirty ? 'Unsaved changes' : P.data && P.data.status === 'PUBLISHED' ? 'Published' + (P.data.published_at ? ' · ' + P.data.published_at.slice(11) : '') : P.draft ? 'Draft saved' : 'Not started';
}
function paintSaveState() {
  const el = document.getElementById('plSave');
  if (el) el.textContent = saveStateText();
}

async function loadPlanner(date) {
  P.date = date;
  P.data = await api('planner?date=' + date);
  let local = null;
  try { local = JSON.parse(localStorage.getItem('plannerDraft:' + date) || 'null'); } catch { /* ignore */ }
  P.draft = local || P.data.draft || null;
  P.dirty = !!local;
  if (local) scheduleSave();
}

PAGES.planner = async function renderPlanner(app) {
  await loadRef();
  const date = (S.param && /^\d{4}-\d{2}-\d{2}$/.test(S.param) && S.tab === 'planner') ? S.param : (P.date || plannerDefaultDate());
  if (!P.data || P.date !== date) await loadPlanner(date);
  const weekend = isWeekend(date);
  const setDate = (d) => { if (P.dirty) saveDraftNow(); history.replaceState(null, '', '#/planner/' + d); S.param = d; P.data = null; render(); };

  const dateInput = h('input', { type: 'date', class: 'in', style: { width: 'auto' }, value: date, onchange: (e) => e.target.value && setDate(e.target.value) });
  app.appendChild(h('div', { class: 'page-title' },
    h('h2', null, 'Schedule Planner · ' + fmtLong(date)),
    h('span', { class: 'note' }, P.data.semester ? 'Timetable: ' + P.data.semester : 'No confirmed timetable covers this date — confirm one on the Timetable page.')));

  const saveState = h('span', { id: 'plSave', class: 'badge-day other' }, saveStateText());
  const toolbar = h('div', { class: 'card pad', style: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
    h('button', { type: 'button', class: 'btn', onclick: () => setDate(nextWorkday(date, -1)) }, '← Previous'),
    dateInput,
    h('button', { type: 'button', class: 'btn', onclick: () => setDate(nextWorkday(date, 1)) }, 'Next →'),
    h('span', { style: { flex: '1 1 auto' } }),
    saveState,
    h('button', { type: 'button', class: 'btn', disabled: weekend, onclick: () => {
      if (P.draft && !confirm('Replace the current draft with an automatic plan from the timetable and planned leave?')) return;
      P.draft = autoPlan(); scheduleSave(); render();
    } }, 'Auto-plan'),
    h('button', { type: 'button', class: 'btn', disabled: weekend, onclick: () => {
      if (P.draft && !confirm('Replace the draft with what is currently published on the board?')) return;
      P.draft = boardAsDraft(P.data.board); scheduleSave(); render();
    } }, 'Start from board'),
    h('button', { type: 'button', class: 'btn primary', disabled: weekend || !P.draft, onclick: async (e) => {
      const issues = plannerChecks().filter((i) => i.sev === 'high');
      if (issues.length && !confirm(`There are ${issues.length} check(s) to look at. Publish anyway?`)) return;
      e.target.disabled = true;
      try {
        const r = await api('planner', { method: 'POST', body: { action: 'publish', date, draft: P.draft } });
        P.dirty = false; try { localStorage.removeItem('plannerDraft:' + date); } catch { /* ignore */ }
        toast(r.changes ? `Published · ${r.changes} change(s) · staff notified` : 'Published · no changes from the board');
        P.data = null; S.board = null; render();
      } catch (err) { toast(err.message); e.target.disabled = false; }
    } }, 'Publish to board'));
  app.appendChild(toolbar);
  paintSaveState();

  if (weekend) { app.appendChild(h('div', { class: 'card closed' }, h('b', null, 'No clinics on ' + DAYS[dow(date)]), 'Pick a day from Sunday to Thursday.')); return; }

  const layout = h('div', { class: 'daily' });
  const board = h('section', { class: 'card board', 'aria-label': 'Plan' });
  layout.append(board, h('div', { class: 'side' }));
  app.appendChild(layout);
  const side = layout.lastChild;

  if (!P.draft) {
    board.appendChild(h('div', { class: 'closed' }, h('b', null, 'No plan for this day yet'),
      'Use Auto-plan to fill it from the semester timetable and planned leave, or Start from board to copy what is published.'));
  } else {
    const staff = [...S.ref.staff].sort((a, b) => (a.home_clinic_id ?? 999) - (b.home_clinic_id ?? 999));
    const tbody = h('tbody');
    for (const s of staff) {
      const row = P.draft[s.staff_id] || { AM: [], PM: [] };
      const cell = (sess) => {
        const entries = row[sess] || [];
        const chips = entries.flatMap((e, i) => draftChips(e, s.home_clinic_id).map((c) => {
          if ((refMaps().types[e.type_code] || {}).category === 'CLINICAL') {
            c.draggable = true; c.style.cursor = 'grab';
            c.addEventListener('dragstart', (ev) => { P.dragging = { from: s.staff_id, sess, index: i }; ev.dataTransfer.effectAllowed = 'move'; ev.stopPropagation(); });
          }
          return c;
        }));
        const btn = h('button', { type: 'button', class: 'cell', 'aria-label': `${s.display_name}, ${sess}: edit plan` }, chips.length ? chips : h('span', { class: 'empty' }, '+ plan'));
        btn.addEventListener('click', () => entryEditor({
          title: `${s.display_name} · ${fmtDay(date)} · ${sess}`, entries, homeClinic: s.home_clinic_id,
          staffList: staff.filter((x) => x.staff_id !== s.staff_id),
          onSave: (list) => { P.draft[s.staff_id] = P.draft[s.staff_id] || { AM: [], PM: [] }; P.draft[s.staff_id][sess] = list; scheduleSave(); render(); },
          onMove: (entry, toId) => moveEntry(s.staff_id, sess, entry, toId),
        }));
        btn.addEventListener('dragover', (ev) => { if (P.dragging && P.dragging.sess === sess) { ev.preventDefault(); btn.style.borderColor = '#0E6B66'; } });
        btn.addEventListener('dragleave', () => { btn.style.borderColor = ''; });
        btn.addEventListener('drop', (ev) => {
          ev.preventDefault(); btn.style.borderColor = '';
          const d = P.dragging; P.dragging = null;
          if (!d || d.sess !== sess || d.from === s.staff_id) return;
          const entry = P.draft[d.from][sess][d.index];
          moveEntry(d.from, sess, entry, s.staff_id);
        });
        return btn;
      };
      tbody.appendChild(h('tr', null, h('td', { class: 'name' }, s.display_name), h('td', { class: 'ci' }, s.home_clinic_id ?? '—'), h('td', null, cell('AM')), h('td', null, cell('PM'))));
    }
    board.appendChild(h('div', { class: 'card-head' }, h('h2', null, 'Draft'), h('span', { class: 'note' }, 'Tap a cell to edit · drag a doctor to another assistant (same session) · nothing goes live until you publish')));
    board.appendChild(h('div', { class: 'scroll-x' }, h('table', { class: 'grid board-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col', style: { width: '150px' } }, 'Assistant'), h('th', { scope: 'col', style: { width: '76px' } }, 'Clinic #'), h('th', { scope: 'col' }, sessLabel('AM')), h('th', { scope: 'col' }, sessLabel('PM')))),
      tbody)));
  }

  // checks
  const issues = P.draft ? plannerChecks() : [];
  const high = issues.filter((i) => i.sev === 'high'), low = issues.filter((i) => i.sev === 'low');
  const checks = cardSection('Checks');
  if (!P.draft) checks.appendChild(h('div', { class: 'note' }, 'Checks appear once there is a draft.'));
  else if (!issues.length) checks.appendChild(h('div', { class: 'msg ok' }, 'All good: every timetable doctor has an assistant, Vitals is covered and nobody is double-booked.'));
  else {
    const ul = h('ul', { class: 'plain' });
    for (const i of high) {
      const li = h('li', { class: 'msg bad', style: { padding: '8px 10px' } }, i.text);
      if (i.doctor) {
        const free = S.ref.staff.filter((s) => !((P.draft[s.staff_id] || {})[i.sess] || []).length);
        if (free.length) {
          const sel = h('select', { class: 'in', style: { height: '34px', marginTop: '6px' } }, h('option', { value: '' }, 'Give to…'), free.map((s) => h('option', { value: s.staff_id }, `${s.display_name} (free)`)));
          sel.addEventListener('change', () => {
            const sid = Number(sel.value); if (!sid) return;
            const st = refMaps().staff[sid];
            P.draft[sid] = P.draft[sid] || { AM: [], PM: [] };
            P.draft[sid][i.sess].push({ type_code: 'CLINIC', doctor_ids: [Number(i.doctor.doctor_id)], clinic_id: Number(st.home_clinic_id) || Number(i.doctor.clinic_id), notes: '' });
            scheduleSave(); render();
          });
          li.appendChild(sel);
        }
      }
      ul.appendChild(li);
    }
    if (low.length) ul.appendChild(h('li', null, h('details', null, h('summary', { class: 'note', style: { cursor: 'pointer' } }, `${low.length} empty cell(s)`),
      h('div', { class: 'note' }, low.map((i) => i.text.replace(' has nothing in the ', ' ').replace(/\.$/, '')).join(', ')))));
    checks.appendChild(ul);
  }
  side.appendChild(checks);
  side.appendChild(leaveCard());
}

function moveEntry(fromId, sess, entry, toId) {
  const src = P.draft[fromId][sess];
  const idx = src.indexOf(entry);
  if (idx >= 0) src.splice(idx, 1);
  P.draft[toId] = P.draft[toId] || { AM: [], PM: [] };
  const dest = refMaps().staff[toId];
  const moved = { ...entry, clinic_id: dest && dest.home_clinic_id ? Number(dest.home_clinic_id) : entry.clinic_id };
  P.draft[toId][sess] = P.draft[toId][sess].filter((e) => (refMaps().types[e.type_code] || {}).category !== 'UNAVAILABLE');
  P.draft[toId][sess].push(moved);
  scheduleSave(); render();
}

function leaveCard() {
  const card = cardSection('Planned leave');
  const upcoming = (P.data.leave || []).filter((l) => l.to_date >= TODAY());
  if (!upcoming.length) card.appendChild(h('div', { class: 'note' }, 'No planned leave. Add annual leave here and Auto-plan will mark those days as "On leave".'));
  const ul = h('ul', { class: 'plain' });
  for (const l of upcoming) {
    const t = refMaps().types[l.type_code];
    ul.appendChild(h('li', { class: 'row-between', style: { fontSize: '13px', borderTop: '1px solid #EEF0EC', paddingTop: '6px' } },
      h('span', null, h('b', null, l.staff_name), ` · ${t ? t.type_name : l.type_code} · ${fmtDay(l.from_date)}${l.to_date !== l.from_date ? ' – ' + fmtDay(l.to_date) : ''}`),
      h('button', { type: 'button', class: 'btn small', onclick: async () => { try { await api('planner', { method: 'POST', body: { action: 'delete_leave', leave_id: l.leave_id } }); P.data = null; render(); } catch (e) { toast(e.message); } } }, 'Remove')));
  }
  card.appendChild(ul);
  const who = h('select', { class: 'in' }, S.ref.staff.map((s) => h('option', { value: s.staff_id }, s.display_name)));
  const from = h('input', { class: 'in', type: 'date', value: P.date });
  const to = h('input', { class: 'in', type: 'date', value: P.date });
  const type = h('select', { class: 'in' }, S.ref.types.filter((t) => t.category === 'UNAVAILABLE').map((t) => h('option', { value: t.type_code }, t.type_name)));
  card.append(h('label', { class: 'f' }, 'Staff', who), h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'From', from), h('label', { class: 'f' }, 'Till', to)),
    h('label', { class: 'f' }, 'Type', type),
    h('button', { type: 'button', class: 'btn small dark', onclick: async () => {
      try { await api('planner', { method: 'POST', body: { action: 'add_leave', staff_id: Number(who.value), from_date: from.value, to_date: to.value, type_code: type.value } }); toast('Leave added. Run Auto-plan again to apply it.'); P.data = null; render(); }
      catch (e) { toast(e.message); }
    } }, 'Add leave'));
  return card;
}

// =====================================================================================
// TIMETABLE
// The department timetable (Word) lists, for each day and session, who is present:
// groups "PG4 = 4 (names…)", "R2 = 4 (…)", "Faculty clinic: 5" + names, "Clinicians: 1" + names,
// "names TBD" groups resolved from the lists at the end of the document. No clinic numbers:
// the Planner places doctors into clinics.
// =====================================================================================
const TT = { semesters: null, sel: null, entries: null, aliases: null, cap: null };
const DAY_ALIASES = { sun: 0, sunday: 0, 'الأحد': 0, mon: 1, monday: 1, 'الاثنين': 1, tue: 2, tues: 2, tuesday: 2, 'الثلاثاء': 2, wed: 3, wednesday: 3, 'الأربعاء': 3, thu: 4, thur: 4, thurs: 4, thursday: 4, 'الخميس': 4 };
const SESSIONS10 = WEEKDAYS.flatMap((d, wd) => ['AM', 'PM'].map((s) => ({ wd, s, label: `${d.slice(0, 3)} ${s}` })));
const CAT_ORDER = ['PG4', 'PG3', 'PG2', 'PG1', 'BD3', 'BD2', 'BD1', 'FC', 'SP'];
const groupToCat = (g) => {
  const m = /^(PG|R|BD)\s?(\d)/i.exec(g || '');
  if (m) return (m[1].toUpperCase() === 'PG' ? 'PG' : 'BD') + m[2];
  return g === 'FC' || g === 'SP' ? g : null;
};
const dayOf = (txt) => {
  const k = String(txt || '').trim().toLowerCase().replace(/[^a-z؀-ۿ]/g, '');
  return DAY_ALIASES[k];
};

// ---------- reading files into rows of cells (each cell = array of lines)
async function loadScript(src) {
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function readDocx(file) {
  if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (el, name) => [...el.childNodes].filter((n) => n.namespaceURI === W && n.localName === name);
  const textOf = (p) => [...p.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const tables = [], paragraphs = [];
  for (const el of body.childNodes) {
    if (el.localName === 'p') { const t = textOf(el).trim(); if (t) paragraphs.push({ text: t, afterTables: tables.length }); }
    if (el.localName === 'tbl') {
      const rows = [];
      let prevCells = [];
      for (const tr of kids(el, 'tr')) {
        const cells = [];
        for (const tc of kids(tr, 'tc')) {
          const pr = kids(tc, 'tcPr')[0];
          const vm = pr && kids(pr, 'vMerge')[0];
          const lines = kids(tc, 'p').map(textOf).map((t) => t.trim()).filter(Boolean);
          const cont = vm && (vm.getAttributeNS(W, 'val') || 'continue') === 'continue';
          cells.push(cont ? (prevCells[cells.length] || []) : lines);
        }
        rows.push(cells);
        prevCells = cells;
      }
      tables.push(rows);
    }
  }
  return { tables, paragraphs };
}
async function readSheet(file) {
  if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const wb = window.XLSX.read(await file.arrayBuffer());
  const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    .map((r) => r.map((c) => String(c).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)));
  return { tables: [rows], paragraphs: [] };
}

// ---------- understanding the content
function splitNames(text) {
  return String(text).split(/,|،|&|\/|\s+and\s+|\s+و\s*|(?<=[A-Za-z])و/).map((x) => x.trim()).filter((x) => x && !/^names?\s*tbd$/i.test(x));
}
function splitNameLine(line) {
  return line.split(/\s{2,}|\t|(?<=\S)\s+(?=(?:Dr|Prof)\s*\.)/).map((x) => x.trim()).filter(Boolean);
}

function interpretTimetable({ tables, paragraphs }) {
  // lists at the end of the document, e.g. "PG1 Doctorate" → names, "R1 Board" → names
  const lists = [];
  for (const p of paragraphs.filter((x) => x.afterTables > 0)) {
    if (/^(PG|R|BD)\s?\d\b/i.test(p.text) && p.text.split(/\s+/).length <= 4) lists.push({ head: p.text, code: /^(PG|R|BD)\s?\d/i.exec(p.text)[0].replace(/\s/g, '').toUpperCase(), names: [] });
    else if (lists.length) lists[lists.length - 1].names.push(...splitNames(p.text));
  }
  const resolveTbd = (code) => lists.filter((l) => l.code === code.replace(/\s/g, '').toUpperCase()).flatMap((l) => l.names);

  const found = [];         // { raw, group, wd, s }
  const checks = [];        // text
  const listRows = [];      // fallback list format
  for (const rows of tables) {
    let order = null;       // session order from a header row, e.g. ['AM','PM']
    for (const cells of rows) {
      const flat = cells.map((c) => c.join(' '));
      const sessHead = flat.map((t) => (/morning|\bam\b|صباح/i.test(t) ? 'AM' : /afternoon|evening|\bpm\b|مساء/i.test(t) ? 'PM' : null));
      if (dayOf(flat[0]) === undefined && sessHead.filter(Boolean).length >= 2) { order = sessHead.filter(Boolean); continue; }
      const wd = dayOf(flat[0]);
      if (wd === undefined) {
        if (cells.length >= 3) listRows.push(flat);
        continue;
      }
      const sessCells = cells.slice(1);
      sessCells.forEach((lines, i) => {
        const s = (order && order[i]) || (i === 0 ? 'AM' : 'PM');
        let mode = null, working = null;
        let countInCell = 0, residents = 0, clinicians = 0, tbdIssue = false;
        for (const line of lines) {
          if (/^[-—–_\s]+$/.test(line)) continue;
          const g = /^((?:PG|R|BD)\s?\d)\s*=\s*(\d+)\s*\((.*)\)\s*$/i.exec(line);
          if (g) {
            mode = null;
            let names = splitNames(g[3]);
            if (/tbd/i.test(g[3])) {
              names = resolveTbd(g[1]);
              if (names.length && names.length !== Number(g[2])) tbdIssue = true;
              if (names.length && names.length !== Number(g[2])) checks.push(`${WEEKDAYS[wd]} ${s}: ${g[1].toUpperCase()} says ${g[2]} (names TBD), and the list at the end has ${names.length} names. Untick anyone who is not in that session.`);
              if (!names.length) checks.push(`${WEEKDAYS[wd]} ${s}: ${g[1].toUpperCase()} = ${g[2]} with names TBD and no list to fill them in.`);
            } else if (names.length !== Number(g[2])) checks.push(`${WEEKDAYS[wd]} ${s}: ${g[1].toUpperCase()} says ${g[2]} but ${names.length} names are listed.`);
            names.forEach((n) => found.push({ raw: n, group: g[1].replace(/\s/g, '').toUpperCase(), wd, s }));
            countInCell += names.length;
            residents += names.length;
            continue;
          }
          let m;
          if ((m = /^faculty clinics?\s*:\s*(\d+)/i.exec(line))) { mode = 'FC'; continue; }
          if ((m = /^clinicians?\s*:\s*(\d+)/i.exec(line))) { mode = 'SP'; continue; }
          if ((m = /^clinics working\s*:\s*(\d+)/i.exec(line))) { working = Number(m[1]); mode = null; continue; }
          if (/^remaining clinics?/i.test(line)) { mode = null; continue; }
          if (mode) {
            const names = splitNameLine(line);
            names.forEach((n) => found.push({ raw: n, group: mode, wd, s }));
            countInCell += names.length;
            if (mode === 'SP') clinicians += names.length;
          } else checks.push(`${WEEKDAYS[wd]} ${s}: could not read "${line.slice(0, 60)}".`);
        }
        if (working !== null && working !== residents && working !== residents + clinicians && !tbdIssue) checks.push(`${WEEKDAYS[wd]} ${s}: the document says ${working} resident clinics working, ${residents} residents were read.`);
      });
    }
  }
  // list format: Doctor | Day | Session | Clinic
  for (const r of listRows) {
    const wd = dayOf(r[1]);
    const s = /^a|صباح/i.test(r[2]) ? 'AM' : /^p|مساء/i.test(r[2]) ? 'PM' : null;
    if (wd === undefined || !s || /^doctor$/i.test(r[0])) continue;
    found.push({ raw: r[0], group: null, wd, s, clinic: Number(String(r[3] || '').replace(/\D+/g, '')) || null });
  }
  return { found, checks };
}

// ---------- matching names to doctors
const FIRST_VARIANTS = { khaled: 'khalid', khalid: 'khaled', ahmad: 'ahmed', ahmed: 'ahmad', husam: 'hussam', hussam: 'husam', fahad: 'fahd', fahd: 'fahad', mohammed: 'mohammad', mohammad: 'mohammed', muhammad: 'mohammed' };
const stripAl = (t) => t.replace(/^(al|el|bin|ibn)(?=[a-z]{3,})/, '');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function matchDoctor(raw, group) {
  const groupCat = groupToCat(group);
  const key = normAlias(raw);
  const alias = TT.aliases && TT.aliases[key];
  if (alias) return { id: alias, how: 'remembered' };
  const exact = S.ref.doctors.find((d) => normAlias(d.display_name) === key);
  if (exact) return { id: Number(exact.doctor_id), how: 'name' };
  const toks = key.split(' ');
  const isProf = /prof/i.test(raw);
  const scored = [];
  for (const d of S.ref.doctors) {
    const dt = normAlias(d.display_name).split(' ');
    const first = dt[0], rest = dt.slice(1);
    let score = 0;
    const firstHit = toks.findIndex((t) => t === first || FIRST_VARIANTS[t] === first);
    const initialHit = toks.findIndex((t) => t.length === 1 && t === first[0]);
    if (rest.length === 0) {
      if (firstHit >= 0) score = 2;
      else if (toks.some((t) => t.length > 3 && lev(stripAl(t), stripAl(first)) <= 1)) score = 2; // surname-only names (Prof. Alhadlaq)
    } else {
      const head = firstHit >= 0 ? firstHit : initialHit;
      if (head >= 0) {
        const others = toks.filter((_, i) => i !== head);
        const r = rest.join(' ');
        const restOk = rest[0].length === 1
          ? others.some((t) => stripAl(t).startsWith(rest[0]))
          : others.some((t) => lev(stripAl(t), stripAl(r)) <= 2);
        if (restOk) score = firstHit >= 0 ? 3 : 2.5;
      }
    }
    if (score && isProf === /^prof/i.test(d.display_name)) score += 0.2;
    // never guess across groups: a PG1 resident is not the faculty member with the same first name
    if (score && groupCat && d.category_code && d.category_code !== groupCat) score = 0;
    // a first name alone is not enough when the timetable gives a surname we cannot check
    if (score === 2 && rest.length === 0 && firstHit >= 0 && toks.length > 1 && !groupCat) score = 1.5;
    if (score) scored.push({ d, score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) return { id: Number(scored[0].d.doctor_id), how: 'guess' };
  return { id: null, candidates: scored.map((x) => Number(x.d.doctor_id)) };
}

function buildCapture(parsed, fileName) {
  const rows = parsed.found.map((f) => ({ ...f, ...matchDoctor(f.raw, f.group) }));
  return { file: fileName, rows, checks: parsed.checks, off: new Set() };
}

// ---------- page
function sessionGrid({ doctorIds, isOn, onToggle, cellText, editable }) {
  const { docs } = refMaps();
  const ids = [...doctorIds].sort((a, b) => {
    const ca = CAT_ORDER.indexOf((docs[a] || {}).category_code), cb = CAT_ORDER.indexOf((docs[b] || {}).category_code);
    return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb) || String((docs[a] || {}).display_name).localeCompare(String((docs[b] || {}).display_name));
  });
  const counts = SESSIONS10.map(() => 0);
  const tbody = h('tbody');
  for (const id of ids) {
    const d = docs[id] || { display_name: '#' + id };
    tbody.appendChild(h('tr', null,
      h('td', { style: { whiteSpace: 'nowrap' } }, h('span', { class: 'catchip', style: catStyle(d.category_code) }, catLabel(d.category_code)), ' ', d.display_name),
      SESSIONS10.map((x, i) => {
        const on = isOn(id, x.wd, x.s);
        if (on) counts[i]++;
        const label = on ? (cellText ? cellText(id, x.wd, x.s) : '✓') : '';
        const style = { width: '44px', height: '30px', borderRadius: '6px', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, border: on ? '0' : '1px dashed #DDE1DC', background: on ? '#16302F' : '#fff', color: on ? '#F3F4F1' : '#9AA49F', cursor: editable ? 'pointer' : 'default' };
        return h('td', { style: { textAlign: 'center', padding: '3px' } }, editable
          ? h('button', { type: 'button', style, 'aria-pressed': on ? 'true' : 'false', 'aria-label': `${d.display_name} ${WEEKDAYS[x.wd]} ${x.s}: ${on ? 'present' : 'not present'}`, onclick: () => onToggle(id, x.wd, x.s, on) }, label)
          : h('span', { style: { ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } }, label));
      })));
  }
  tbody.appendChild(h('tr', { class: 'total', style: { borderTop: '2px solid #DDE1DC', background: '#F7F8F6' } },
    h('th', { scope: 'row', style: { textAlign: 'left', padding: '8px 16px', fontSize: '12px' } }, 'Doctors in session'),
    counts.map((c) => h('td', { style: { textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color: c > S.ref.staff.length ? '#7A1E2C' : '#3E4B48' } }, c))));
  return h('div', { class: 'scroll-x' }, h('table', { class: 'grid', style: { minWidth: '900px', fontSize: '13px' } },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Doctor'), SESSIONS10.map((x) => h('th', { scope: 'col', style: { textAlign: 'center', padding: '8px 2px' } }, x.label)))), tbody));
}

PAGES.timetable = async function renderTimetable(app) {
  await loadRef();
  if (!TT.semesters) {
    const r = await api('timetable' + (TT.sel ? '?semester_id=' + TT.sel : ''));
    TT.semesters = r.semesters;
    if (!TT.sel && TT.semesters.length) TT.sel = Number(TT.semesters[0].semester_id);
    TT.entries = null;
  }
  if (TT.sel && !TT.entries) {
    const r = await api('timetable?semester_id=' + TT.sel);
    TT.entries = r.entries;
    TT.aliases = Object.fromEntries(r.aliases.map((a) => [a.alias_norm, Number(a.doctor_id)]));
  }
  const sem = TT.semesters.find((s) => Number(s.semester_id) === TT.sel);
  const reload = () => { TT.semesters = null; TT.entries = null; render(); };

  app.appendChild(h('div', { class: 'page-title' }, h('h2', null, 'Semester timetable'),
    h('span', { class: 'note' }, 'CIC only · the planner uses the confirmed timetable to plan every day ahead')));

  // ---- top card: semester + upload (mockup layout)
  const pick = h('select', { class: 'in' }, TT.semesters.map((s) => h('option', { value: s.semester_id }, `${s.semester_name}${s.confirmed_at ? ' ✓' : ''}`)));
  if (TT.sel) pick.value = TT.sel;
  pick.addEventListener('change', () => { TT.sel = Number(pick.value); TT.entries = null; TT.cap = null; render(); });
  const file = h('input', { type: 'file', accept: '.docx,.xlsx,.xls,.csv', style: { minHeight: '44px', padding: '8px', border: '1px dashed #9AA49F', borderRadius: '8px', background: '#F7F8F6', width: '100%' } });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    if (!TT.sel) { toast('Create the semester first (name and dates), then upload.'); return; }
    try {
      let parsed;
      if (/\.docx$/i.test(f.name)) parsed = interpretTimetable(await readDocx(f));
      else if (/\.csv$/i.test(f.name)) parsed = interpretTimetable({ tables: [(await f.text()).split(/\r?\n/).map((l) => l.split(/\t|,|;/).map((c) => [c.trim()].filter(Boolean)))], paragraphs: [] });
      else if (/\.docx?$/i.test(f.name)) { toast('Old .doc files cannot be read. In Word, use File → Save As → Word Document (.docx).'); return; }
      else parsed = interpretTimetable(await readSheet(f));
      if (!parsed.found.length) { toast('No doctors found in that file. Send it to Claude so the reader can be adjusted.'); return; }
      TT.cap = buildCapture(parsed, f.name);
      render();
    } catch (e) { console.error(e); toast('Could not read that file: ' + e.message); }
  });
  const nm = h('input', { class: 'in', placeholder: 'e.g. First semester 2026-27 (Version B)' });
  const st = h('input', { class: 'in', type: 'date' }), en = h('input', { class: 'in', type: 'date' });
  const topCard = h('section', { class: 'card', style: { padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '16px 20px', alignItems: 'flex-end' } },
    h('label', { class: 'f', style: { flex: '1 1 320px', fontSize: '13px' } }, 'Upload timetable (Word, Excel or CSV) — the department timetable can be uploaded as it is', file),
    TT.semesters.length ? h('label', { class: 'f', style: { flex: '1 1 240px', fontSize: '13px' } }, 'Semester', pick) : null,
    sem ? h('div', { style: { fontSize: '13px', color: '#4F5D5A', paddingBottom: '12px' } }, `${fmtDay(sem.starts_on)} ${sem.starts_on.slice(0, 4)} – ${fmtDay(sem.ends_on)} ${sem.ends_on.slice(0, 4)}`) : null,
    h('details', { style: { flex: '1 1 100%' }, open: !TT.semesters.length },
      h('summary', { style: { cursor: 'pointer', fontWeight: 600, fontSize: '13px' } }, TT.semesters.length ? 'New semester / version' : 'Create the semester first'),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px', alignItems: 'flex-end' } },
        h('label', { class: 'f', style: { flex: '2 1 240px' } }, 'Name', nm), h('label', { class: 'f', style: { flex: '1 1 150px' } }, 'Starts', st), h('label', { class: 'f', style: { flex: '1 1 150px' } }, 'Ends', en),
        h('button', { type: 'button', class: 'btn dark', onclick: async () => {
          try { const r = await api('timetable', { method: 'POST', body: { action: 'create_semester', semester_name: nm.value, starts_on: st.value, ends_on: en.value } }); TT.sel = r.semester_id; reload(); }
          catch (e) { toast(e.message); }
        } }, 'Create'))));
  app.appendChild(topCard);
  if (!sem) return;

  // ---- captured (uploaded, not saved yet)
  if (TT.cap) { renderCapture(app); return; }

  // ---- saved timetable
  if (!TT.entries.length) {
    app.appendChild(h('div', { class: 'card', style: { padding: '32px', textAlign: 'center', color: '#4F5D5A', borderStyle: 'dashed' } }, 'No timetable saved for this semester yet. Upload the department timetable above.'));
    return;
  }
  const byKey = new Map();
  for (const e of TT.entries) { const k = `${e.doctor_id}|${e.weekday}|${e.session_code}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); }
  const used = new Set(TT.entries.map((e) => Number(e.doctor_id)));
  const forgotten = S.ref.doctors.filter((d) => !used.has(Number(d.doctor_id)));
  app.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' } },
    statCard('Doctors', used.size), statCard('Sessions captured', TT.entries.length), statCard('Not in the timetable', forgotten.length, forgotten.length ? '#8A4B0F' : null),
    statCard('Status', sem.confirmed_at ? 'Confirmed' : 'Not confirmed', sem.confirmed_at ? '#1F5145' : '#7A1E2C')));
  if (forgotten.length) app.appendChild(h('div', { class: 'msg', style: { background: '#FFF4E5', color: '#8A4B0F' } }, `Not in this timetable: ${forgotten.map((d) => d.display_name).join(', ')}. That is fine if they have no clinics this semester.`));
  app.appendChild(h('section', { class: 'card', style: { overflow: 'hidden' } },
    h('div', { class: 'card-head' }, h('h2', { style: { fontSize: '16px' } }, `Saved: ${sem.source_file || sem.semester_name}`),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('span', { class: 'note' }, 'Tap a box to add or remove a session'),
        h('button', { type: 'button', class: sem.confirmed_at ? 'btn small' : 'btn small primary', onclick: async () => { try { await api('timetable', { method: 'POST', body: { action: 'confirm', semester_id: TT.sel } }); toast('Timetable confirmed. The planner will use it.'); reload(); } catch (e) { toast(e.message); } } }, sem.confirmed_at ? 'Confirmed ✓' : 'Confirm timetable'))),
    sessionGrid({
      doctorIds: used, editable: true,
      isOn: (id, wd, s) => byKey.has(`${id}|${wd}|${s}`),
      cellText: (id, wd, s) => { const l = byKey.get(`${id}|${wd}|${s}`); return l.some((e) => e.clinic_id) ? l.map((e) => e.clinic_id || '✓').join('/') : '✓'; },
      onToggle: async (id, wd, s, on) => {
        try {
          if (on) for (const e of byKey.get(`${id}|${wd}|${s}`)) await api('timetable', { method: 'POST', body: { action: 'delete_entry', timetable_id: e.timetable_id } });
          else await api('timetable', { method: 'POST', body: { action: 'add_entry', semester_id: TT.sel, doctor_id: id, weekday: wd, session: s } });
          TT.entries = null; render();
        } catch (e) { toast(e.message); }
      },
    })));
  const ad = h('select', { class: 'in', style: { width: 'auto' } }, h('option', { value: '' }, 'Add a doctor to the grid…'), forgotten.map((d) => h('option', { value: d.doctor_id }, d.display_name)));
  ad.addEventListener('change', async () => {
    if (!ad.value) return;
    try { await api('timetable', { method: 'POST', body: { action: 'add_entry', semester_id: TT.sel, doctor_id: Number(ad.value), weekday: 0, session: 'AM' } }); TT.entries = null; render(); toast('Added for Sunday AM. Tap boxes to set the right sessions.'); } catch (e) { toast(e.message); }
  });
  if (forgotten.length) app.appendChild(h('div', null, ad));
};

function statCard(label, value, color) {
  return h('div', { class: 'kpi' }, h('div', { class: 'l' }, label), h('div', { class: 'v', style: { fontSize: '22px', color: color || '#17262B' } }, value));
}

function renderCapture(app) {
  const cap = TT.cap;
  const { docs } = refMaps();
  const unmatched = [...new Set(cap.rows.filter((r) => !r.id).map((r) => r.raw))];
  const guessed = [...new Map(cap.rows.filter((r) => r.id && r.how === 'guess').map((r) => [r.raw, r])).values()];
  const present = cap.rows.filter((r) => r.id && !cap.off.has(`${r.id}|${r.wd}|${r.s}`));
  const keySet = new Set(present.map((r) => `${r.id}|${r.wd}|${r.s}`));
  const ids = new Set(cap.rows.filter((r) => r.id).map((r) => r.id));

  app.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' } },
    statCard('Doctors found', ids.size), statCard('Sessions captured', keySet.size),
    statCard('Names to match', unmatched.length, unmatched.length ? '#7A1E2C' : '#1F5145'), statCard('Checks', cap.checks.length, cap.checks.length ? '#8A4B0F' : '#1F5145')));

  // names to match
  if (unmatched.length) {
    const box = h('section', { style: { background: '#FFF7F6', border: '1px solid #F1B9B3', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('div', { style: { color: '#7A1E2C', fontSize: '14px' } }, h('b', null, 'Match these names before saving. '), 'Pick the doctor, or add them as a new doctor. The system remembers your choice for next semester.'));
    for (const raw of unmatched) {
      const sample = cap.rows.find((r) => r.raw === raw);
      const cands = (sample.candidates || []).map((id) => docs[id]).filter(Boolean);
      const sel = h('select', { class: 'in', style: { width: 'auto', minWidth: '200px' } }, h('option', { value: '' }, 'Choose doctor…'),
        cands.length ? h('optgroup', { label: 'Likely' }, cands.map((d) => h('option', { value: d.doctor_id }, d.display_name))) : null,
        h('optgroup', { label: 'All doctors' }, S.ref.doctors.map((d) => h('option', { value: d.doctor_id }, d.display_name))));
      sel.addEventListener('change', async () => {
        const id = Number(sel.value); if (!id) return;
        try { await api('timetable', { method: 'POST', body: { action: 'save_alias', alias: raw, doctor_id: id } }); } catch (e) { toast(e.message); return; }
        TT.aliases[normAlias(raw)] = id;
        cap.rows.forEach((r) => { if (r.raw === raw) { r.id = id; r.how = 'remembered'; } });
        render();
      });
      const catSel = h('select', { class: 'in', style: { width: 'auto' } }, CAT_ORDER.map((c) => h('option', { value: c }, c)));
      catSel.value = groupToCat(sample.group) || 'FC';
      const add = h('button', { type: 'button', class: 'btn small', onclick: async () => {
        const shortName = raw.replace(/^(dr|prof)\.?\s*/i, '').split(/\s+/)[0];
        const name = prompt('Name to show on the board (keep it short, like the others):', `${/^prof/i.test(raw) ? 'Prof.' : 'Dr.'} ${shortName.charAt(0).toUpperCase()}${shortName.slice(1)}`);
        if (!name) return;
        try {
          const r = await api('timetable', { method: 'POST', body: { action: 'add_doctor', display_name: name, category_code: catSel.value, alias: raw } });
          S.ref.doctors.push(r.doctor); S.ref._maps = null;
          TT.aliases[normAlias(raw)] = Number(r.doctor.doctor_id);
          cap.rows.forEach((x) => { if (x.raw === raw) { x.id = Number(r.doctor.doctor_id); x.how = 'new'; } });
          toast(`${r.doctor.display_name} added.`); render();
        } catch (e) { toast(e.message); }
      } }, 'Add as new doctor');
      box.appendChild(h('div', { style: { background: '#fff', border: '1px solid #F1D3CF', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' } },
        h('b', { style: { minWidth: '180px' } }, raw), h('span', { class: 'note' }, sample.group ? `(${sample.group})` : ''), sel, h('span', { class: 'note' }, 'or'), catSel, add));
    }
    app.appendChild(box);
  }

  // guesses to confirm (shown, editable)
  if (guessed.length) {
    app.appendChild(h('details', { class: 'card pad' }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, `${guessed.length} name(s) matched by best guess — tap to review`),
      h('ul', { class: 'plain' }, guessed.map((r) => {
        const sel = h('select', { class: 'in', style: { width: 'auto', height: '34px' } }, S.ref.doctors.map((d) => h('option', { value: d.doctor_id }, d.display_name)));
        sel.value = r.id;
        sel.addEventListener('change', async () => {
          const id = Number(sel.value);
          try { await api('timetable', { method: 'POST', body: { action: 'save_alias', alias: r.raw, doctor_id: id } }); } catch (e) { toast(e.message); return; }
          TT.aliases[normAlias(r.raw)] = id; cap.rows.forEach((x) => { if (x.raw === r.raw) { x.id = id; x.how = 'remembered'; } }); render();
        });
        return h('li', { style: { display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px' } }, h('span', { style: { minWidth: '200px' } }, r.raw), '→', sel);
      }))));
  }

  // checks
  if (cap.checks.length) app.appendChild(h('section', { class: 'card pad' }, h('h2', { style: { fontSize: '16px' } }, 'Checks'),
    h('ul', { class: 'plain' }, cap.checks.map((c) => h('li', { class: 'msg', style: { background: '#FFF4E5', color: '#8A4B0F', padding: '8px 10px' } }, c)))));

  // grid + save
  const save = async (confirmToo) => {
    if (unmatched.length && !confirm(`${unmatched.length} name(s) are not matched and will be left out. Save anyway?`)) return;
    try {
      const rows = present.map((r) => ({ doctor_id: r.id, weekday: r.wd, session: r.s, clinic_id: r.clinic || null }));
      const r = await api('timetable', { method: 'POST', body: { action: 'import', semester_id: TT.sel, source_file: cap.file, rows } });
      if (confirmToo) await api('timetable', { method: 'POST', body: { action: 'confirm', semester_id: TT.sel } });
      toast(`Saved ${r.saved} sessions${confirmToo ? ' and confirmed' : ''}.`);
      TT.cap = null; TT.semesters = null; TT.entries = null; render();
    } catch (e) { toast(e.message); }
  };
  app.appendChild(h('section', { class: 'card', style: { overflow: 'hidden' } },
    h('div', { class: 'card-head' }, h('h2', { style: { fontSize: '16px' } }, `Captured: ${cap.file}`),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { type: 'button', class: 'btn small', onclick: () => { TT.cap = null; render(); } }, 'Discard'),
        h('button', { type: 'button', class: 'btn small', onclick: () => save(false) }, 'Save only'),
        h('button', { type: 'button', class: 'btn small primary', onclick: () => save(true) }, 'Save & confirm timetable'))),
    h('div', { class: 'note', style: { padding: '8px 20px 0' } }, 'Dark box = present in that session. Tap a box to remove or add a session before saving.'),
    sessionGrid({
      doctorIds: ids, editable: true,
      isOn: (id, wd, s) => keySet.has(`${id}|${wd}|${s}`),
      onToggle: (id, wd, s, on) => {
        const k = `${id}|${wd}|${s}`;
        if (on) cap.off.add(k);
        else if (cap.off.has(k)) cap.off.delete(k);
        else cap.rows.push({ raw: (docs[id] || {}).display_name, group: null, wd, s, id, how: 'manual' });
        render();
      },
    })));
}

// =====================================================================================
// WORKLOAD & ROTATIONS (incl. surgery history)
// =====================================================================================
const WL = { quarter: null, data: null, queues: null, surg: null, from: null, to: null, staff: '', rot: 'SURGERY' };

PAGES.workload = async function renderWorkload(app) {
  await loadRef();
  if (!WL.data || WL.data.quarter !== (WL.quarter || WL.data.quarter)) WL.data = await api('workload' + (WL.quarter ? '?quarter=' + WL.quarter : ''));
  WL.quarter = WL.data.quarter;
  if (!WL.queues) WL.queues = (await api('queues')).queues;
  if (!WL.from) { WL.from = TODAY().slice(0, 4) + '-01-01'; WL.to = TODAY(); }
  if (!WL.surg) WL.surg = await api(`workload?view=surgeries&from=${WL.from}&to=${WL.to}${WL.staff ? '&staff_id=' + WL.staff : ''}`);

  app.appendChild(h('div', { class: 'page-title' }, h('h2', null, 'Workload & rotations'), h('span', { class: 'note' }, 'From the assignment log · CIC only')));

  // ---- workload
  const qs = [...new Set([WL.quarter, ...WL.data.quarters])].sort().reverse();
  const qSel = h('select', { class: 'in', style: { width: 'auto' } }, qs.map((q) => h('option', { value: q }, `Q${Math.floor(Number(q.slice(5, 7)) / 3) + 1} ${q.slice(0, 4)}`)));
  qSel.value = WL.quarter;
  qSel.addEventListener('change', () => { WL.quarter = qSel.value; WL.data = null; render(); });
  const rows = WL.data.rows;
  const loads = rows.map((r) => Number(r.load_per_session) || 0);
  const avg = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
  const max = Math.max(1, ...loads);
  const tbody = h('tbody');
  for (const r of rows) {
    const l = Number(r.load_per_session) || 0;
    const tag = l > avg * 1.15 ? ['Heavier', '#7A1E2C', '#FBE3E1'] : l < avg * 0.85 ? ['Lighter', '#1F5145', '#DCEFE8'] : ['Balanced', '#3E4B48', '#EDEFEB'];
    tbody.appendChild(h('tr', null,
      h('td', { class: 'name' }, r.staff_name),
      h('td', null, h('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span', { class: 'bar', style: { width: '110px' } }, h('i', { style: { width: Math.round((l / max) * 100) + '%', background: tag[1] } })), h('span', { class: 'score' }, l.toFixed(2)))),
      h('td', null, h('span', { class: 'status', style: { background: tag[2], color: tag[1] } }, tag[0])),
      h('td', { class: 'score' }, r.sessions_available), h('td', { class: 'score' }, Number(r.workload_points).toFixed(1)),
      h('td', { class: 'score' }, r.multi_clinic_sessions), h('td', { class: 'score' }, r.annual_leave_days), h('td', { class: 'score' }, r.excuses), h('td', { class: 'score' }, r.sick_sessions)));
  }
  app.appendChild(h('section', { class: 'card', style: { overflow: 'hidden' } },
    h('div', { class: 'card-head' }, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('h2', null, 'Workload per available session'), qSel),
      h('span', { class: 'note' }, 'Clinic points by doctor level (BD1/PG1 0.5 · PG2/BD2 0.75 · others 1) + surgery and duty points, divided by sessions she was available')),
    rows.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'grid', style: { minWidth: '900px' } },
      h('thead', null, h('tr', null, ['Staff', 'Load / session', '', 'Sessions', 'Points', 'Multi-clinic', 'Annual leave (days)', 'Excuses', 'Sick (sessions)'].map((t) => h('th', { scope: 'col' }, t)))), tbody))
      : h('div', { class: 'loading' }, 'No assignments recorded in this quarter yet.')));

  // ---- rotation queues
  const rotations = [...new Set(WL.queues.map((q) => q.rotation_code))];
  const rotSel = h('div', { class: 'tabs', style: { gap: '6px' } }, rotations.map((r) => h('button', { type: 'button', class: 'btn small' + (r === WL.rot ? ' dark' : ''), onclick: () => { WL.rot = r; render(); } }, (WL.queues.find((q) => q.rotation_code === r) || {}).rotation_name || r)));
  const qrows = WL.queues.filter((q) => q.rotation_code === WL.rot);
  const today = TODAY();
  app.appendChild(h('section', { class: 'card', style: { overflow: 'hidden' } },
    h('div', { class: 'card-head' }, h('h2', null, 'Rotation queues'), rotSel),
    h('div', { class: 'scroll-x' }, h('table', { class: 'grid', style: { minWidth: '640px' } },
      h('thead', null, h('tr', null, ['#', 'Staff', 'Total', 'Last time', 'Rest (days since)', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, qrows.map((q) => h('tr', { class: q.is_eligible === 'Y' ? null : 'unavail' },
        h('td', { class: 'score' }, q.queue_position || '—'), h('td', { class: 'name' }, q.staff_name), h('td', { class: 'score' }, q.total_count),
        h('td', null, q.last_assigned_date ? fmtDay(q.last_assigned_date) + ' ' + q.last_assigned_date.slice(0, 4) : '—'),
        h('td', { class: 'score' }, q.last_assigned_date ? daysBetween(q.last_assigned_date, today) : '—'),
        h('td', null, q.is_eligible === 'Y' ? (Number(q.queue_position) === 1 ? h('span', { class: 'status done' }, 'Next in line') : null) : h('span', { class: 'note' }, q.ineligible_reason || 'Not eligible')))))))));

  // ---- surgery history
  const f = h('input', { class: 'in', type: 'date', value: WL.from, style: { width: 'auto' } });
  const t = h('input', { class: 'in', type: 'date', value: WL.to, style: { width: 'auto' } });
  const who = h('select', { class: 'in', style: { width: 'auto' } }, h('option', { value: '' }, 'All staff'), S.ref.staff.map((s) => h('option', { value: s.staff_id }, s.display_name)));
  who.value = WL.staff;
  const apply = () => { WL.from = f.value || WL.from; WL.to = t.value || WL.to; WL.staff = who.value; WL.surg = null; render(); };
  const list = WL.surg.surgeries;
  const counts = {};
  for (const s of list) counts[s.staff_name] = (counts[s.staff_name] || 0) + 1;
  const csv = () => {
    const lines = [['Date', 'Session', 'Assistant', 'Doctors', 'Case supervisor', 'Note', 'Recorded by', 'Recorded at'],
      ...list.map((s) => [s.work_date, s.session_code, s.staff_name, s.doctors, s.supervisor || '', s.note || '', s.recorded_by, s.recorded_at])];
    const text = lines.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })), download: `surgeries_${WL.from}_${WL.to}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
  };
  app.appendChild(h('section', { class: 'card', style: { overflow: 'hidden' } },
    h('div', { class: 'card-head' }, h('h2', null, `Surgery history · ${list.length} surger${list.length === 1 ? 'y' : 'ies'}`),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' } }, f, h('span', { class: 'note' }, 'to'), t, who,
        h('button', { type: 'button', class: 'btn small dark', onclick: apply }, 'Show'),
        h('button', { type: 'button', class: 'btn small', disabled: !list.length, onclick: csv }, 'Download (Excel CSV)'))),
    Object.keys(counts).length ? h('div', { class: 'legend' }, h('b', { style: { color: '#17262B' } }, 'In this period:'),
      Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n, c]) => h('span', { class: 'item' }, `${n} `, h('b', null, c)))) : null,
    list.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'grid', style: { minWidth: '820px', fontSize: '13px' } },
      h('thead', null, h('tr', null, ['Date', 'Session', 'Assistant', 'Doctors', 'Case supervisor', 'Note', 'Recorded'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, list.map((s) => h('tr', null,
        h('td', { style: { whiteSpace: 'nowrap' } }, fmtDay(s.work_date) + ' ' + s.work_date.slice(0, 4)), h('td', null, s.session_code),
        h('td', { class: 'name' }, s.staff_name), h('td', null, h('span', { class: 'chip surg' }, s.doctors || '—')),
        h('td', null, s.supervisor || '—'), h('td', { class: 'note' }, s.note || ''),
        h('td', { class: 'note' }, `${s.recorded_at || ''} · ${String(s.recorded_by || '').replace(/ \(#\d+\)/, '')}`))))))
      : h('div', { class: 'loading' }, 'No surgeries recorded in this period.'),
    h('div', { class: 'hint', style: { padding: '0 20px 14px' } }, 'Totals in the queue above also include the opening counts carried over from your old tracker; this list shows surgeries recorded in the system.')));
};

// =====================================================================================
// CLINIC INVENTORY
// =====================================================================================
const INV = { clinic: null, data: null };
const PPM_LABEL = { OVERDUE: ['PPM overdue', 'new'], DUE_7_DAYS: ['Due within 7 days', 'new'], DUE_30_DAYS: ['Due within 30 days', ''], MISSING_DATE: ['PPM date missing', 'new'], OK: ['PPM OK', 'done'], NOT_REQUIRED: ['', ''] };

PAGES.inventory = async function renderInventory(app) {
  await loadRef();
  const fromHash = S.tab === 'inventory' && S.param && /^\d+$/.test(S.param) ? Number(S.param) : null;
  if (!INV.clinic) INV.clinic = fromHash || (S.me && S.me.homeClinic) || Number(S.ref.clinics[0].clinic_id);
  if (fromHash && fromHash !== INV.clinic) { INV.clinic = fromHash; INV.data = null; }
  if (!INV.data || INV.data.clinic_id !== INV.clinic) INV.data = await api('inventory?clinic_id=' + INV.clinic);
  const { items, summary, editable, catalog } = INV.data;
  const pickClinic = (c) => { INV.clinic = c; INV.data = null; history.replaceState(null, '', '#/inventory/' + c); S.param = String(c); render(); };

  app.appendChild(h('div', { class: 'page-title' }, h('h2', null, 'Clinic inventory'),
    h('span', { class: 'note' }, 'Machines (with Serial # and PPM dates) and instruments (quantities) in each clinic. Staff keep their own clinic up to date.')));

  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '8px' } });
  for (const s of summary) {
    const on = Number(s.clinic_id) === INV.clinic;
    const alert = Number(s.overdue) ? ['#FBE3E1', '#7A1E2C', `${s.overdue} overdue`] : Number(s.due_soon) ? ['#FFF4E5', '#8A4B0F', `${s.due_soon} due soon`] : Number(s.missing_date) ? ['#FFF4E5', '#8A4B0F', `${s.missing_date} no date`] : null;
    grid.appendChild(h('button', { type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: () => pickClinic(Number(s.clinic_id)),
      style: { textAlign: 'left', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', border: on ? '2px solid #16302F' : '1px solid #DDE1DC', background: on ? '#F3F4F1' : '#fff' } },
      h('div', { style: { fontWeight: 600 } }, 'Clinic ' + s.clinic_id),
      h('div', { class: 'note' }, `${s.items} item${Number(s.items) === 1 ? '' : 's'}`),
      alert ? h('div', { style: { marginTop: '4px', fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '999px', display: 'inline-block', background: alert[0], color: alert[1] } }, alert[2]) : null));
  }
  app.appendChild(h('div', { class: 'card pad' }, grid));

  // table
  const tbody = h('tbody');
  for (const it of items) {
    const p = PPM_LABEL[it.ppm_status] || ['', ''];
    tbody.appendChild(h('tr', { class: it.condition_status !== 'IN_SERVICE' ? 'unavail' : null },
      h('td', null, h('span', { class: 'status' }, it.item_kind === 'MACHINE' ? 'Machine' : 'Instrument')),
      h('td', { class: 'name' }, it.item_name),
      h('td', { style: { fontFamily: 'var(--mono)', fontSize: '12px' } }, it.item_kind === 'MACHINE' ? (it.serial_no || '—') : ''),
      h('td', { class: 'score' }, it.item_kind === 'MACHINE' ? '' : it.quantity),
      h('td', null, it.last_ppm_date ? fmtDay(it.last_ppm_date) + ' ' + it.last_ppm_date.slice(0, 4) : (it.item_kind === 'MACHINE' ? '—' : '')),
      h('td', null, it.ppm_due_date ? fmtDay(it.ppm_due_date) + ' ' + it.ppm_due_date.slice(0, 4) : (it.item_kind === 'MACHINE' ? '—' : '')),
      h('td', null, p[0] ? h('span', { class: 'status ' + p[1] }, p[0]) : null, it.condition_status !== 'IN_SERVICE' ? h('span', { class: 'status new', style: { marginLeft: '4px' } }, it.condition_status.replace(/_/g, ' ').toLowerCase()) : null),
      h('td', { class: 'note' }, it.last_verified_by_name ? `${it.last_verified_by_name} · ${it.last_verified_on || ''}` : '—'),
      h('td', null, editable ? h('div', { style: { display: 'flex', gap: '6px' } },
        h('button', { type: 'button', class: 'btn small', onclick: () => editItem(it) }, 'Update'),
        h('button', { type: 'button', class: 'btn small', title: 'Confirm this entry is still correct', onclick: async () => { try { await api('inventory', { method: 'POST', body: { action: 'verify', equipment_id: it.equipment_id } }); toast('Marked as checked.'); INV.data = null; render(); } catch (e) { toast(e.message); } } }, '✓ Still correct')) : null)));
  }
  app.appendChild(h('section', { class: 'card', style: { overflow: 'hidden' } },
    h('div', { class: 'card-head' }, h('h2', null, `Clinic ${INV.clinic} · ${items.length} item${items.length === 1 ? '' : 's'}`),
      h('span', { class: 'note' }, editable ? 'You can update this clinic.' : 'Read only: you can update your own clinic or the clinic you work in today.')),
    items.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'grid', style: { minWidth: '980px', fontSize: '13px' } },
      h('thead', null, h('tr', null, ['Type', 'Item', 'Serial #', 'Qty', 'Last PPM', 'PPM due', 'Status', 'Last checked by', ''].map((x) => h('th', { scope: 'col' }, x)))), tbody))
      : h('div', { class: 'loading' }, 'Nothing listed for this clinic yet.')));

  if (editable) app.appendChild(addItemCard(catalog));
};

function addItemCard(catalog) {
  let kind = 'MACHINE';
  const err = h('div', { class: 'msg bad', hidden: true, role: 'alert' });
  const name = h('input', { class: 'in', maxlength: 120, list: 'invCatalog', placeholder: 'e.g. Endo motor' });
  const dl = h('datalist', { id: 'invCatalog' });
  const serial = h('input', { class: 'in', maxlength: 60, placeholder: 'Required for machines' });
  const tag = h('input', { class: 'in', maxlength: 40, placeholder: 'Optional' });
  const last = h('input', { class: 'in', type: 'date', max: TODAY() });
  const interval = h('select', { class: 'in' }, h('option', { value: '' }, 'Not set'), [3, 6, 12, 24].map((m) => h('option', { value: m }, `Every ${m} months`)));
  const due = h('input', { class: 'in', type: 'date' });
  const qty = h('input', { class: 'in', type: 'number', min: 0, max: 9999, value: 1 });
  const notes = h('input', { class: 'in', maxlength: 200, placeholder: 'Optional' });
  const machineOnly = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Serial # *', serial), h('label', { class: 'f' }, 'Asset tag (biomedical)', tag)),
    h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Last PPM date', last), h('label', { class: 'f' }, 'PPM interval', interval)),
    h('label', { class: 'f' }, 'Next PPM due (if not using the interval)', due));
  const instrumentOnly = h('label', { class: 'f' }, 'Quantity', qty);
  const fillList = () => { dl.textContent = ''; catalog.filter((c) => c.item_kind === kind).forEach((c) => dl.appendChild(h('option', { value: c.item_name }))); };
  const segBtns = [['MACHINE', 'Machine'], ['INSTRUMENT', 'Instrument']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': k === kind ? 'true' : 'false', onclick: () => {
    kind = k; segBtns.forEach((b, i) => b.setAttribute('aria-pressed', ['MACHINE', 'INSTRUMENT'][i] === k ? 'true' : 'false'));
    machineOnly.hidden = k !== 'MACHINE'; instrumentOnly.hidden = k !== 'INSTRUMENT'; fillList();
  } }, l));
  instrumentOnly.hidden = true; fillList();
  const save = h('button', { type: 'button', class: 'btn dark', onclick: async () => {
    err.hidden = true;
    if (!name.value.trim()) { err.textContent = 'Enter the item name.'; err.hidden = false; return; }
    if (kind === 'MACHINE' && !serial.value.trim()) { err.textContent = 'Serial # is required for a machine.'; err.hidden = false; serial.focus(); return; }
    save.disabled = true;
    try {
      await api('inventory', { method: 'POST', body: kind === 'MACHINE'
        ? { action: 'add', clinic_id: INV.clinic, item_kind: kind, item_name: name.value, serial_no: serial.value, asset_tag: tag.value, last_ppm_date: last.value || null, ppm_interval_months: interval.value || null, ppm_due_date: due.value || null, notes: notes.value }
        : { action: 'add', clinic_id: INV.clinic, item_kind: kind, item_name: name.value, quantity: Number(qty.value), notes: notes.value } });
      toast('Added.'); INV.data = null; render();
    } catch (e) { err.textContent = e.message; err.hidden = false; save.disabled = false; }
  } }, 'Add to Clinic ' + INV.clinic);
  return h('section', { class: 'card pad', 'aria-label': 'Add an item' },
    h('h2', null, 'Add an item'),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Item type', style: { maxWidth: '320px' } }, segBtns),
    h('label', { class: 'f' }, 'Item name', name), dl, machineOnly, instrumentOnly, h('label', { class: 'f' }, 'Notes', notes), err, h('div', null, save));
}

function editItem(it) {
  const machine = it.item_kind === 'MACHINE';
  openDialog((body, close) => {
    const err = h('div', { class: 'msg bad', hidden: true, role: 'alert' });
    const serial = h('input', { class: 'in', value: it.serial_no || '', maxlength: 60 });
    const tag = h('input', { class: 'in', value: it.asset_tag || '', maxlength: 40 });
    const last = h('input', { class: 'in', type: 'date', value: it.last_ppm_date || '', max: TODAY() });
    const due = h('input', { class: 'in', type: 'date', value: it.ppm_due_date || '' });
    const qty = h('input', { class: 'in', type: 'number', min: 0, max: 9999, value: it.quantity });
    const status = h('select', { class: 'in' }, [['IN_SERVICE', 'In service'], ['UNDER_REPAIR', 'Under repair'], ['OUT_OF_SERVICE', 'Out of service'], ['RETIRED', 'Retired (remove from list)']].map(([v, l]) => h('option', { value: v }, l)));
    status.value = it.condition_status;
    const notes = h('input', { class: 'in', value: it.notes || '', maxlength: 200 });
    body.append(h('h3', null, `${it.item_name} · Clinic ${it.clinic_id}`),
      machine ? h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Serial # *', serial), h('label', { class: 'f' }, 'Asset tag', tag)) : h('label', { class: 'f' }, 'Quantity', qty),
      machine ? h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Last PPM date', last), h('label', { class: 'f' }, 'Next PPM due', due)) : null,
      machine ? h('div', { class: 'hint' }, 'Change the last PPM date and leave "next due" as it is: the due date is recalculated from the interval when one is set.') : null,
      h('label', { class: 'f' }, 'Status', status), h('label', { class: 'f' }, 'Notes', notes), err,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: close }, 'Cancel'),
        h('button', { type: 'button', class: 'btn dark', onclick: async () => {
          if (machine && !serial.value.trim()) { err.textContent = 'Serial # is required for a machine.'; err.hidden = false; return; }
          const bodyData = { action: 'update', equipment_id: it.equipment_id, condition_status: status.value, notes: notes.value };
          if (machine) {
            bodyData.serial_no = serial.value; bodyData.asset_tag = tag.value;
            if (last.value !== (it.last_ppm_date || '')) bodyData.last_ppm_date = last.value || null;
            if (due.value !== (it.ppm_due_date || '')) bodyData.ppm_due_date = due.value || null;
          } else bodyData.quantity = Number(qty.value);
          try { await api('inventory', { method: 'POST', body: bodyData }); close(); toast('Updated.'); INV.data = null; render(); }
          catch (e) { err.textContent = e.message; err.hidden = false; }
        } }, 'Save')));
  });
}
