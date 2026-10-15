-- =============================================================================
-- ENDO Clinic System — 03_views.sql
-- Run as: ENDO (after 02)
-- Every "live" number in the app is DERIVED from the permanent log, so the
-- dashboard can never drift out of sync with the history.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Full audit trail, human-readable (every row ever written, oldest first)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_assignment_history AS
SELECT l.log_id,
       l.assignment_group_id,
       l.action,
       l.supersedes_log_id,
       l.work_date,
       l.session_code,
       l.staff_id,
       s.display_name                                   AS staff_name,
       l.doctor_id,
       d.display_name                                   AS doctor_name,
       d.category_code                                  AS doctor_category,
       l.clinic_id,
       l.type_code,
       t.type_name,
       t.category,
       l.is_surgery,
       l.notes,
       l.source,
       l.recorded_by,
       l.recorded_at,
       CAST(l.recorded_at AT TIME ZONE 'Asia/Riyadh' AS TIMESTAMP) AS recorded_at_riyadh
  FROM assignment_logs  l
  JOIN staff            s ON s.staff_id  = l.staff_id
  JOIN assignment_types t ON t.type_code = l.type_code
  LEFT JOIN doctors     d ON d.doctor_id = l.doctor_id;

-- -----------------------------------------------------------------------------
-- What is in force right now: not cancelled and not replaced by a later row
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_assignments_current AS
SELECT h.*
  FROM v_assignment_history h
 WHERE h.action <> 'CANCEL'
   AND NOT EXISTS (SELECT 1
                     FROM assignment_logs nxt
                    WHERE nxt.supersedes_log_id = h.log_id);

-- -----------------------------------------------------------------------------
-- One row per staff member per session in which a rotation duty happened.
--   * typed rotations: SURGERY, VITALS, INSTRUMENTS, CRASH_CART
--   * DOUBLE_CLINIC: 2+ different clinics in the same session (derived)
-- A two-doctor surgery is two log rows but counts as ONE surgery.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_rotation_events AS
SELECT c.staff_id, t.rotation_code, c.work_date, c.session_code
  FROM v_assignments_current c
  JOIN assignment_types      t ON t.type_code = c.type_code
 WHERE t.rotation_code IS NOT NULL
 GROUP BY c.staff_id, t.rotation_code, c.work_date, c.session_code
UNION ALL
SELECT c.staff_id, CAST('DOUBLE_CLINIC' AS VARCHAR2(20)), c.work_date, c.session_code
  FROM v_assignments_current c
 WHERE c.category = 'CLINICAL'
 GROUP BY c.staff_id, c.work_date, c.session_code
HAVING COUNT(DISTINCT c.clinic_id) >= 2;

-- -----------------------------------------------------------------------------
-- Rotation queue for every rotation.
-- Priority: lowest total count → oldest last date (never = first) → name A–Z
-- (the A–Z tie-break matches how the current Excel tracker orders ties).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_rotation_queue AS
WITH ev AS (
  SELECT e.staff_id, e.rotation_code,
         COUNT(*)         AS logged_count,
         MAX(e.work_date) AS logged_last_date
    FROM v_rotation_events e
    LEFT JOIN rotation_baseline b
           ON b.staff_id = e.staff_id AND b.rotation_code = e.rotation_code
   WHERE b.as_of_date IS NULL OR e.work_date > b.as_of_date   -- no double counting
   GROUP BY e.staff_id, e.rotation_code
),
base AS (
  SELECT s.staff_id,
         s.display_name                                    AS staff_name,
         s.home_clinic_id,
         s.employment_status,
         r.rotation_code,
         r.rotation_name,
         NVL(b.opening_count, 0) + NVL(ev.logged_count, 0) AS total_count,
         CASE
           WHEN b.opening_last_date IS NULL THEN ev.logged_last_date
           WHEN ev.logged_last_date IS NULL THEN b.opening_last_date
           ELSE GREATEST(b.opening_last_date, ev.logged_last_date)
         END                                               AS last_assigned_date,
         CASE
           WHEN s.employment_status = 'ACTIVE' AND NVL(el.is_eligible, 'Y') = 'Y'
                AND (r.eligible_staff_type IS NULL OR r.eligible_staff_type = s.staff_type) THEN 'Y'
           ELSE 'N'
         END                                               AS is_eligible,
         CASE
           WHEN s.employment_status <> 'ACTIVE' THEN s.employment_status
           WHEN el.is_eligible = 'N'            THEN NVL(el.reason, 'EXCLUDED')
           WHEN r.eligible_staff_type IS NOT NULL AND r.eligible_staff_type <> s.staff_type
                                                THEN 'Not a ' || LOWER(REPLACE(r.eligible_staff_type, '_', ' '))
         END                                               AS ineligible_reason
    FROM staff s
   CROSS JOIN rotations r
    LEFT JOIN rotation_baseline b
           ON b.staff_id = s.staff_id AND b.rotation_code = r.rotation_code
    LEFT JOIN ev
           ON ev.staff_id = s.staff_id AND ev.rotation_code = r.rotation_code
    LEFT JOIN staff_rotation_eligibility el
           ON el.staff_id = s.staff_id AND el.rotation_code = r.rotation_code
   WHERE r.is_active = 'Y'
     AND s.employment_status <> 'INACTIVE'
)
SELECT base.*,
       CASE WHEN is_eligible = 'Y' THEN
         ROW_NUMBER() OVER (PARTITION BY rotation_code, is_eligible
                            ORDER BY total_count ASC,
                                     last_assigned_date ASC NULLS FIRST,
                                     UPPER(staff_name) ASC)
       END AS queue_position
  FROM base;

