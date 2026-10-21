// Clinic inventory: machines and instruments per clinic, with PPM dates for machines.
//
// GET  /api/inventory?clinic_id=9        signed-in staff + CIC
// POST /api/inventory                    staff for their own clinic (or a clinic they work in today); CIC any
//   { action: "add", clinic_id, item_kind: "MACHINE"|"INSTRUMENT", item_name, serial_no, asset_tag,
//     quantity, last_ppm_date, ppm_due_date, ppm_interval_months, notes }
//     → Serial # exists only for machines and is required there; machines are one row per unit (quantity 1).
//       Instruments have no serial number, only a quantity.
//   { action: "add_instruments", clinic_id, items: [{ item_id | item_name, quantity }], notes }
//   { action: "update", equipment_id, quantity, last_ppm_date, ppm_due_date, serial_no, asset_tag, condition_status, notes }
//   { action: "verify", equipment_id }    "still correct" — stamps who checked and when
// Item names come from a standard list (dropdown). "Other…" saves a typed name as PENDING; the CIC
// then adds it to the list or links it to an existing item. CIC list actions:
//   { action: "catalog_add", item_kind, item_name, requires_ppm, ppm_interval_months }
//   { action: "catalog_ppm", item_id, requires_ppm }      machine has a PPM due date (Y/N)
//   { action: "import", rows: [{ clinic_id, item_name, serial_no, asset_tag, status, last_ppm_date, ppm_due_date }] }
//       machines from the department's Excel sheets (read in the browser); matched by item + Serial #
//   { action: "catalog_bulk", items: [{ item_kind, item_name, ppm_interval_months }] }
//   { action: "catalog_remove", item_id }            (existing clinic items keep their name)
//   { action: "catalog_approve", item_id }           PENDING → STANDARD
//   { action: "catalog_merge", item_id, into_item_id }   PENDING name was a variant of a list item
// Every change to quantity / PPM dates / status is written to EQUIPMENT_HISTORY by trigger.
// Two lists per clinic: GENERAL machines = the CIC's records (no responsible staff; read-only for staff),
// INDIVIDUAL = machines/instruments a staff member is responsible for (Staff ID in the sheet, or whoever added it).
const { query, one, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireUser, isIsoDate, riyadhToday } = require('./lib/http');
const { ensureSchema } = require('./lib/migrate');

const KINDS = ['MACHINE', 'INSTRUMENT'];
const STATUSES = ['IN_SERVICE', 'OUT_OF_SERVICE', 'UNDER_REPAIR', 'RETIRED'];
const optDate = (v, label) => {
  if (v === undefined || v === null || v === '') return null;
  if (!isIsoDate(v)) throw new HttpError(400, `${label} must be a valid date.`);
  return v;
};
const clean = (v, max) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, max));

async function canEditClinic(user, clinicId) {
  if (user.role === 'ADMIN') return true;
  const r = await one(`
    SELECT (SELECT COUNT(*) FROM staff WHERE staff_id = :sid AND home_clinic_id = :cid)
         + (SELECT COUNT(*) FROM v_assignments_current WHERE staff_id = :sid AND clinic_id = :cid
             AND work_date = TO_DATE(:t, 'YYYY-MM-DD')) AS n FROM dual`, { sid: user.sid, cid: clinicId, t: riyadhToday() });
  return Number(r.n) > 0;
}

