-- =============================================================================
-- ENDO Clinic System — 99_smoke_test.sql
-- Run as: ENDO, after 04. Everything here is rolled back at the end.
-- Run as a script (F5 in Database Actions) and read the DBMS_OUTPUT panel.
-- =============================================================================
SET SERVEROUTPUT ON

DECLARE
  l_grp     NUMBER;
  l_log     NUMBER;
  l_staff   NUMBER;
  l_next    VARCHAR2(50);
  l_cnt     NUMBER;
  PROCEDURE ok(p VARCHAR2) IS BEGIN DBMS_OUTPUT.PUT_LINE('PASS  ' || p); END;
  PROCEDURE ko(p VARCHAR2) IS BEGIN DBMS_OUTPUT.PUT_LINE('FAIL  ' || p); END;
BEGIN
  SAVEPOINT smoke;

  SELECT staff_name INTO l_next FROM surgery_queue WHERE queue_position = 1;
  ok('Next in line for surgery before test: ' || l_next);

  -- 1. Surgery with two doctors = two rows, one group, counts as ONE surgery
  SELECT staff_id INTO l_staff FROM staff WHERE display_name = l_next;
  l_grp := assignment_group_seq.NEXTVAL;
  INSERT INTO assignment_logs (assignment_group_id, work_date, session_code, staff_id, doctor_id, type_code, recorded_by)
  SELECT l_grp, DATE '2026-10-15', 'AM', l_staff, doctor_id, 'SURGERY', 'smoke-test'
    FROM doctors WHERE display_name IN ('Dr. Yazeed', 'Dr. Muhannad');

  SELECT COUNT(*) INTO l_cnt FROM v_rotation_events
   WHERE staff_id = l_staff AND rotation_code = 'SURGERY' AND work_date = DATE '2026-10-15';
  IF l_cnt = 1 THEN ok('Two-doctor surgery counted once'); ELSE ko('Surgery counted ' || l_cnt || ' times'); END IF;

  SELECT staff_name INTO l_next FROM surgery_queue WHERE queue_position = 1;
  ok('Next in line after logging it: ' || l_next);

  -- 2. Single-doctor clinic row → clinic defaults to the staff's home clinic
  DECLARE
    l_haifa NUMBER; l_reema NUMBER;
  BEGIN
    SELECT staff_id  INTO l_haifa FROM staff   WHERE display_name = 'Haifa';
    SELECT doctor_id INTO l_reema FROM doctors WHERE display_name = 'Dr. Reema';
    INSERT INTO assignment_logs (work_date, session_code, staff_id, doctor_id, type_code, recorded_by)
    VALUES (DATE '2026-10-15', 'PM', l_haifa, l_reema, 'CLINIC', 'smoke-test')
    RETURNING log_id INTO l_log;
  END;
  SELECT COUNT(*) INTO l_cnt FROM assignment_logs WHERE log_id = l_log AND clinic_id = 9;
  IF l_cnt = 1 THEN ok('Home clinic (9) applied automatically'); ELSE ko('Home clinic not applied'); END IF;

  -- 3. Append-only: UPDATE must fail
  BEGIN
    UPDATE assignment_logs SET notes = 'tamper' WHERE log_id = l_log;
    ko('UPDATE was allowed on ASSIGNMENT_LOGS');
  EXCEPTION WHEN OTHERS THEN
    IF SQLCODE = -20001 THEN ok('UPDATE blocked'); ELSE ko('Unexpected error ' || SQLERRM); END IF;
  END;

  -- 4. Append-only: DELETE must fail
  BEGIN
    DELETE FROM assignment_logs WHERE log_id = l_log;
    ko('DELETE was allowed on ASSIGNMENT_LOGS');
  EXCEPTION WHEN OTHERS THEN
    IF SQLCODE = -20001 THEN ok('DELETE blocked'); ELSE ko('Unexpected error ' || SQLERRM); END IF;
  END;

  -- 5. Correction = AMEND row; old row drops out of "current"
  INSERT INTO assignment_logs (action, supersedes_log_id, work_date, session_code, staff_id, doctor_id, type_code, recorded_by, notes)
  SELECT 'AMEND', l_log, DATE '2026-10-15', 'PM', s.staff_id, d.doctor_id, 'CLINIC', 'smoke-test', 'Doctor changed'
    FROM staff s, doctors d WHERE s.display_name = 'Haifa' AND d.display_name = 'Dr. Noura R';
  SELECT COUNT(*) INTO l_cnt FROM v_assignments_current WHERE log_id = l_log;
  IF l_cnt = 0 THEN ok('Amended row no longer current; original still in history'); ELSE ko('Superseded row still current'); END IF;

  -- 6. A row can only be superseded once
  BEGIN
    INSERT INTO assignment_logs (action, supersedes_log_id, work_date, session_code, staff_id, type_code, recorded_by)
    VALUES ('CANCEL', l_log, DATE '2026-10-15', 'PM', l_staff, 'CLINIC', 'smoke-test');
    ko('Second correction of the same row allowed');
  EXCEPTION WHEN DUP_VAL_ON_INDEX THEN ok('Forked history prevented');
  END;

  -- 7. Phone handling: NULL stays NULL, local format normalised
  UPDATE staff SET phone_e164 = '050 123 4567', whatsapp_opt_in = 'Y' WHERE display_name = 'Haifa';
  SELECT COUNT(*) INTO l_cnt FROM staff WHERE display_name = 'Haifa' AND phone_e164 = '+966501234567';
  IF l_cnt = 1 THEN ok('Phone normalised to +966501234567'); ELSE ko('Phone not normalised'); END IF;
  UPDATE staff SET phone_e164 = NULL WHERE display_name = 'Haifa';
  SELECT COUNT(*) INTO l_cnt FROM staff WHERE display_name = 'Haifa' AND whatsapp_opt_in = 'N';
  IF l_cnt = 1 THEN ok('Removing phone also clears WhatsApp opt-in'); ELSE ko('Opt-in left on without phone'); END IF;

  -- 8. PPM: due date auto-fills, history written, no-device recipient flagged not dropped
  INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, ppm_interval_months)
  VALUES ('SMOKE Endo motor', 'MACHINE', 'Y', 12);
  INSERT INTO equipment_ppm (clinic_id, item_id, quantity, last_ppm_date, updated_by)
  SELECT 9, item_id, 1, ADD_MONTHS(TRUNC(SYSDATE), -12) + 3, 'smoke-test'
    FROM equipment_catalog WHERE item_name = 'SMOKE Endo motor';
  SELECT COUNT(*) INTO l_cnt FROM v_equipment_status
   WHERE item_name = 'SMOKE Endo motor' AND ppm_status = 'DUE_7_DAYS';
  IF l_cnt = 1 THEN ok('Due date auto-calculated and flagged DUE_7_DAYS'); ELSE ko('PPM status wrong'); END IF;
  SELECT COUNT(*) INTO l_cnt FROM v_ppm_alert_recipients
   WHERE item_name = 'SMOKE Endo motor' AND staff_name = 'Haifa' AND can_notify = 'N' AND skip_reason = 'NO_DEVICE';
  IF l_cnt = 1 THEN ok('Recipient with no push device listed with skip_reason NO_DEVICE'); ELSE ko('No-device recipient missing'); END IF;
  SELECT COUNT(*) INTO l_cnt FROM equipment_history h JOIN equipment_ppm e ON e.equipment_id = h.equipment_id
    JOIN equipment_catalog i ON i.item_id = e.item_id WHERE i.item_name = 'SMOKE Endo motor';
  IF l_cnt = 1 THEN ok('Equipment history row written'); ELSE ko('No equipment history'); END IF;

  ROLLBACK TO smoke;
  DBMS_OUTPUT.PUT_LINE('---- rolled back; no test data kept ----');
EXCEPTION WHEN OTHERS THEN
  ROLLBACK TO smoke;
  DBMS_OUTPUT.PUT_LINE('FAIL  Unhandled: ' || SQLERRM);
  RAISE;
END;
/