-- -----------------------------------------------------------------------------
-- SURGERY_QUEUE — the surgery rotation, next-in-line first.
-- (A view, not a table: a stored counter can drift from the log; this cannot.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW surgery_queue AS
SELECT staff_id,
       staff_name,
       home_clinic_id,
       total_count        AS total_surgery_count,
       last_assigned_date AS last_assigned_surgery_date,
       is_eligible,
       ineligible_reason,
       queue_position,
       CASE WHEN queue_position = 1 THEN 'Y' ELSE 'N' END AS is_next_in_line
  FROM v_rotation_queue
 WHERE rotation_code = 'SURGERY';

-- -----------------------------------------------------------------------------
-- Equipment with PPM status, using today's date in Riyadh
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_equipment_status AS
WITH d AS (
  SELECT TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Riyadh' AS DATE)) AS today FROM dual
)
SELECT e.equipment_id,
       e.clinic_id,
       c.clinic_name,
       i.item_id,
       i.item_name,
       i.item_kind,
       i.requires_ppm,
       e.asset_tag,
       e.serial_no,
       e.quantity,
       e.par_level,
       CASE WHEN e.par_level IS NOT NULL AND e.quantity < e.par_level THEN 'Y' ELSE 'N' END AS is_below_par,
       e.condition_status,
       e.last_ppm_date,
       e.ppm_due_date,
       CASE WHEN e.ppm_due_date IS NOT NULL THEN e.ppm_due_date - d.today END AS days_remaining,
       CASE
         WHEN i.requires_ppm = 'N'     THEN 'NOT_REQUIRED'
         WHEN e.ppm_due_date IS NULL   THEN 'MISSING_DATE'
         WHEN e.ppm_due_date <  d.today      THEN 'OVERDUE'
         WHEN e.ppm_due_date <= d.today + 7  THEN 'DUE_7_DAYS'
         WHEN e.ppm_due_date <= d.today + 30 THEN 'DUE_30_DAYS'
         ELSE 'OK'
       END AS ppm_status,
       e.last_verified_by,
       vs.display_name AS last_verified_by_name,
       e.last_verified_at,
       e.notes
  FROM equipment_ppm     e
  JOIN equipment_catalog i ON i.item_id   = e.item_id
  JOIN clinics           c ON c.clinic_id = e.clinic_id
  LEFT JOIN staff       vs ON vs.staff_id = e.last_verified_by
 CROSS JOIN d
 WHERE e.condition_status <> 'RETIRED';

-- -----------------------------------------------------------------------------
-- Who should hear about each expiring / expired PPM (≤ 7 days left).
-- Recipients = active staff whose home clinic holds the item + supervisors.
-- Staff with no device signed up for push notifications are KEPT in the result
-- with can_notify = 'N' and skip_reason = 'NO_DEVICE', so the nightly job logs
-- the skip instead of failing or silently losing it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ppm_alert_recipients AS
SELECT p.equipment_id,
       p.clinic_id,
       p.clinic_name,
       p.item_name,
       p.asset_tag,
       p.ppm_due_date,
       p.days_remaining,
       p.ppm_status,
       s.staff_id,
       s.display_name AS staff_name,
       CASE WHEN s.home_clinic_id = p.clinic_id THEN 'CLINIC_STAFF' ELSE 'SUPERVISOR' END AS recipient_role,
       (SELECT COUNT(*) FROM push_subscriptions ps
         WHERE ps.staff_id = s.staff_id AND ps.is_active = 'Y')                     AS active_devices,
       CASE WHEN EXISTS (SELECT 1 FROM push_subscriptions ps
                          WHERE ps.staff_id = s.staff_id AND ps.is_active = 'Y')
            THEN 'Y' ELSE 'N' END                                                     AS can_notify,
       CASE WHEN NOT EXISTS (SELECT 1 FROM push_subscriptions ps
                              WHERE ps.staff_id = s.staff_id AND ps.is_active = 'Y')
            THEN 'NO_DEVICE' END                                                      AS skip_reason
  FROM v_equipment_status p
  JOIN staff s
    ON (s.home_clinic_id = p.clinic_id OR s.is_supervisor = 'Y')
   AND s.employment_status = 'ACTIVE'
 WHERE p.ppm_status IN ('OVERDUE', 'DUE_7_DAYS')
   AND p.condition_status = 'IN_SERVICE';

-- -----------------------------------------------------------------------------
-- Monthly roll-up used by the 1st-of-month report job
-- (sessions per staff member per assignment type, from current assignments)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_monthly_assignment_summary AS
SELECT TRUNC(c.work_date, 'MM')                              AS report_month,
       c.staff_id,
       c.staff_name,
       c.category,
       c.type_code,
       COUNT(DISTINCT TO_CHAR(c.work_date, 'YYYYMMDD') || c.session_code) AS sessions,
       COUNT(DISTINCT c.assignment_group_id)                 AS bookings
  FROM v_assignments_current c
 GROUP BY TRUNC(c.work_date, 'MM'), c.staff_id, c.staff_name, c.category, c.type_code;

-- -----------------------------------------------------------------------------
-- Who is "In charge" right now (Riyadh time) → gets temporary assignment rights
-- for that session only. Derived from the log on every request, never stored,
-- so cancelling the In-charge assignment removes the access immediately.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_in_charge AS
WITH now_riyadh AS (
  SELECT CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Riyadh' AS DATE) AS ts FROM dual
)
SELECT c.staff_id,
       c.staff_name,
       c.work_date,
       c.session_code,
       st.starts_at,
       st.ends_at
  FROM v_assignments_current c
  JOIN session_times st ON st.session_code = c.session_code
 CROSS JOIN now_riyadh n
 WHERE c.type_code = 'IN_CHARGE'
   AND c.work_date = TRUNC(n.ts)
   AND TO_CHAR(n.ts, 'HH24:MI') >= st.starts_at
   AND TO_CHAR(n.ts, 'HH24:MI') <  st.ends_at;

-- -----------------------------------------------------------------------------
-- Planner checks for one day (bind :work_date). Two kinds of problem:
--   MISSING_DOCTOR  : timetable says a doctor has clinic, nobody is assigned to her
--   DOUBLE_DOCTOR   : a doctor has more assistants than she's allowed (normally 1)
-- Runs against the current (published) assignments; the API runs the same
-- logic on the draft JSON before publishing.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_planner_expected AS
SELECT d.work_date, t.session_code, t.doctor_id, t.clinic_id, s.semester_id
  FROM semesters s
  JOIN doctor_timetable t ON t.semester_id = s.semester_id
  JOIN (SELECT DISTINCT work_date FROM assignment_logs) d
    ON d.work_date BETWEEN s.starts_on AND s.ends_on
   AND t.weekday = MOD(d.work_date - DATE '2023-01-01', 7)   -- 1 Jan 2023 was a Sunday → Sun=0 … Thu=4 (NLS-independent)
 WHERE s.confirmed_at IS NOT NULL;

CREATE OR REPLACE VIEW v_planner_issues AS
SELECT e.work_date, e.session_code, 'MISSING_DOCTOR' AS issue, e.doctor_id, e.clinic_id,
       CAST(NULL AS VARCHAR2(400)) AS staff_names
  FROM v_planner_expected e
 WHERE NOT EXISTS (SELECT 1 FROM v_assignments_current c
                    WHERE c.work_date = e.work_date AND c.session_code = e.session_code
                      AND c.doctor_id = e.doctor_id)
UNION ALL
SELECT c.work_date, c.session_code, 'DOUBLE_DOCTOR', c.doctor_id, NULL,
       LISTAGG(DISTINCT c.staff_name, ' & ') WITHIN GROUP (ORDER BY c.staff_name)
  FROM v_assignments_current c
  JOIN doctors d ON d.doctor_id = c.doctor_id
 GROUP BY c.work_date, c.session_code, c.doctor_id
HAVING COUNT(DISTINCT c.staff_id) > MAX(d.max_assistants);   -- Prof. Ahmed may have 2

-- -----------------------------------------------------------------------------
-- Quarterly workload & rest per staff member (feeds the workload dashboard)
--   load_per_session = workload points / sessions she was available
--   Clinic points = sum of each doctor's patient_load (by level: BD1/PG1 0.5,
--   PG2/BD2 0.75, PG3/PG4/BD3/FC/SP 1), so a BD3 clinic = a double BD1 clinic.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_staff_workload_quarter AS
WITH sess AS (
  SELECT c.staff_id, c.staff_name, TRUNC(c.work_date, 'Q') AS quarter_start, c.work_date, c.session_code,
         MAX(CASE WHEN c.category = 'UNAVAILABLE' THEN c.type_code END)               AS unavailable_type,
         COUNT(DISTINCT CASE WHEN c.category = 'CLINICAL' THEN c.clinic_id END)      AS clinics,
         SUM(CASE WHEN c.category = 'CLINICAL' THEN NVL(dc.patient_load, 1) ELSE 0 END) AS clinic_points,
         SUM(CASE WHEN c.category IN ('SURGERY', 'DUTY') THEN t.workload_points ELSE 0 END) AS other_points
    FROM v_assignments_current c
    JOIN assignment_types t ON t.type_code = c.type_code
    LEFT JOIN doctor_categories dc ON dc.category_code = c.doctor_category
   GROUP BY c.staff_id, c.staff_name, TRUNC(c.work_date, 'Q'), c.work_date, c.session_code
)
SELECT staff_id, staff_name, quarter_start,
       SUM(CASE WHEN unavailable_type IS NULL THEN 1 ELSE 0 END)                              AS sessions_available,
       SUM(CASE WHEN unavailable_type IS NULL
                THEN clinic_points + other_points
                ELSE 0 END)                                                                    AS workload_points,
       ROUND(SUM(CASE WHEN unavailable_type IS NULL
                      THEN clinic_points + other_points
                      ELSE 0 END)
             / NULLIF(SUM(CASE WHEN unavailable_type IS NULL THEN 1 ELSE 0 END), 0), 2)        AS load_per_session,
       SUM(CASE WHEN clinics >= 2 AND unavailable_type IS NULL THEN 1 ELSE 0 END)               AS multi_clinic_sessions,
       SUM(CASE WHEN unavailable_type = 'ON_LEAVE' THEN 0.5 ELSE 0 END)                         AS annual_leave_days,
       SUM(CASE WHEN unavailable_type = 'EXCUSE' THEN 1 ELSE 0 END)                             AS excuses,
       SUM(CASE WHEN unavailable_type = 'SICK_LEAVE' THEN 1 ELSE 0 END)                         AS sick_sessions,
       SUM(CASE WHEN unavailable_type = 'APPOINTMENT' THEN 1 ELSE 0 END)                        AS appointments
  FROM sess
 GROUP BY staff_id, staff_name, quarter_start;

