-- =============================================================================
-- ENDO Clinic System — 02_triggers.sql
-- Run as: ENDO (after 01)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ASSIGNMENT_LOGS — validate + stamp every new row
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER assignment_logs_bi
BEFORE INSERT ON assignment_logs
FOR EACH ROW
DECLARE
  l_category      assignment_types.category%TYPE;
  l_needs_doctor  assignment_types.needs_doctor%TYPE;
  l_home_clinic   staff.home_clinic_id%TYPE;
BEGIN
  -- The database, not the browser, decides when something was recorded.
  :NEW.recorded_at := SYSTIMESTAMP;
  :NEW.work_date   := TRUNC(:NEW.work_date);

  IF :NEW.assignment_group_id IS NULL THEN
    :NEW.assignment_group_id := assignment_group_seq.NEXTVAL;
  END IF;

  BEGIN
    SELECT category, needs_doctor
      INTO l_category, l_needs_doctor
      FROM assignment_types
     WHERE type_code = :NEW.type_code
       AND is_active = 'Y';
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20002, 'Unknown or inactive assignment type: ' || :NEW.type_code);
  END;

  IF :NEW.action <> 'CANCEL' THEN
    IF l_needs_doctor = 'Y' AND :NEW.doctor_id IS NULL THEN
      RAISE_APPLICATION_ERROR(-20003, 'Assignment type ' || :NEW.type_code || ' requires a doctor.');
    END IF;

    -- On the sheet, a doctor name with no clinic number means "in the
    -- assistant's own clinic" (the CI column). Mirror that rule here.
    IF l_category = 'CLINICAL' AND :NEW.clinic_id IS NULL THEN
      BEGIN
        SELECT home_clinic_id INTO l_home_clinic FROM staff WHERE staff_id = :NEW.staff_id;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE_APPLICATION_ERROR(-20005, 'Unknown staff_id: ' || :NEW.staff_id);
      END;
      IF l_home_clinic IS NULL THEN
        RAISE_APPLICATION_ERROR(-20004, 'Clinic is required: this staff member has no home clinic.');
      END IF;
      :NEW.clinic_id := l_home_clinic;
    END IF;
  END IF;
END;
/

-- -----------------------------------------------------------------------------
-- 2. ASSIGNMENT_LOGS — append-only: block UPDATE and DELETE outright
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER assignment_logs_immutable
BEFORE UPDATE OR DELETE ON assignment_logs
FOR EACH ROW
BEGIN
  RAISE_APPLICATION_ERROR(-20001,
    'ASSIGNMENT_LOGS is a permanent audit log. Insert an AMEND or CANCEL row instead of '
    || CASE WHEN UPDATING THEN 'updating' ELSE 'deleting' END || ' log_id ' || :OLD.log_id || '.');
END;
/

-- -----------------------------------------------------------------------------
-- 3. EQUIPMENT_HISTORY — append-only as well
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER equipment_history_immutable
BEFORE UPDATE OR DELETE ON equipment_history
FOR EACH ROW
BEGIN
  RAISE_APPLICATION_ERROR(-20001, 'EQUIPMENT_HISTORY is a permanent audit log and cannot be changed.');
END;
/

-- -----------------------------------------------------------------------------
-- 4. Schema-level guard: stop DROP / TRUNCATE of the audit tables by the ENDO
--    user (protects against accidents and scripts run against the wrong schema).
--    To intentionally rebuild, an admin must first disable this trigger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER protect_audit_tables
BEFORE DROP OR TRUNCATE ON SCHEMA
BEGIN
  IF ora_dict_obj_type = 'TABLE'
     AND ora_dict_obj_name IN ('ASSIGNMENT_LOGS', 'EQUIPMENT_HISTORY', 'NOTIFICATION_LOG') THEN
    RAISE_APPLICATION_ERROR(-20010, ora_dict_obj_name || ' is protected audit data and cannot be dropped or truncated.');
  END IF;
END;
/

-- -----------------------------------------------------------------------------
-- 5. STAFF — normalise phone numbers; empty → NULL; stamp updated_at
--    Accepts 05XXXXXXXX, 9665XXXXXXXX, 009665XXXXXXXX, +9665XXXXXXXX, with
--    spaces or dashes. Anything else must already be valid E.164 (+country…).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER staff_biu
BEFORE INSERT OR UPDATE ON staff
FOR EACH ROW
BEGIN
  :NEW.display_name := TRIM(:NEW.display_name);
  :NEW.phone_e164   := REGEXP_REPLACE(:NEW.phone_e164, '[^0-9+]', '');   -- NULL stays NULL

  IF :NEW.phone_e164 IS NOT NULL THEN
    IF REGEXP_LIKE(:NEW.phone_e164, '^05[0-9]{8}$') THEN
      :NEW.phone_e164 := '+966' || SUBSTR(:NEW.phone_e164, 2);
    ELSIF REGEXP_LIKE(:NEW.phone_e164, '^9665[0-9]{8}$') THEN
      :NEW.phone_e164 := '+' || :NEW.phone_e164;
    ELSIF REGEXP_LIKE(:NEW.phone_e164, '^00[1-9][0-9]{7,14}$') THEN
      :NEW.phone_e164 := '+' || SUBSTR(:NEW.phone_e164, 3);
    END IF;
  END IF;

  -- No phone → cannot be opted in to WhatsApp.
  IF :NEW.phone_e164 IS NULL THEN
    :NEW.whatsapp_opt_in := 'N';
  END IF;

  IF UPDATING THEN
    :NEW.updated_at := SYSTIMESTAMP;
  END IF;
