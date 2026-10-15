// GET /api/reference — public lists the pages need: clinics, doctors (with level colours),
// staff names, assignment types, session times. Cached 5 minutes at the CDN.
const { query } = require('./lib/db');
const { handler, cachedJson } = require('./lib/http');

exports.handler = handler(['GET'], async () => {
  const [clinics, categories, doctors, staff, types, sessions] = await Promise.all([
    query(`SELECT clinic_id, clinic_name, clinic_type FROM clinics WHERE is_active = 'Y' ORDER BY clinic_id`),
    query(`SELECT category_code, category_name, chip_bg, chip_fg, patient_load FROM doctor_categories ORDER BY sort_order`),
    query(`SELECT doctor_id, display_name, category_code, max_assistants FROM doctors WHERE is_active = 'Y' ORDER BY display_name`),
    query(`SELECT staff_id, display_name, staff_type, home_clinic_id, employment_status FROM staff
            WHERE employment_status <> 'INACTIVE' AND app_role <> 'ADMIN' ORDER BY display_name`),
    query(`SELECT type_code, type_name, category, needs_doctor, legend_color, sort_order FROM assignment_types
            WHERE is_active = 'Y' ORDER BY sort_order`),
    query(`SELECT session_code, starts_at, ends_at FROM session_times ORDER BY session_code`),
  ]);
  return cachedJson({ clinics, categories, doctors, staff, types, sessions }, 300);
});
