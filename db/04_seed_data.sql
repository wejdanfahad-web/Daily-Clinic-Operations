-- =============================================================================
-- ENDO Clinic System — 04_seed_data.sql
-- Run as: ENDO (after 03)
-- Generated from: Weekly_Assignments_ENDO_2026 (2).xlsx + ENDO_STAFF_Rotation_Tracker_2026 Dashboard.csv
-- Phone numbers are intentionally NULL. Doctor categories are set only where confirmed;
-- the sheet's colours are not applied consistently enough to infer the rest.
-- =============================================================================
SET DEFINE OFF

-- ---------------------------------------------------------------- CLINICS 1–19

INSERT INTO clinics (clinic_id, clinic_name, is_active, notes) VALUES (1, 'Clinic 1', 'N', 'Not used on current schedules or checklist tracker - confirm before activating');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (2, 'Clinic 2');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (3, 'Clinic 3');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (4, 'Clinic 4');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (5, 'Clinic 5');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (6, 'Clinic 6');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (7, 'Clinic 7');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (8, 'Clinic 8');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (9, 'Clinic 9');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (10, 'Clinic 10');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (11, 'Clinic 11');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (12, 'Clinic 12');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (13, 'Clinic 13');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (14, 'Clinic 14');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (15, 'Clinic 15');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (16, 'Clinic 16');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (17, 'Clinic 17');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (18, 'Clinic 18');
INSERT INTO clinics (clinic_id, clinic_name) VALUES (19, 'Clinic 19');

-- ---------------------------------------------------------------- STAFF (home clinic = CI column)
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Rhoda', 2);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Saada', 3);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Nawal', 4);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Victoria', 5);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Raniya', 6);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Sharifah', 7);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Waad', 8);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Haifa', 9);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Deema', 10);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Aisha', 11);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Eman', 12);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Shouq', 13);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Muluk', 14);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Tahani', 15);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Zahraa', 16);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Leena', 17);
INSERT INTO staff (display_name, home_clinic_id) VALUES ('Abdulmohsen', 18);
INSERT INTO staff (display_name, full_name, job_title, staff_type, is_supervisor, app_role) VALUES ('Wejdan', 'Wejdan Almuzaini', 'CIC / Head Nurse', 'CIC', 'Y', 'ADMIN');
-- Staff nurses (crash cart rotation); everyone else is a dental assistant (instruments rotation)
UPDATE staff SET staff_type = 'STAFF_NURSE', job_title = 'Staff Nurse' WHERE display_name IN ('Victoria', 'Eman', 'Abdulmohsen');

-- ---------------------------------------------------------------- DOCTOR CATEGORIES (colour-coded)
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('PG1', 'Postgraduate year 1', '#E6F1FC', '#12355E', 10);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('PG2', 'Postgraduate year 2', '#CDE2F8', '#12355E', 20);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('PG3', 'Postgraduate year 3', '#AFCEF1', '#0E2C50', 30);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('PG4', 'Postgraduate year 4', '#8DB8EA', '#0B2442', 40);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('BD1', 'Board year 1', '#E2F4EB', '#124434', 50);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('BD2', 'Board year 2', '#C3E6D4', '#124434', 60);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('BD3', 'Board year 3', '#9ED3B9', '#0C362A', 70);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('FC',  'Faculty',     '#F4E3C4', '#5E3D06', 80);
INSERT INTO doctor_categories (category_code, category_name, chip_bg, chip_fg, sort_order) VALUES ('SP',  'Specialist',  '#E4EAC5', '#434B0D', 90);

