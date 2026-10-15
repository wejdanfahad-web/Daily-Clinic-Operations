// Clinic inventory: machines and instruments per clinic, with PPM dates for machines.
//
// GET  /api/inventory?clinic_id=9        signed-in staff + CIC
// POST /api/inventory                    staff for their own clinic (or a clinic they work in today); CIC any
//   { action: "add", clinic_id, item_kind: "MACHINE"|"INSTRUMENT", item_name, serial_no, asset_tag,
//     quantity, last_ppm_date, ppm_due_date, ppm_interval_months, notes }
//     → Serial # exists only for machines and is required there; machines are one row per unit (quantity 1).
//       Instruments have no serial number, only a quantity.
//   { action: "update", equipment_id, quantity, last_ppm_date, ppm_due_date, serial_no, asset_tag, condition_status, notes }
//   { action: "verify", equipment_id }    "still correct" — stamps who checked and when
// Every change to quantity / PPM dates / status is written to EQUIPMENT_HISTORY by trigger.
const { query, one, exec } = require('./lib/db');
const { handler, json, parseBody, HttpError, requireUser, isIsoDate, riyadhToday } = require('./lib/http');

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

  if (event.httpMethod === 'GET') {
    const cid = Number((event.queryStringParameters || {}).clinic_id);
    const [items, summary, catalog] = await Promise.all([
      cid ? query(`
        SELECT equipment_id, clinic_id, item_id, item_name, item_kind, requires_ppm, asset_tag, serial_no, quantity,
               condition_status, TO_CHAR(last_ppm_date, 'YYYY-MM-DD') AS last_ppm_date,
               TO_CHAR(ppm_due_date, 'YYYY-MM-DD') AS ppm_due_date, days_remaining, ppm_status,
               last_verified_by_name, TO_CHAR(CAST(last_verified_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD') AS last_verified_on, notes
          FROM v_equipment_status WHERE clinic_id = :cid
         ORDER BY item_kind, item_name, serial_no`, { cid }) : [],
      query(`
        SELECT c.clinic_id,
               COUNT(e.equipment_id) AS items,
               SUM(CASE WHEN e.ppm_status = 'OVERDUE' THEN 1 ELSE 0 END)                    AS overdue,
               SUM(CASE WHEN e.ppm_status IN ('DUE_7_DAYS', 'DUE_30_DAYS') THEN 1 ELSE 0 END) AS due_soon,
               SUM(CASE WHEN e.ppm_status = 'MISSING_DATE' THEN 1 ELSE 0 END)               AS missing_date
          FROM clinics c LEFT JOIN v_equipment_status e ON e.clinic_id = c.clinic_id
         WHERE c.is_active = 'Y'
         GROUP BY c.clinic_id ORDER BY c.clinic_id`),
      query(`SELECT item_id, item_name, item_kind, ppm_interval_months FROM equipment_catalog
              WHERE is_active = 'Y' AND item_kind IN ('MACHINE', 'INSTRUMENT') ORDER BY item_kind, item_name`),
    ]);
    const editable = cid ? await canEditClinic(user, cid) : false;
    return json(200, { clinic_id: cid || null, editable, items, summary, catalog });
  }

  const b = parseBody(event);
  const by = `${user.name} (#${user.sid})`;

  if (b.action === 'add') {
    const cid = Number(b.clinic_id);
    const kind = String(b.item_kind || '').toUpperCase();
    const name = clean(b.item_name, 120);
    const serial = kind === 'MACHINE' ? clean(b.serial_no, 60) : null; // serial numbers belong to machines only
    if (!cid) throw new HttpError(400, 'Choose the clinic.');
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Choose Machine or Instrument.');
    if (!name) throw new HttpError(400, 'Enter the item name.');
    if (kind === 'MACHINE' && !serial) throw new HttpError(400, 'Serial # is required for a machine.');
    const qty = kind === 'MACHINE' ? 1 : Number(b.quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > 9999) throw new HttpError(400, 'Enter a quantity (0 or more).');
    const interval = b.ppm_interval_months ? Number(b.ppm_interval_months) : null;
    if (interval !== null && !(Number.isInteger(interval) && interval >= 1 && interval <= 120)) throw new HttpError(400, 'PPM interval must be 1–120 months.');
    if (!(await canEditClinic(user, cid))) throw new HttpError(403, 'You can only update the inventory of your own clinic or the clinic you work in today.');

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
  BEGIN
    SELECT item_id INTO l_item FROM equipment_catalog
     WHERE UPPER(item_name) = UPPER(:nm) AND item_kind = :kind AND ROWNUM = 1;
    IF :intv IS NOT NULL THEN
      UPDATE equipment_catalog SET ppm_interval_months = :intv, requires_ppm = 'Y', updated_at = SYSTIMESTAMP WHERE item_id = l_item;
    END IF;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, ppm_interval_months)
    VALUES (:nm, :kind, CASE WHEN :kind = 'MACHINE' THEN 'Y' ELSE 'N' END, :intv)
    RETURNING item_id INTO l_item;
  END;
  INSERT INTO equipment_ppm (clinic_id, item_id, asset_tag, serial_no, quantity, last_ppm_date, ppm_due_date,
                             last_verified_by, last_verified_at, updated_by, notes)
  VALUES (:cid, l_item, :tag, :ser, :qty, TO_DATE(:lp, 'YYYY-MM-DD'), TO_DATE(:due, 'YYYY-MM-DD'),
          :sid, SYSTIMESTAMP, :by, :notes);
  COMMIT;
END;`, {
      kind, ser: serial, nm: name, intv: kind === 'MACHINE' ? interval : null, cid, tag: kind === 'MACHINE' ? clean(b.asset_tag, 40) : null, qty,
      lp: kind === 'MACHINE' ? optDate(b.last_ppm_date, 'Last PPM date') : null,
      due: kind === 'MACHINE' ? optDate(b.ppm_due_date, 'PPM due date') : null,
      sid: user.sid, by, notes: clean(b.notes, 400),
    });
    return json(200, { ok: true });
  }

  const id = Number(b.equipment_id);
  if (!id) throw new HttpError(400, 'equipment_id is required.');
  const row = await one(`SELECT e.clinic_id, i.item_kind FROM equipment_ppm e JOIN equipment_catalog i ON i.item_id = e.item_id WHERE e.equipment_id = :id`, { id });
  if (!row) throw new HttpError(404, 'Item not found.');
  if (!(await canEditClinic(user, Number(row.clinic_id)))) throw new HttpError(403, 'You can only update the inventory of your own clinic or the clinic you work in today.');

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
