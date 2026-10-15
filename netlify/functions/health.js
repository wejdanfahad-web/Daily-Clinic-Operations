// GET /api/health — confirms Netlify can reach the database. Open it in a browser after setup.
const { query } = require('./lib/db');
const { handler, json, riyadhToday } = require('./lib/http');

exports.handler = handler(['GET'], async () => {
  const rows = await query(`
    SELECT (SELECT COUNT(*) FROM staff)   AS staff,
           (SELECT COUNT(*) FROM doctors) AS doctors,
           (SELECT COUNT(*) FROM clinics WHERE is_active = 'Y') AS clinics,
           (SELECT COUNT(*) FROM assignment_logs) AS assignment_rows,
           TO_CHAR(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS db_time_riyadh
      FROM dual`);
  return json(200, { ok: true, today: riyadhToday(), database: rows[0] });
});