-- ---------------------------------------------------------------- DOCTORS
-- Canonical spellings. Merged variants found in the sheets:
--   'Dr. Khaled Almane' / 'Dr. Khalid Almane' -> 'Dr. Khaled Alamnei' (spelling confirmed by CIC)   'Dr. Khaled Almadhi' -> 'Dr. Khalid Almadhi'
--   'Prof. Alobaida'    -> 'Prof. Obaida'        'Dr. Riaydh'         -> 'Dr. Riyadh'
--   'Dr. M. Tamimi'     -> 'Dr. Mohammed T'  (assumed same person - confirm)
--   'Dr. Noura' (no initial)  -> 'Dr. Noura H' (PG4, confirmed by CIC)
-- To confirm: 'Prof. Fahd' (summer) = 'Prof. Fahd S' or 'Prof. Fahad J'?
--   'Dr. A. Alriyahi'         -> 'Dr. Abdullah R' (same person, confirmed by CIC)
INSERT INTO doctors (display_name, title) VALUES ('Dr. Abdulaziz', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Abdullah B', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Abdullah Q', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Abdullah S', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Abdulrahman K', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Ahmed Z', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Alaa', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Aljohara', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Anas', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Asmaa', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Basmah', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Ghaida', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Heba', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Hussain', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Hussam', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Ibrahim', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Khalid Almadhi', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Khaled Alamnei', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Maha', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Marwa', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Mazen', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Moayad', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Mohammed T', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Muath', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Muhannad', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Nada', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Noura A', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Noura K', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Noura R', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Rafal', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Reema', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Riyadh', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Talal', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Yara', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Yazeed', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Ziyad', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Ahmed', 'PROF');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Fahad J', 'PROF');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Fahd S', 'PROF');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Obaida', 'PROF');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Sara', 'PROF');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Sulaiman', 'PROF');
-- Seen only on the summer schedule - deactivate any who have left
INSERT INTO doctors (display_name, title) VALUES ('Dr. Abdullah R', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Nouf', 'DR');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Alhadlaq', 'PROF');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Aljarbou', 'PROF');
INSERT INTO doctors (display_name, title) VALUES ('Prof. Alsubait', 'PROF');

-- Doctor categories as confirmed by the CIC (15 Oct 2026)
UPDATE doctors SET category_code = 'FC' WHERE title = 'PROF' OR display_name IN ('Dr. Maha');
-- Only doctor allowed two assistants in one session (CIC rule)
UPDATE doctors SET max_assistants = 2 WHERE display_name = 'Prof. Ahmed';
UPDATE doctors SET category_code = 'SP' WHERE display_name IN ('Dr. Alaa', 'Dr. Nouf', 'Dr. Mohammed T', 'Dr. Abdullah S', 'Dr. Ahmed Z');
INSERT INTO doctors (display_name, title) VALUES ('Dr. Noura H', 'DR');   -- written as plain 'Dr. Noura' on the weekly sheet
UPDATE doctors SET category_code = 'PG4' WHERE display_name IN ('Dr. Reema', 'Dr. Noura H', 'Dr. Aljohara', 'Dr. Basmah');
UPDATE doctors SET category_code = 'BD3' WHERE display_name IN ('Dr. Yazeed', 'Dr. Talal', 'Dr. Abdulrahman K', 'Dr. Hussain');
UPDATE doctors SET category_code = 'BD2' WHERE display_name IN ('Dr. Ghaida', 'Dr. Abdulaziz', 'Dr. Muhannad', 'Dr. Noura R');
UPDATE doctors SET category_code = 'PG3' WHERE display_name IN ('Dr. Yara', 'Dr. Rafal');
UPDATE doctors SET category_code = 'PG2' WHERE display_name IN ('Dr. Noura K', 'Dr. Noura A', 'Dr. Marwa');
UPDATE doctors SET category_code = 'PG1' WHERE display_name IN ('Dr. Heba', 'Dr. Moayad', 'Dr. Asmaa');
UPDATE doctors SET category_code = 'BD1' WHERE display_name IN ('Dr. Nada', 'Dr. Abdullah B');
UPDATE doctors SET category_code = 'FC' WHERE display_name IN ('Dr. Abdullah R', 'Dr. Hussam', 'Prof. Fahad J', 'Dr. Mazen', 'Dr. Muath',
  'Prof. Obaida', 'Dr. Khaled Alamnei', 'Prof. Ahmed', 'Dr. Riyadh', 'Dr. Abdullah Q', 'Dr. Anas', 'Prof. Fahd S', 'Dr. Maha',
  'Dr. Khalid Almadhi', 'Dr. Ibrahim', 'Prof. Sara', 'Dr. Ziyad', 'Prof. Sulaiman');

-- ---------------------------------------------------------------- SESSION TIMES (Riyadh)
INSERT INTO session_times (session_code, starts_at, ends_at) VALUES ('AM', '09:00', '13:00');
INSERT INTO session_times (session_code, starts_at, ends_at) VALUES ('PM', '13:00', '16:30');

