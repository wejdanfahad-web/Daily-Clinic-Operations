// GET /api/queues — rotation queues (surgery, vitals, instruments, crash cart...) with who is next.
// Signed-in staff and the CIC.
const { query } = require('./lib/db');
const { handler, json, requireUser } = require('./lib/http');

exports.handler = handler(['GET'], async (event) => {
  requireUser(event);
  const rows = await query(`
    SELECT rotation_code, rotation_name, staff_id, staff_name, total_count,
           TO_CHAR(last_assigned_date, 'YYYY-MM-DD') AS last_assigned_date,
           is_eligible, ineligible_reason, queue_position
      FROM v_rotation_queue
     ORDER BY rotation_code, is_eligible DESC, queue_position NULLS LAST, staff_name`);
  return json(200, { queues: rows });
});