END;
/

-- -----------------------------------------------------------------------------
-- 6. updated_at stamps for the master tables
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER clinics_bu
BEFORE UPDATE ON clinics FOR EACH ROW
BEGIN
  :NEW.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER doctors_biu
BEFORE INSERT OR UPDATE ON doctors FOR EACH ROW
BEGIN
  :NEW.display_name := TRIM(:NEW.display_name);
  IF UPDATING THEN
    :NEW.updated_at := SYSTIMESTAMP;
  END IF;
END;
/

CREATE OR REPLACE TRIGGER equipment_catalog_bu
BEFORE UPDATE ON equipment_catalog FOR EACH ROW
BEGIN
  :NEW.updated_at := SYSTIMESTAMP;
END;
/

-- -----------------------------------------------------------------------------
-- 7. EQUIPMENT_PPM (before) — auto-calculate the next PPM due date when staff
--    record a new PPM date and the item has a known interval; stamp updated_at.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER equipment_ppm_biu
BEFORE INSERT OR UPDATE ON equipment_ppm
FOR EACH ROW
DECLARE
  l_interval  equipment_catalog.ppm_interval_months%TYPE;
  l_last_changed BOOLEAN;
  l_due_given    BOOLEAN;
BEGIN
  :NEW.last_ppm_date := TRUNC(:NEW.last_ppm_date);
  :NEW.ppm_due_date  := TRUNC(:NEW.ppm_due_date);

  l_last_changed := :NEW.last_ppm_date IS NOT NULL
                    AND (INSERTING
                         OR NVL(:OLD.last_ppm_date, DATE '1900-01-01') <> :NEW.last_ppm_date);
  -- "due date given" = the user explicitly entered/changed it in this statement
  l_due_given    := (INSERTING AND :NEW.ppm_due_date IS NOT NULL)
                    OR (UPDATING AND NVL(:OLD.ppm_due_date, DATE '1900-01-01')
                                  <> NVL(:NEW.ppm_due_date, DATE '1900-01-01'));

  IF l_last_changed AND NOT l_due_given THEN
    SELECT ppm_interval_months INTO l_interval
      FROM equipment_catalog
     WHERE item_id = :NEW.item_id;
    IF l_interval IS NOT NULL THEN
      :NEW.ppm_due_date := ADD_MONTHS(:NEW.last_ppm_date, l_interval);
    END IF;
  END IF;

  IF UPDATING THEN
    :NEW.updated_at := SYSTIMESTAMP;
  END IF;
END;
/

-- -----------------------------------------------------------------------------
-- 8. EQUIPMENT_PPM (after) — write the change trail automatically
--    (Deletes are impossible in practice: history rows reference the item.
--     Retire equipment with condition_status = 'RETIRED'.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER equipment_ppm_aiu
AFTER INSERT OR UPDATE ON equipment_ppm
FOR EACH ROW
DECLARE
  c_no_date     CONSTANT DATE := DATE '1900-01-01';
  l_change_type equipment_history.change_type%TYPE;
BEGIN
  l_change_type := CASE WHEN INSERTING THEN 'INSERT' ELSE 'UPDATE' END;

  IF INSERTING
     OR :OLD.quantity         <> :NEW.quantity
     OR :OLD.condition_status <> :NEW.condition_status
     OR NVL(:OLD.last_ppm_date, c_no_date) <> NVL(:NEW.last_ppm_date, c_no_date)
     OR NVL(:OLD.ppm_due_date,  c_no_date) <> NVL(:NEW.ppm_due_date,  c_no_date)
  THEN
    INSERT INTO equipment_history (
      equipment_id, change_type,
      old_quantity, new_quantity,
      old_last_ppm_date, new_last_ppm_date,
      old_ppm_due_date, new_ppm_due_date,
      old_status, new_status,
      changed_by
    ) VALUES (
      :NEW.equipment_id, l_change_type,
      :OLD.quantity, :NEW.quantity,
      :OLD.last_ppm_date, :NEW.last_ppm_date,
      :OLD.ppm_due_date, :NEW.ppm_due_date,
      :OLD.condition_status, :NEW.condition_status,
      NVL(:NEW.updated_by, SYS_CONTEXT('USERENV', 'SESSION_USER'))
    );
  END IF;
END;
/