exports.handler = handler(['GET', 'POST'], async (event) => {
  const user = requireUser(event);
  await ensureSchema();
  const isCic = user.role === 'ADMIN';

  if (event.httpMethod === 'GET') {
    const cid = Number((event.queryStringParameters || {}).clinic_id);
    const [items, summary, catalog] = await Promise.all([
      cid ? query(`
        SELECT v.equipment_id, v.clinic_id, v.item_id, v.item_name, v.item_kind, v.requires_ppm, v.asset_tag, v.serial_no, v.quantity,
               v.condition_status, TO_CHAR(v.last_ppm_date, 'YYYY-MM-DD') AS last_ppm_date,
               TO_CHAR(v.ppm_due_date, 'YYYY-MM-DD') AS ppm_due_date, v.days_remaining, v.ppm_status, c.list_status,
               v.last_verified_by_name, TO_CHAR(CAST(v.last_verified_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD') AS last_verified_on, v.notes,
               ep.responsible_staff_id, rs.display_name AS responsible_name
          FROM v_equipment_status v JOIN equipment_catalog c ON c.item_id = v.item_id
          JOIN equipment_ppm ep ON ep.equipment_id = v.equipment_id
          LEFT JOIN staff rs ON rs.staff_id = ep.responsible_staff_id
         WHERE v.clinic_id = :cid
         ORDER BY v.item_kind, v.item_name, v.serial_no`, { cid }) : [],
      query(`
        SELECT c.clinic_id,
               COUNT(e.equipment_id) AS items,
               SUM(CASE WHEN e.ppm_status = 'OVERDUE' THEN 1 ELSE 0 END)                    AS overdue,
               SUM(CASE WHEN e.ppm_status IN ('DUE_7_DAYS', 'DUE_30_DAYS') THEN 1 ELSE 0 END) AS due_soon,
               SUM(CASE WHEN e.ppm_status = 'MISSING_DATE' THEN 1 ELSE 0 END)               AS missing_date
          FROM clinics c LEFT JOIN v_equipment_status e ON e.clinic_id = c.clinic_id
         WHERE c.is_active = 'Y'
         GROUP BY c.clinic_id ORDER BY c.clinic_id`),
      query(`SELECT item_id, item_name, item_kind, requires_ppm, ppm_interval_months FROM equipment_catalog
              WHERE is_active = 'Y' AND list_status = 'STANDARD' AND item_kind IN ('MACHINE', 'INSTRUMENT')
              ORDER BY item_kind, UPPER(item_name)`),
    ]);
    const editable = cid ? await canEditClinic(user, cid) : false;
    const pending = isCic ? await query(`
      SELECT c.item_id, c.item_name, c.item_kind,
             LISTAGG(DISTINCT 'Cl ' || e.clinic_id, ', ') WITHIN GROUP (ORDER BY e.clinic_id) AS clinics
        FROM equipment_catalog c LEFT JOIN equipment_ppm e ON e.item_id = c.item_id AND e.condition_status <> 'RETIRED'
       WHERE c.list_status = 'PENDING' AND c.is_active = 'Y'
       GROUP BY c.item_id, c.item_name, c.item_kind ORDER BY c.item_kind, UPPER(c.item_name)`) : undefined;
    return json(200, { clinic_id: cid || null, editable, items, summary, catalog, pending });
  }

  const b = parseBody(event);
  const by = `${user.name} (#${user.sid})`;

  // ---- standard list management (CIC)
  if (String(b.action || '').startsWith('catalog_')) {
    if (!isCic) throw new HttpError(403, 'Only the CIC can change the standard list.');
    const addOne = async (it) => {
      const kind = String(it.item_kind || '').toUpperCase();
      const name = clean(it.item_name, 120);
      if (!KINDS.includes(kind) || !name) throw new HttpError(400, 'Each item needs a type (Machine/Instrument) and a name.');
      const intv = it.ppm_interval_months ? Number(it.ppm_interval_months) : null;
      const ppm = kind !== 'MACHINE' ? 'N' : it.requires_ppm === undefined || it.requires_ppm === null ? null : (it.requires_ppm === true || it.requires_ppm === 'Y' ? 'Y' : 'N');
      await exec(`
        BEGIN
          UPDATE equipment_catalog
             SET list_status = 'STANDARD', is_active = 'Y', item_name = :nm, requires_ppm = NVL(:ppm, requires_ppm),
                 ppm_interval_months = NVL(:intv, ppm_interval_months), updated_at = SYSTIMESTAMP
           WHERE UPPER(item_name) = UPPER(:nm) AND item_kind = :kind;
          IF SQL%ROWCOUNT = 0 THEN
            INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, ppm_interval_months, list_status)
            VALUES (:nm, :kind, NVL(:ppm, 'N'), :intv, 'STANDARD');
          END IF;
          COMMIT;
        END;`, { nm: name, kind, intv, ppm });
    };
    if (b.action === 'catalog_add') { await addOne(b); return json(200, { ok: true }); }
    if (b.action === 'catalog_bulk') {
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 500) throw new HttpError(400, 'Send 1–500 items.');
      for (const it of b.items) await addOne(it);
      return json(200, { ok: true, added: b.items.length });
    }
    const itemId = Number(b.item_id);
    if (!itemId) throw new HttpError(400, 'item_id is required.');
    if (b.action === 'catalog_ppm') {
      await exec(`BEGIN UPDATE equipment_catalog SET requires_ppm = :p, updated_at = SYSTIMESTAMP WHERE item_id = :id AND item_kind = 'MACHINE'; COMMIT; END;`,
        { p: b.requires_ppm === true || b.requires_ppm === 'Y' ? 'Y' : 'N', id: itemId });
      return json(200, { ok: true });
    }
    if (b.action === 'catalog_remove') {
      await exec(`BEGIN UPDATE equipment_catalog SET list_status = 'REMOVED', updated_at = SYSTIMESTAMP WHERE item_id = :id; COMMIT; END;`, { id: itemId });
      return json(200, { ok: true });
    }
    if (b.action === 'catalog_approve') {
      await exec(`BEGIN UPDATE equipment_catalog SET list_status = 'STANDARD', updated_at = SYSTIMESTAMP WHERE item_id = :id; COMMIT; END;`, { id: itemId });
      return json(200, { ok: true });
    }
    if (b.action === 'catalog_merge') {
      const into = Number(b.into_item_id);
      if (!into || into === itemId) throw new HttpError(400, 'Choose the list item it is the same as.');
      await exec(`
        BEGIN
          UPDATE equipment_ppm SET item_id = :into, updated_by = :by WHERE item_id = :id;
          UPDATE equipment_catalog SET list_status = 'REMOVED', is_active = 'N', updated_at = SYSTIMESTAMP WHERE item_id = :id;
          COMMIT;
        END;`, { into, id: itemId, by });
      return json(200, { ok: true });
    }
    throw new HttpError(400, 'Unknown action.');
  }

  // ---- CIC: import machines from the department's Excel sheets (parsed in the browser)
  if (b.action === 'import') {
    if (!isCic) throw new HttpError(403, 'Only the CIC can import the inventory sheet.');
    if (!Array.isArray(b.rows) || !b.rows.length) throw new HttpError(400, 'No machines to import.');
    if (b.rows.length > 1500) throw new HttpError(400, 'Too many rows (max 1500).');
    const STAT = { FUNCTIONING: 'IN_SERVICE', 'NON-FUNCTIONING': 'OUT_OF_SERVICE', 'NON FUNCTIONING': 'OUT_OF_SERVICE', 'UNDER REPAIR': 'UNDER_REPAIR' };
    const rows = [];
    b.rows.forEach((r, i) => {
      const cid = Number(r.clinic_id);
      const name = clean(r.item_name, 120);
      if (!Number.isInteger(cid) || cid < 1 || cid > 999 || !name) throw new HttpError(400, `Row ${i + 1}: clinic and item name are required.`);
      rows.push({ c: cid, n: name, s: clean(r.serial_no, 60), t: clean(r.asset_tag, 40), sn: clean(r.staff_no, 20),
        st: STAT[String(r.status || 'Functioning').trim().toUpperCase()] || 'IN_SERVICE',
        lp: optDate(r.last_ppm_date, `Row ${i + 1}: last PPM date`), due: optDate(r.ppm_due_date, `Row ${i + 1}: PPM due date`) });
    });
    const active = new Set((await query(`SELECT clinic_id FROM clinics WHERE is_active = 'Y'`)).map((r) => Number(r.clinic_id)));
    const skipped = [...new Set(rows.filter((r) => !active.has(r.c)).map((r) => r.c))];
    await exec(`
DECLARE
  l_item NUMBER; l_eq NUMBER;
BEGIN
  FOR r IN (SELECT j.c, j.n, j.s, j.t, j.st, j.lp, j.due,
                   (SELECT MIN(p.staff_id) FROM staff p WHERE UPPER(p.employee_no) = UPPER(j.sn)) AS by_staff
              FROM JSON_TABLE(:js, '$[*]' COLUMNS (c NUMBER PATH '$.c', n VARCHAR2(120) PATH '$.n', s VARCHAR2(60) PATH '$.s',
                     t VARCHAR2(40) PATH '$.t', st VARCHAR2(15) PATH '$.st', lp VARCHAR2(10) PATH '$.lp', due VARCHAR2(10) PATH '$.due',
                     sn VARCHAR2(20) PATH '$.sn')) j
             WHERE EXISTS (SELECT 1 FROM clinics k WHERE k.clinic_id = j.c AND k.is_active = 'Y')) LOOP
    BEGIN
      SELECT item_id INTO l_item FROM equipment_catalog
       WHERE UPPER(item_name) = UPPER(r.n) AND item_kind = 'MACHINE' AND ROWNUM = 1;
      UPDATE equipment_catalog SET list_status = 'STANDARD', is_active = 'Y' WHERE item_id = l_item AND list_status = 'REMOVED';
    EXCEPTION WHEN NO_DATA_FOUND THEN
      INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status)
      VALUES (r.n, 'MACHINE', CASE WHEN r.due IS NOT NULL THEN 'Y' ELSE 'N' END, 'STANDARD')
      RETURNING item_id INTO l_item;
    END;
    l_eq := NULL;
    BEGIN
      IF r.s IS NOT NULL THEN
        SELECT equipment_id INTO l_eq FROM equipment_ppm
         WHERE item_id = l_item AND clinic_id = r.c AND UPPER(serial_no) = UPPER(r.s) AND condition_status <> 'RETIRED' AND ROWNUM = 1;
      ELSE
        SELECT equipment_id INTO l_eq FROM equipment_ppm
         WHERE item_id = l_item AND clinic_id = r.c AND serial_no IS NULL AND condition_status <> 'RETIRED' AND ROWNUM = 1;
      END IF;
    EXCEPTION WHEN NO_DATA_FOUND THEN l_eq := NULL;
    END;
    IF l_eq IS NULL THEN
      INSERT INTO equipment_ppm (clinic_id, item_id, asset_tag, serial_no, quantity, condition_status, last_ppm_date, ppm_due_date, last_verified_by, responsible_staff_id, updated_by, notes)
      VALUES (r.c, l_item, r.t, r.s, 1, r.st, TO_DATE(r.lp, 'YYYY-MM-DD'), TO_DATE(r.due, 'YYYY-MM-DD'), r.by_staff, r.by_staff, :by, 'Imported from the inventory sheet');
    ELSE
      UPDATE equipment_ppm
         SET asset_tag = NVL(r.t, asset_tag), condition_status = r.st,
             last_ppm_date = NVL(TO_DATE(r.lp, 'YYYY-MM-DD'), last_ppm_date),
             ppm_due_date  = NVL(TO_DATE(r.due, 'YYYY-MM-DD'), ppm_due_date), last_verified_by = NVL(r.by_staff, last_verified_by),
             responsible_staff_id = NVL(r.by_staff, responsible_staff_id), updated_by = :by
       WHERE equipment_id = l_eq;
    END IF;
  END LOOP;
  COMMIT;
END;`, { js: JSON.stringify(rows), by });
    return json(200, { ok: true, saved: rows.filter((r) => active.has(r.c)).length, skipped_clinics: skipped });
  }

  // ---- several instruments at once: [{ item_id | item_name, quantity }]; an instrument already
  //      listed in this clinic (same list) gets its quantity updated instead of a second row
  if (b.action === 'add_instruments') {
    const cid = Number(b.clinic_id);
    if (!cid) throw new HttpError(400, 'Choose the clinic.');
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 100) throw new HttpError(400, 'Add 1–100 instruments.');
    const items = b.items.map((it, i) => {
      const id = it.item_id ? Number(it.item_id) : null;
      const nm = id ? null : clean(it.item_name, 120);
      const q = Number(it.quantity);
      if (!id && !nm) throw new HttpError(400, `Row ${i + 1}: choose the instrument.`);
      if (it.quantity === '' || it.quantity === null || it.quantity === undefined || !Number.isInteger(q) || q < 1 || q > 9999) throw new HttpError(400, `Row ${i + 1}: the quantity is required (1 or more, numbers only).`);
      return { i: id, n: nm, q };
    });
    if (!(await canEditClinic(user, cid))) throw new HttpError(403, 'You can only update the inventory of your own clinic or the clinic you work in today.');
    const resp = isCic ? (Number(b.responsible_staff_id) || null) : user.sid;   // CIC: General, or a chosen staff member's list
    const existing = await query(`SELECT item_id FROM equipment_ppm WHERE clinic_id = :cid AND condition_status <> 'RETIRED'
                                     AND (responsible_staff_id = :r OR (responsible_staff_id IS NULL AND :r IS NULL))`, { cid, r: resp });
    const have = new Set(existing.map((r) => Number(r.item_id)));
    await exec(`
DECLARE
  l_item NUMBER; l_eq NUMBER;
BEGIN
  FOR r IN (SELECT j.i, j.n, j.q FROM JSON_TABLE(:js, '$[*]' COLUMNS (i NUMBER PATH '$.i', n VARCHAR2(120) PATH '$.n', q NUMBER PATH '$.q')) j) LOOP
    IF r.i IS NOT NULL THEN
      SELECT item_id INTO l_item FROM equipment_catalog WHERE item_id = r.i AND item_kind = 'INSTRUMENT';
    ELSE
      BEGIN
        SELECT item_id INTO l_item FROM equipment_catalog
         WHERE UPPER(item_name) = UPPER(r.n) AND item_kind = 'INSTRUMENT' AND list_status <> 'REMOVED' AND ROWNUM = 1;
      EXCEPTION WHEN NO_DATA_FOUND THEN
        INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status) VALUES (r.n, 'INSTRUMENT', 'N', 'PENDING')
        RETURNING item_id INTO l_item;
      END;
    END IF;
    BEGIN
      SELECT equipment_id INTO l_eq FROM equipment_ppm
       WHERE clinic_id = :cid AND item_id = l_item AND condition_status <> 'RETIRED'
         AND (responsible_staff_id = :resp OR (responsible_staff_id IS NULL AND :resp IS NULL)) AND ROWNUM = 1;
      UPDATE equipment_ppm SET quantity = r.q, last_verified_by = :sid, last_verified_at = SYSTIMESTAMP, updated_by = :by
       WHERE equipment_id = l_eq;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      INSERT INTO equipment_ppm (clinic_id, item_id, quantity, last_verified_by, last_verified_at, responsible_staff_id, updated_by, notes)
      VALUES (:cid, l_item, r.q, :sid, SYSTIMESTAMP, :resp, :by, :notes);
    END;
  END LOOP;
  COMMIT;
END;`, { js: JSON.stringify(items), cid, resp, sid: user.sid, by, notes: clean(b.notes, 400) });
    return json(200, { ok: true, saved: items.length, updated: items.filter((x) => x.i && have.has(x.i)).length });
  }

  if (b.action === 'add') {
    const cid = Number(b.clinic_id);
    const kind = String(b.item_kind || '').toUpperCase();
    const listId = b.item_id ? Number(b.item_id) : null;          // chosen from the dropdown
    const name = listId ? null : clean(b.item_name, 120);         // typed under "Other…"
    const serial = kind === 'MACHINE' ? clean(b.serial_no, 60) : null; // serial numbers belong to machines only
    if (!cid) throw new HttpError(400, 'Choose the clinic.');
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Choose Machine or Instrument.');
    if (!listId && !name) throw new HttpError(400, 'Choose the item from the list, or pick "Other…" and type its name.');
    if (kind === 'MACHINE' && !serial) throw new HttpError(400, 'Serial # is required for a machine.');
    const qty = kind === 'MACHINE' ? 1 : (b.quantity === '' || b.quantity === null || b.quantity === undefined ? NaN : Number(b.quantity));
    if (!Number.isInteger(qty) || qty < (kind === 'MACHINE' ? 0 : 1) || qty > 9999) throw new HttpError(400, 'The quantity is required (1 or more).');
    const interval = b.ppm_interval_months ? Number(b.ppm_interval_months) : null;
    if (interval !== null && !(Number.isInteger(interval) && interval >= 1 && interval <= 120)) throw new HttpError(400, 'PPM interval must be 1–120 months.');
    if (!(await canEditClinic(user, cid))) throw new HttpError(403, 'You can only update the inventory of your own clinic or the clinic you work in today.');
    if (!isCic && listId) {
      const it = await one(`SELECT requires_ppm FROM equipment_catalog WHERE item_id = :id`, { id: listId });
      if (it && it.requires_ppm === 'Y') throw new HttpError(403, 'The dental chair, X-ray unit and microscope are General machines kept by the CIC.');
    }

    await exec(`
DECLARE
  l_item NUMBER;
  l_dup  NUMBER;
BEGIN
  IF :kind = 'MACHINE' THEN
    SELECT COUNT(*) INTO l_dup FROM equipment_ppm e JOIN equipment_catalog i ON i.item_id = e.item_id
     WHERE i.item_kind = 'MACHINE' AND UPPER(e.serial_no) = UPPER(:ser) AND e.condition_status <> 'RETIRED';
    IF l_dup > 0 THEN RAISE_APPLICATION_ERROR(-20060, 'A machine with this Serial # is already registered.'); END IF;
  END IF;
  IF :lid IS NOT NULL THEN
    SELECT item_id INTO l_item FROM equipment_catalog WHERE item_id = :lid AND item_kind = :kind;
  ELSE
    BEGIN
      SELECT item_id INTO l_item FROM equipment_catalog
       WHERE UPPER(item_name) = UPPER(:nm) AND item_kind = :kind AND list_status <> 'REMOVED' AND ROWNUM = 1;
    EXCEPTION WHEN NO_DATA_FOUND THEN
      INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, ppm_interval_months, list_status)
      VALUES (:nm, :kind, CASE WHEN :kind = 'MACHINE' AND :ppm = 'Y' THEN 'Y' ELSE 'N' END, :intv, 'PENDING')
      RETURNING item_id INTO l_item;
    END;
  END IF;
  IF :intv IS NOT NULL THEN
    UPDATE equipment_catalog SET ppm_interval_months = :intv, requires_ppm = 'Y', updated_at = SYSTIMESTAMP
     WHERE item_id = l_item AND ppm_interval_months IS NULL;
  END IF;
  INSERT INTO equipment_ppm (clinic_id, item_id, asset_tag, serial_no, quantity, last_ppm_date, ppm_due_date,
                             last_verified_by, last_verified_at, responsible_staff_id, updated_by, notes)
  VALUES (:cid, l_item, :tag, :ser, :qty, TO_DATE(:lp, 'YYYY-MM-DD'), TO_DATE(:due, 'YYYY-MM-DD'),
          :sid, SYSTIMESTAMP, :resp, :by, :notes);
  COMMIT;
END;`, {
      kind, lid: listId, ser: serial, nm: name, ppm: isCic && (b.requires_ppm === true || b.requires_ppm === 'Y') ? 'Y' : 'N', intv: kind === 'MACHINE' ? interval : null, cid, tag: kind === 'MACHINE' ? clean(b.asset_tag, 40) : null, qty,
      lp: kind === 'MACHINE' ? optDate(b.last_ppm_date, 'Last PPM date') : null,
      due: kind === 'MACHINE' ? optDate(b.ppm_due_date, 'PPM due date') : null,
      sid: user.sid, resp: isCic ? (Number(b.responsible_staff_id) || null) : user.sid, by, notes: clean(b.notes, 400),
    });
    return json(200, { ok: true });
  }

  const id = Number(b.equipment_id);
  if (!id) throw new HttpError(400, 'equipment_id is required.');
  const row = await one(`SELECT e.clinic_id, i.item_kind, e.responsible_staff_id FROM equipment_ppm e JOIN equipment_catalog i ON i.item_id = e.item_id WHERE e.equipment_id = :id`, { id });
  if (!row) throw new HttpError(404, 'Item not found.');
  if (!(await canEditClinic(user, Number(row.clinic_id)))) throw new HttpError(403, 'You can only update the inventory of your own clinic or the clinic you work in today.');
  // General machines (the CIC's records: master list and anything the CIC adds): staff of the clinic
  // may only update the PPM dates; everything else stays with the CIC.
  if (!isCic && row.responsible_staff_id == null) {
    if (b.action !== 'update' || (b.last_ppm_date === undefined && b.ppm_due_date === undefined)) throw new HttpError(403, 'General machines are kept by the CIC. You can update their PPM dates.');
    for (const k of Object.keys(b)) if (!['action', 'equipment_id', 'last_ppm_date', 'ppm_due_date'].includes(k)) delete b[k];
  }

  if (b.action === 'verify') {
    await exec(`BEGIN UPDATE equipment_ppm SET last_verified_by = :sid, last_verified_at = SYSTIMESTAMP, updated_by = :by WHERE equipment_id = :id; COMMIT; END;`, { sid: user.sid, by, id });
    return json(200, { ok: true });
  }

  if (b.action === 'update') {
    const status = b.condition_status ? String(b.condition_status).toUpperCase() : null;
    if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Unknown status.');
    const serial = row.item_kind !== 'MACHINE' || b.serial_no === undefined ? undefined : clean(b.serial_no, 60);
    if (row.item_kind === 'MACHINE' && serial === null) throw new HttpError(400, 'Serial # is required for a machine.');
    let qty = b.quantity === undefined || b.quantity === '' ? null : Number(b.quantity);
    if (qty !== null && (!Number.isInteger(qty) || qty < 0 || qty > 9999)) throw new HttpError(400, 'Enter a quantity (0 or more).');
    if (row.item_kind === 'INSTRUMENT' && b.quantity !== undefined && !(qty >= 1) && (status || 'IN_SERVICE') !== 'RETIRED') throw new HttpError(400, 'The quantity is required (1 or more).');
    if (row.item_kind === 'MACHINE') qty = null; // one row per machine
    await exec(`
      BEGIN
        UPDATE equipment_ppm
           SET quantity         = NVL(:qty, quantity),
               serial_no        = CASE WHEN :serset = 'Y' THEN :ser ELSE serial_no END,
               asset_tag        = CASE WHEN :tagset = 'Y' THEN :tag ELSE asset_tag END,
               last_ppm_date    = CASE WHEN :lpset = 'Y' THEN TO_DATE(:lp, 'YYYY-MM-DD') ELSE last_ppm_date END,
               ppm_due_date     = CASE WHEN :dueset = 'Y' THEN TO_DATE(:due, 'YYYY-MM-DD') ELSE ppm_due_date END,
               condition_status = NVL(:st, condition_status),
               notes            = CASE WHEN :noteset = 'Y' THEN :notes ELSE notes END,
               last_verified_by = :sid, last_verified_at = SYSTIMESTAMP, updated_by = :by
         WHERE equipment_id = :id;
        COMMIT;
      END;`, {
      qty, serset: serial === undefined ? 'N' : 'Y', ser: serial ?? null,
      tagset: b.asset_tag === undefined ? 'N' : 'Y', tag: clean(b.asset_tag, 40),
      lpset: b.last_ppm_date === undefined ? 'N' : 'Y', lp: optDate(b.last_ppm_date, 'Last PPM date'),
      dueset: b.ppm_due_date === undefined ? 'N' : 'Y', due: optDate(b.ppm_due_date, 'PPM due date'),
      st: status, noteset: b.notes === undefined ? 'N' : 'Y', notes: clean(b.notes, 400), sid: user.sid, by, id,
    });
    return json(200, { ok: true });
  }

  throw new HttpError(400, 'Unknown action.');
});