-- ---------------------------------------------------------------- ROTATIONS
INSERT INTO rotations (rotation_code, rotation_name, description, sort_order) VALUES ('SURGERY',       'Surgery',        'Surgery case assignments (yellow on the weekly sheet)', 10);
INSERT INTO rotations (rotation_code, rotation_name, description, sort_order) VALUES ('DOUBLE_CLINIC', 'Double clinic',  'Covering two clinics in the same session (derived automatically)', 20);
INSERT INTO rotations (rotation_code, rotation_name, description, sort_order) VALUES ('VITALS',        'Vitals',         'Vital signs station', 30);
INSERT INTO rotations (rotation_code, rotation_name, description, eligible_staff_type, slots_per_day, skip_if_vitals, sort_order) VALUES ('INSTRUMENTS', 'Instruments', 'Bring instruments from CSSD - 1 dental assistant for AM + 1 for PM; never someone on Vitals in that same session', 'DENTAL_ASSISTANT', 2, 'Y', 40);
INSERT INTO rotations (rotation_code, rotation_name, description, eligible_staff_type, slots_per_day, skip_if_vitals, sort_order) VALUES ('CRASH_CART', 'Crash cart check', 'Crash cart check before 8:30 - 2 staff nurses per day (CIC fills a gap); Vitals allowed', 'STAFF_NURSE', 2, 'N', 50);

-- ---------------------------------------------------------------- ASSIGNMENT TYPES (legend colours from the sheet)

INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('CLINIC', 'Clinic (with doctor)', 'CLINICAL', 'Y', NULL, NULL, 10);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('PEDO', 'PEDO clinic', 'CLINICAL', 'Y', NULL, '#B4A7D6', 15);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('SURGERY', 'Surgery', 'SURGERY', 'Y', 'SURGERY', '#FFFF00', 20);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('VITALS', 'Vitals', 'DUTY', 'N', 'VITALS', '#EAE3F8', 30);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('INSTRUMENTS', 'Instruments duty', 'DUTY', 'N', 'INSTRUMENTS', NULL, 31);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('CRASH_CART', 'Crash cart check', 'DUTY', 'N', 'CRASH_CART', NULL, 32);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('FLOATER', 'Floater (supports all running clinics)', 'DUTY', 'N', NULL, '#EAE3F8', 40);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('SUPPORT_DUTY', 'Support deployed to other clinics/specialties', 'DUTY', 'N', NULL, '#EAE3F8', 41);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, notify_on_assign, sort_order) VALUES ('IN_CHARGE', 'In charge (team leader duties)', 'DUTY', 'N', NULL, '#2447B8', 'Y', 42);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('STORE', 'Store', 'DUTY', 'N', NULL, '#EAE3F8', 50);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('KPI', 'KPI', 'DUTY', 'N', NULL, '#EAE3F8', 51);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('SAP', 'SAP', 'DUTY', 'N', NULL, '#EAE3F8', 52);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('SCREENING', 'Screening', 'DUTY', 'N', NULL, '#EAE3F8', 53);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('SHADOW_AUDIT', 'Shadow file audit', 'DUTY', 'N', NULL, '#EAE3F8', 54);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('BLUE_LINING', 'Blue lining', 'DUTY', 'N', NULL, '#EAE3F8', 55);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('CLINIC_ORG', 'Clinic organizing', 'DUTY', 'N', NULL, '#EAE3F8', 56);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('SURFACE_CLEAN', 'Surfaces cleaning', 'DUTY', 'N', NULL, '#EAE3F8', 57);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('MSDS', 'MSDS', 'DUTY', 'N', NULL, '#EAE3F8', 58);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('STOCKS_DUTY', 'Stocks duty', 'DUTY', 'N', NULL, '#EAE3F8', 58);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('COURSE_WORK', 'Course work', 'DUTY', 'N', NULL, '#EAE3F8', 59);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('OTHER', 'Other', 'DUTY', 'N', NULL, '#FFFFD5', 60);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('ON_LEAVE', 'On leave', 'UNAVAILABLE', 'N', NULL, '#F7DDE1', 80);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('SICK_LEAVE', 'Sick leave (SL)', 'UNAVAILABLE', 'N', NULL, '#EAE3F8', 81);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('EXCUSE', 'Excuse', 'UNAVAILABLE', 'N', NULL, '#F7DDE1', 82);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('APPOINTMENT', 'Appointment', 'UNAVAILABLE', 'N', NULL, '#EAE3F8', 83);
INSERT INTO assignment_types (type_code, type_name, category, needs_doctor, rotation_code, legend_color, sort_order) VALUES ('REDEPLOYED', 'Redeployed to another department', 'UNAVAILABLE', 'N', NULL, '#EAE3F8', 84);