-- -----------------------------------------------------------------------------
-- V_CHECKLIST_COMPLIANCE — monthly % of active clinics whose sheet the CIC has
-- ticked, per checklist type (feeds the Compliance page and the monthly report).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_checklist_compliance AS
SELECT k.checklist_type,
       m.period_start,
       COUNT(c.clinic_id)                                              AS clinics,
       SUM(CASE WHEN ch.is_submitted = 'Y' THEN 1 ELSE 0 END)          AS checked,
       ROUND(100 * SUM(CASE WHEN ch.is_submitted = 'Y' THEN 1 ELSE 0 END) / NULLIF(COUNT(c.clinic_id), 0)) AS pct
  FROM (SELECT 'EQUIPMENT' AS checklist_type FROM dual UNION ALL SELECT 'DISINFECTION' FROM dual) k
 CROSS JOIN (SELECT DISTINCT period_start FROM clinic_checklists WHERE period_type = 'MONTH') m
 CROSS JOIN clinics c
  LEFT JOIN clinic_checklists ch
         ON ch.clinic_id = c.clinic_id AND ch.checklist_type = k.checklist_type
        AND ch.period_type = 'MONTH' AND ch.period_start = m.period_start
 WHERE c.is_active = 'Y'
 GROUP BY k.checklist_type, m.period_start;

-- -----------------------------------------------------------------------------
-- V_APPRAISAL_STATUS — every staff × step for a year, with overdue flag.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_appraisal_status AS
SELECT s.staff_id, s.display_name AS staff_name, st.appraisal_year, st.step_no, st.step_name, st.due_date,
       NVL(a.is_done, 'N') AS is_done, a.done_on, a.marked_at,
       CASE WHEN NVL(a.is_done, 'N') = 'Y' THEN 'DONE'
            WHEN st.due_date < TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Riyadh' AS DATE)) THEN 'OVERDUE'
            ELSE 'PENDING' END AS status
  FROM staff s
 CROSS JOIN appraisal_steps st
  LEFT JOIN staff_appraisals a
         ON a.staff_id = s.staff_id AND a.appraisal_year = st.appraisal_year AND a.step_no = st.step_no
 WHERE s.employment_status <> 'INACTIVE' AND s.app_role <> 'ADMIN';

