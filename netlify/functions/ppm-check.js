// Scheduled daily at 07:30 Riyadh (see netlify.toml). First delivers messages held overnight
// (nothing is sent between 16:30 and 07:30), then the PPM alerts.
// PPM alerts go to the clinic's own staff only (by home clinic): "due within 7 days" once, "overdue"
// on the first day and then a reminder each Sunday. The CIC gets one summary on Sundays instead of
// a copy of every clinic's alert. Running daily also keeps the free database from
// being auto-stopped for inactivity.
const { query } = require('./lib/db');
const { notifyStaff, notifyCic, flushPending, riyadhDate } = require('./lib/push');

exports.handler = async () => {
  const flushed = await flushPending();
  console.log('flushed held notifications', flushed);
  const today = riyadhDate();
  const rows = await query(`
    SELECT equipment_id, clinic_id, clinic_name, item_name, asset_tag,
           TO_CHAR(ppm_due_date, 'YYYY-MM-DD') AS due, days_remaining, ppm_status, staff_id
      FROM v_ppm_alert_recipients WHERE recipient_role = 'CLINIC_STAFF'`, {}, { limit: 5000 });
  const sunday = new Date(today + 'T12:00:00Z').getUTCDay() === 0;

  const counts = {};
  for (const r of rows) {
    const overdue = r.ppm_status === 'OVERDUE';
    const key = overdue
      ? `PPM_OVERDUE:EQ${r.equipment_id}:${r.due}:ST${r.staff_id}${sunday ? ':WEEK:' + today : ''}`   // first day, then Sundays
      : `PPM_DUE:EQ${r.equipment_id}:${r.due}:ST${r.staff_id}`;
    if (overdue && !sunday) {   // already told on an earlier day (any key format) -> wait for Sunday's reminder
      const seen = await query(`SELECT COUNT(*) AS n FROM notification_log WHERE dedupe_key LIKE :k`, { k: `PPM_OVERDUE:EQ${r.equipment_id}:${r.due}:ST${r.staff_id}%` });
      if (seen[0] && Number(seen[0].n) > 0) { counts.ALREADY_TOLD = (counts.ALREADY_TOLD || 0) + 1; continue; }
    }
    const res = await notifyStaff(r.staff_id, {
      eventType: overdue ? 'PPM_OVERDUE' : 'PPM_DUE',
      title: overdue ? 'PPM overdue' : 'PPM due soon',
      body: `${r.item_name}${r.asset_tag ? ' (' + r.asset_tag + ')' : ''} · ${r.clinic_name} · ${overdue ? 'was due ' + r.due : 'due ' + r.due}`,
      url: `/#/inventory/${r.clinic_id}`,
      dedupeKey: key,
      equipmentId: r.equipment_id,
    });
    counts[res.status] = (counts[res.status] || 0) + 1;
  }
  // Instruments with no quantity / machines with no Serial #: tell the responsible staff member
  // (first time, then each Sunday until fixed)
  const noQty = await query(`
    SELECT e.responsible_staff_id AS staff_id, e.clinic_id,
           SUM(CASE WHEN i.item_kind = 'INSTRUMENT' THEN 1 ELSE 0 END) AS n,
           SUM(CASE WHEN i.item_kind = 'MACHINE' THEN 1 ELSE 0 END) AS m,
           LISTAGG(e.equipment_id, ',') WITHIN GROUP (ORDER BY e.equipment_id) AS ids
      FROM equipment_ppm e JOIN equipment_catalog i ON i.item_id = e.item_id
     WHERE e.condition_status <> 'RETIRED' AND e.responsible_staff_id IS NOT NULL
       AND ((i.item_kind = 'INSTRUMENT' AND NVL(e.quantity, 0) = 0) OR (i.item_kind = 'MACHINE' AND TRIM(e.serial_no) IS NULL))
     GROUP BY e.responsible_staff_id, e.clinic_id`);
  for (const q of noQty) {
    const n = Number(q.n), m = Number(q.m);
    const parts = [];
    if (n) parts.push(`${n} instrument${n === 1 ? ' has' : 's have'} no quantity`);
    if (m) parts.push(`${m} machine${m === 1 ? ' has' : 's have'} no Serial #`);
    const res = await notifyStaff(q.staff_id, {
      eventType: 'LOW_STOCK',
      title: 'Complete your clinic inventory',
      body: `Clinic ${q.clinic_id}: ${parts.join(' and ')}. Open Clinic inventory and tap Update to fill them in.`,
      url: `/#/inventory/${q.clinic_id}`,
      dedupeKey: `QTY_MISSING:ST${q.staff_id}:CL${q.clinic_id}:${String(q.ids).slice(0, 120)}${sunday ? ':WEEK:' + today : ''}`,
    });
    counts['QTY_' + res.status] = (counts['QTY_' + res.status] || 0) + 1;
  }

  // CIC: one weekly summary (Sunday 07:30), not one message per machine
  let summary = null;
  if (sunday) {
    const st = await query(`
      SELECT ppm_status, LISTAGG(DISTINCT clinic_id, ', ') WITHIN GROUP (ORDER BY clinic_id) AS clinics, COUNT(*) AS n
        FROM v_equipment_status WHERE ppm_status IN ('OVERDUE', 'DUE_7_DAYS') AND condition_status = 'IN_SERVICE'
       GROUP BY ppm_status`);
    const by = Object.fromEntries(st.map((x) => [x.ppm_status, x]));
    const parts = [];
    if (by.OVERDUE) parts.push(`${by.OVERDUE.n} overdue (Clinic ${by.OVERDUE.clinics})`);
    if (by.DUE_7_DAYS) parts.push(`${by.DUE_7_DAYS.n} due this week (Clinic ${by.DUE_7_DAYS.clinics})`);
    if (parts.length) summary = await notifyCic({ eventType: 'PPM_OVERDUE', title: 'Weekly PPM summary', body: parts.join(' · '), url: '/#/inventory', dedupeKey: `PPM_SUMMARY:${today}` });
  }
  console.log('ppm-check', today, rows.length, 'recipients', counts, summary ? 'summary sent' : '');
  return { statusCode: 200, body: JSON.stringify({ today, recipients: rows.length, counts }) };
};