-- ---------------------------------------------------------------- ELIGIBILITY EXCEPTIONS
INSERT INTO staff_rotation_eligibility (staff_id, rotation_code, is_eligible, reason) SELECT staff_id, 'SURGERY', 'N', 'CIC / supervisor' FROM staff WHERE display_name = 'Wejdan';
INSERT INTO staff_rotation_eligibility (staff_id, rotation_code, is_eligible, reason) SELECT staff_id, 'DOUBLE_CLINIC', 'N', 'CIC / supervisor' FROM staff WHERE display_name = 'Wejdan';
INSERT INTO staff_rotation_eligibility (staff_id, rotation_code, is_eligible, reason) SELECT staff_id, 'VITALS', 'N', 'CIC / supervisor' FROM staff WHERE display_name = 'Wejdan';
INSERT INTO staff_rotation_eligibility (staff_id, rotation_code, is_eligible, reason) SELECT staff_id, 'INSTRUMENTS', 'N', 'CIC / supervisor' FROM staff WHERE display_name = 'Wejdan';
INSERT INTO staff_rotation_eligibility (staff_id, rotation_code, is_eligible, reason) SELECT staff_id, 'CRASH_CART', 'N', 'CIC / supervisor' FROM staff WHERE display_name = 'Wejdan';

-- Not yet trained for surgery (CIC decision, 15 Oct 2026) - delete the row once trained
INSERT INTO staff_rotation_eligibility (staff_id, rotation_code, is_eligible, reason)
  SELECT staff_id, 'SURGERY', 'N', 'Not surgery-trained yet' FROM staff WHERE display_name IN ('Abdulmohsen', 'Leena', 'Saada');

-- ---------------------------------------------------------------- ROTATION BASELINE (opening balances from the Excel tracker)
-- as_of_date = cut-over date. Assignments logged AFTER this date add on top.
-- Change 2026-10-14 to the date the tracker was last updated, if different.
INSERT INTO rotation_baseline (staff_id, rotation_code, opening_count, opening_last_date, as_of_date)
SELECT s.staff_id, RTRIM(v.rot), v.cnt, v.last_dt, DATE '2026-10-14'
  FROM (
  SELECT 'Abdulmohsen' nm, 'DOUBLE_CLINIC' rot, 4 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Abdulmohsen' nm, 'SURGERY' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Abdulmohsen' nm, 'VITALS' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Aisha' nm, 'DOUBLE_CLINIC' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Aisha' nm, 'SURGERY' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Aisha' nm, 'VITALS' rot, 3 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Deema' nm, 'DOUBLE_CLINIC' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Deema' nm, 'SURGERY' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Deema' nm, 'VITALS' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Eman' nm, 'DOUBLE_CLINIC' rot, 3 cnt, DATE '2026-05-10' last_dt FROM dual UNION ALL
  SELECT 'Eman' nm, 'SURGERY' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Eman' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Haifa' nm, 'DOUBLE_CLINIC' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Haifa' nm, 'SURGERY' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Haifa' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Leena' nm, 'DOUBLE_CLINIC' rot, 4 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Leena' nm, 'SURGERY' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Leena' nm, 'VITALS' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Muluk' nm, 'DOUBLE_CLINIC' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Muluk' nm, 'SURGERY' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Muluk' nm, 'VITALS' rot, 2 cnt, DATE '2026-05-11' last_dt FROM dual UNION ALL
  SELECT 'Nawal' nm, 'DOUBLE_CLINIC' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Nawal' nm, 'SURGERY' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Nawal' nm, 'VITALS' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Raniya' nm, 'DOUBLE_CLINIC' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Raniya' nm, 'SURGERY' rot, 3 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Raniya' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Rhoda' nm, 'DOUBLE_CLINIC' rot, 3 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Rhoda' nm, 'SURGERY' rot, 3 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Rhoda' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Saada' nm, 'DOUBLE_CLINIC' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Saada' nm, 'SURGERY' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Saada' nm, 'VITALS' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Sharifah' nm, 'DOUBLE_CLINIC' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Sharifah' nm, 'SURGERY' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Sharifah' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Shouq' nm, 'DOUBLE_CLINIC' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Shouq' nm, 'SURGERY' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Shouq' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Tahani' nm, 'DOUBLE_CLINIC' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Tahani' nm, 'SURGERY' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Tahani' nm, 'VITALS' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Victoria' nm, 'DOUBLE_CLINIC' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Victoria' nm, 'SURGERY' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Victoria' nm, 'VITALS' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Waad' nm, 'DOUBLE_CLINIC' rot, 0 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Waad' nm, 'SURGERY' rot, 3 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Waad' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Zahraa' nm, 'DOUBLE_CLINIC' rot, 4 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Zahraa' nm, 'SURGERY' rot, 2 cnt, CAST(NULL AS DATE) last_dt FROM dual UNION ALL
  SELECT 'Zahraa' nm, 'VITALS' rot, 1 cnt, CAST(NULL AS DATE) last_dt FROM dual
  ) v
  JOIN staff s ON UPPER(s.display_name) = UPPER(RTRIM(v.nm));

