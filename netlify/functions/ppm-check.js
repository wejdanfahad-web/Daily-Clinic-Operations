// Scheduled daily at 07:30 Riyadh (see netlify.toml). First delivers messages held overnight
// (nothing is sent between 16:30 and 07:30), then the PPM alerts.
// Sends push alerts for equipment whose PPM is due within 7 days (once) or overdue (every day),
// to the clinic's staff and supervisors. Running daily also keeps the free database from
// being auto-stopped for inactivity.
const { query } = require('./lib/db');
const { notifyStaff, flushPending } = require('./lib/push');
const { riyadhToday } = require('./lib/http');

exports.handler = async () => {
  const flushed = await flushPending();
  console.log('flushed held notifications', flushed);
  const today = riyadhToday();
  const rows = await query(`
    SELECT equipment_id, clinic_id, clinic_name, item_name, asset_tag,
           TO_CHAR(ppm_due_date, 'YYYY-MM-DD') AS due, days_remaining, ppm_status, staff_id
      FROM v_ppm_alert_recipients`, {}, { limit: 5000 });

  const counts = {};
  for (const r of rows) {
    const overdue = r.ppm_status === 'OVERDUE';
    const key = overdue ? `PPM_OVERDUE:EQ${r.equipment_id}:${r.due}:ST${r.staff_id}:${today}` : `PPM_DUE:EQ${r.equipment_id}:${r.due}:ST${r.staff_id}`;
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
  console.log('ppm-check', today, rows.length, 'recipients', counts);
  return { statusCode: 200, body: JSON.stringify({ today, recipients: rows.length, counts }) };
};