-- ---------------------------------------------------------------- CLINIC CHECKLISTS (2026 history from the DAILY CHECKLISTS sheet)
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-02-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-03-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-05-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-06-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-08-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-09-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'MONTH', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (12, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (2, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (5, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (7, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (11, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (3, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (18, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (19, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (9, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (10, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (16, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (17, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (13, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (14, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (15, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (4, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (6, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'QUARTER', DATE '2026-01-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'QUARTER', DATE '2026-04-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'QUARTER', DATE '2026-07-01', 'Y');
INSERT INTO clinic_checklists (clinic_id, checklist_type, period_type, period_start, is_submitted) VALUES (8, 'EQUIPMENT', 'QUARTER', DATE '2026-10-01', 'N');

-- ---------------------------------------------------------------- EQUIPMENT (template — fill from each clinic's inventory)
-- INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, ppm_interval_months)
--   VALUES ('Endo motor', 'MACHINE', 'Y', 12);
-- INSERT INTO equipment_ppm (clinic_id, item_id, asset_tag, quantity, last_ppm_date, updated_by)
--   SELECT 2, item_id, 'BME-000123', 1, DATE '2026-03-01', 'seed' FROM equipment_catalog WHERE item_name = 'Endo motor';
--   -> ppm_due_date auto-fills to 2027-03-01 from the 12-month interval.

COMMIT;

-- Workload points per session (CIC can tune these)
UPDATE assignment_types SET workload_points = 1    WHERE type_code IN ('CLINIC', 'PEDO', 'IN_CHARGE', 'SUPPORT_DUTY');
UPDATE assignment_types SET workload_points = 1.5  WHERE type_code = 'SURGERY';
UPDATE assignment_types SET workload_points = 0.75 WHERE type_code = 'FLOATER';
UPDATE assignment_types SET workload_points = 0    WHERE category = 'UNAVAILABLE';
COMMIT;

-- Patient load by doctor level (CIC rule): one BD3/PG3/PG4 clinic = a double clinic of two BD1s
UPDATE doctor_categories SET patient_load = 0.5  WHERE category_code IN ('BD1', 'PG1');
UPDATE doctor_categories SET patient_load = 0.75 WHERE category_code IN ('BD2', 'PG2');
UPDATE doctor_categories SET patient_load = 1    WHERE category_code IN ('PG3', 'PG4', 'BD3', 'FC', 'SP');
COMMIT;

-- 2026 performance appraisal deadlines + progress (from the appraisal tracker:
-- SMART goals and objectives done for everyone; self assessment and final pending)
INSERT INTO appraisal_steps VALUES (2026, 1, 'SMART goals set',          DATE '2026-03-31');
INSERT INTO appraisal_steps VALUES (2026, 2, 'Objectives agreed',        DATE '2026-04-12');
INSERT INTO appraisal_steps VALUES (2026, 3, 'Self assessment',          DATE '2026-10-29');
INSERT INTO appraisal_steps VALUES (2026, 4, 'Final appraisal signed',   DATE '2026-11-30');
INSERT INTO staff_appraisals (staff_id, appraisal_year, step_no, is_done)
SELECT s.staff_id, 2026, st.step_no, CASE WHEN st.step_no <= 2 THEN 'Y' ELSE 'N' END
  FROM staff s CROSS JOIN appraisal_steps st
 WHERE st.appraisal_year = 2026 AND s.app_role <> 'ADMIN';
COMMIT;

