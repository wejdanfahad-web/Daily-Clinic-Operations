// Small, idempotent schema changes applied automatically by the API, so the CIC never has to
// run SQL for them. Each step checks whether it is already done before changing anything.
// Runs at most once per function instance (cold start).
const { one, exec } = require('./db');

const STEPS = [
  {
    id: '07_catalog_list_status',
    // STANDARD = in the dropdown · PENDING = typed under "Other…", waiting for the CIC · REMOVED = taken off the list
    done: `SELECT COUNT(*) AS n FROM user_tab_columns WHERE table_name = 'EQUIPMENT_CATALOG' AND column_name = 'LIST_STATUS'`,
    run: `BEGIN EXECUTE IMMEDIATE 'ALTER TABLE equipment_catalog ADD (list_status VARCHAR2(10) DEFAULT ''STANDARD'' NOT NULL)'; END;`,
  },
  {
    id: '08_department_machine_list',
    optional: true, // list data: a failure is logged and never blocks the page
    // The department's standard machine list (Endo inventory tracker, Oct 2026).
    // Only the dental chair, X-ray unit and microscope have a PPM due date.
    done: `SELECT COUNT(*) AS n FROM equipment_catalog WHERE UPPER(item_name) = 'MICROSCOPE' AND item_kind = 'MACHINE' AND requires_ppm = 'Y' AND list_status = 'STANDARD'`,
    run: `
DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(60);
  l_all t_names := t_names('Dental Chair', 'X-ray Unit', 'Microscope', 'X Smart Plus', 'X Smart Plus Handpiece', 'Apex Locator',
                           'Beta Gun', 'Beta Charging Stand', 'Alpha', 'Amalgamator', 'Adult Sensor', 'PEDO Sensor',
                           'P5 Ultrasonic', 'Wireless Light Cure', 'Wired Light Cure', 'Intraoral Camera', 'Endo Activator');
BEGIN
  FOR i IN 1 .. l_all.COUNT LOOP
    UPDATE equipment_catalog SET list_status = 'STANDARD', is_active = 'Y', item_name = l_all(i), updated_at = SYSTIMESTAMP
     WHERE UPPER(item_name) = UPPER(l_all(i)) AND item_kind = 'MACHINE';
    IF SQL%ROWCOUNT = 0 THEN
      BEGIN
        INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status) VALUES (l_all(i), 'MACHINE', 'N', 'STANDARD');
      EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL; -- same name already used for the other kind
      END;
    END IF;
  END LOOP;
  UPDATE equipment_catalog
     SET requires_ppm = CASE WHEN UPPER(item_name) IN ('DENTAL CHAIR', 'X-RAY UNIT', 'MICROSCOPE') THEN 'Y' ELSE 'N' END,
         updated_at = SYSTIMESTAMP
   WHERE item_kind = 'MACHINE';
  COMMIT;
END;`,
  },
  {
    id: '10_department_instrument_list',
    optional: true,
    // The department's standard instrument list (Oct 2026). Spelling corrected where the list had typos.
    done: `SELECT COUNT(*) AS n FROM equipment_catalog WHERE UPPER(item_name) = 'BIB HOLDER' AND item_kind = 'INSTRUMENT' AND list_status = 'STANDARD'`,
    run: `
DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(60);
  l_all t_names := t_names('Apex Locator tips', 'Buchanan Blue', 'Buchanan Red', 'Schilder plugger (all sizes)', 'Mixing spatula',
                           'Endo ring', 'Endo ruler', 'Hemostat straight', 'Hemostat curved', 'Stieglitz straight', 'Stieglitz curved',
                           'Surgical scissors', 'Crown remover', 'Tooth Slooth', 'Metal files stand', 'Endo stand', 'Needle holder',
                           'Mouth mirror', 'Mouth mirror with ruler', 'Glass slab', 'Endo explorer', 'Cotton plier',
                           'Plastic instrument', 'Metal syringe', 'Bib holder');
BEGIN
  FOR i IN 1 .. l_all.COUNT LOOP
    UPDATE equipment_catalog SET list_status = 'STANDARD', is_active = 'Y', item_name = l_all(i), updated_at = SYSTIMESTAMP
     WHERE UPPER(item_name) = UPPER(l_all(i)) AND item_kind = 'INSTRUMENT';
    IF SQL%ROWCOUNT = 0 THEN
      BEGIN
        INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status) VALUES (l_all(i), 'INSTRUMENT', 'N', 'STANDARD');
      EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL; -- same name already used for the other kind
      END;
    END IF;
  END LOOP;
  COMMIT;
END;`,
  },
  {
    id: '09_equipment_responsible',
    // The staff member responsible for a machine (Staff ID in the inventory sheet, or whoever added it).
    done: `SELECT COUNT(*) AS n FROM user_tab_columns WHERE table_name = 'EQUIPMENT_PPM' AND column_name = 'RESPONSIBLE_STAFF_ID'`,
    run: `BEGIN EXECUTE IMMEDIATE 'ALTER TABLE equipment_ppm ADD (responsible_staff_id NUMBER(10) CONSTRAINT eq_ppm_resp_fk REFERENCES staff (staff_id))'; END;`,
  },
  {
    id: '11_equipment_line_key',
    // The old rule allowed only one untagged line per item per clinic, which refused a clinic with two
    // X Smart Plus machines. A line is now unique by clinic + item + DUH # + Serial # + who is responsible.
    done: `SELECT COUNT(*) AS n FROM user_indexes WHERE index_name = 'EQ_PPM_LINE2_UK'`,
    run: `
BEGIN
  BEGIN EXECUTE IMMEDIATE 'DROP INDEX eq_ppm_line_uk'; EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1418 THEN RAISE; END IF; END;
  EXECUTE IMMEDIATE 'CREATE UNIQUE INDEX eq_ppm_line2_uk ON equipment_ppm (clinic_id, item_id, NVL(asset_tag, ''-''), NVL(UPPER(serial_no), ''-''), NVL(responsible_staff_id, 0))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;`,
  },
  {
    id: '12_machine_endo_activator',
    optional: true,
    done: `SELECT COUNT(*) AS n FROM equipment_catalog WHERE UPPER(item_name) = 'ENDO ACTIVATOR' AND list_status = 'STANDARD'`,
    run: `
BEGIN
  UPDATE equipment_catalog SET list_status = 'STANDARD', is_active = 'Y', item_name = 'Endo Activator', updated_at = SYSTIMESTAMP
   WHERE UPPER(item_name) = 'ENDO ACTIVATOR';
  IF SQL%ROWCOUNT = 0 THEN
    INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status) VALUES ('Endo Activator', 'MACHINE', 'N', 'STANDARD');
  END IF;
  COMMIT;
END;`,
  },
  {
    id: '12_more_machines',
    optional: true,
    done: `SELECT COUNT(*) AS n FROM equipment_catalog WHERE UPPER(item_name) = 'EPT' AND item_kind = 'MACHINE' AND list_status = 'STANDARD'`,
    run: `
DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(60);
  l_all t_names := t_names('Endo Activator', 'EPT');
BEGIN
  FOR i IN 1 .. l_all.COUNT LOOP
    UPDATE equipment_catalog SET list_status = 'STANDARD', is_active = 'Y', item_name = l_all(i), updated_at = SYSTIMESTAMP
     WHERE UPPER(item_name) = UPPER(l_all(i)) AND item_kind = 'MACHINE';
    IF SQL%ROWCOUNT = 0 THEN
      BEGIN
        INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status) VALUES (l_all(i), 'MACHINE', 'N', 'STANDARD');
      EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;
      END;
    END IF;
  END LOOP;
  COMMIT;
END;`,
  },
  {
    id: '13_ppm_only_three',
    optional: true,
    done: `SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END AS n FROM equipment_catalog
            WHERE item_kind = 'MACHINE' AND requires_ppm = 'Y' AND UPPER(item_name) NOT IN ('DENTAL CHAIR', 'X-RAY UNIT', 'MICROSCOPE')
              AND list_status = 'STANDARD' AND NVL(updated_at, created_at) < TIMESTAMP '2026-10-21 00:00:00 +03:00'`,
    run: `BEGIN
  UPDATE equipment_catalog SET requires_ppm = 'N', updated_at = SYSTIMESTAMP
   WHERE item_kind = 'MACHINE' AND requires_ppm = 'Y' AND UPPER(item_name) NOT IN ('DENTAL CHAIR', 'X-RAY UNIT', 'MICROSCOPE')
     AND list_status = 'STANDARD' AND NVL(updated_at, created_at) < TIMESTAMP '2026-10-21 00:00:00 +03:00';
  COMMIT;
END;`,
  },
  {
    id: '13_ppm_only_three_machines',
    optional: true,
    // Only the dental chair, X-ray unit and microscope have a PPM due date; anything else marked by mistake is cleared.
    // Runs once (marked by the table comment), so a PPM the CIC later switches on stays on.
    done: `SELECT COUNT(*) AS n FROM user_tab_comments WHERE table_name = 'EQUIPMENT_CATALOG' AND comments LIKE '%[ppm13]%'`,
    run: `BEGIN
  UPDATE equipment_catalog SET requires_ppm = 'N', updated_at = SYSTIMESTAMP
   WHERE item_kind = 'MACHINE' AND requires_ppm = 'Y' AND UPPER(item_name) NOT IN ('DENTAL CHAIR', 'X-RAY UNIT', 'MICROSCOPE');
  EXECUTE IMMEDIATE 'COMMENT ON TABLE equipment_catalog IS ''Standard list of machines and instruments [ppm13]''';
  COMMIT;
END;`,
  },
  {
    id: '14_n2o_bookings',
    // Doctors book Clinic 11 for nitrous oxide sedation (one booking per session); the CIC is notified.
    done: `SELECT COUNT(*) AS n FROM user_tables WHERE table_name = 'N2O_BOOKINGS'`,
    run: `BEGIN EXECUTE IMMEDIATE '
CREATE TABLE n2o_bookings (
  booking_id            NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  doctor_id             NUMBER(10)   NOT NULL REFERENCES doctors (doctor_id),
  pedo_resident         VARCHAR2(80) NOT NULL,
  supervisor_doctor_id  NUMBER(10)   NOT NULL REFERENCES doctors (doctor_id),
  work_date             DATE         NOT NULL,
  session_code          VARCHAR2(3)  NOT NULL CHECK (session_code IN (''AM'', ''PM'')),
  note                  VARCHAR2(120),
  status                VARCHAR2(10) DEFAULT ''NEW'' NOT NULL CHECK (status IN (''NEW'', ''SEEN'', ''CANCELLED'')),
  submitted_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  seen_at               TIMESTAMP WITH TIME ZONE
)'; END;`,
  },
  {
    id: '15_remove_albaz_alzahrani',
    // CIC request (Oct 2026): Dr. Abdullah Albaz and Dr. Ziyad Alzahrani are removed from every list.
    // Their past assignments stay in the log; they leave the active doctors, the timetable and the name aliases.
    optional: true,
    done: `SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END AS n FROM doctors
            WHERE is_active = 'Y' AND (REGEXP_LIKE(display_name || ' ' || full_name, 'albaz', 'i')
                                       OR REGEXP_LIKE(display_name || ' ' || full_name, 'ziyad\W*(al)?\W*zahrani', 'i'))`,
    run: `
BEGIN
  FOR d IN (SELECT doctor_id FROM doctors
             WHERE REGEXP_LIKE(display_name || ' ' || full_name, 'albaz', 'i')
                OR REGEXP_LIKE(display_name || ' ' || full_name, 'ziyad\W*(al)?\W*zahrani', 'i')) LOOP
    UPDATE doctors SET is_active = 'N', updated_at = SYSTIMESTAMP WHERE doctor_id = d.doctor_id;
    DELETE FROM doctor_timetable WHERE doctor_id = d.doctor_id;
    DELETE FROM doctor_aliases WHERE doctor_id = d.doctor_id;
  END LOOP;
  DELETE FROM doctor_aliases WHERE alias_norm LIKE '%albaz%' OR REGEXP_LIKE(alias_norm, 'ziyad (al )?zahrani');
  COMMIT;
END;`,
  },
  {
    id: '16_announcements',
    // CIC announcements to all staff or chosen staff (phone notification + shown in the app).
    done: `SELECT COUNT(*) AS n FROM user_tables WHERE table_name = 'ANNOUNCEMENTS'`,
    run: `
BEGIN
  EXECUTE IMMEDIATE '
CREATE TABLE announcements (
  announcement_id  NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  title            VARCHAR2(80),
  message          VARCHAR2(500)  NOT NULL,
  audience         VARCHAR2(1000) NOT NULL,
  audience_label   VARCHAR2(400),
  sent_by          VARCHAR2(100)  NOT NULL,
  sent_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
)';
  BEGIN EXECUTE IMMEDIATE 'ALTER TABLE notification_log DROP CONSTRAINT notif_event_ck';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  EXECUTE IMMEDIATE 'ALTER TABLE notification_log ADD CONSTRAINT notif_event_ck CHECK (event_type IN (''PPM_DUE'',''PPM_OVERDUE'',''LOW_STOCK'',''SCHEDULE_CHANGE'',''IN_CHARGE'',''IN_CHARGE_SUMMARY'',''DAILY_DUTY'',''SURGERY_BOOKED'',''MONTHLY_REPORT'',''ANNOUNCEMENT''))';
END;`,
  },
  {
    id: '17_add_dr_kholoud',
    optional: true,
    // CIC request (Oct 2026): Dr. Kholoud joins as a specialist (SP). Her sessions are set in the Timetable page.
    done: `SELECT COUNT(*) AS n FROM doctors WHERE UPPER(display_name) = 'DR. KHOLOUD' AND category_code = 'SP' AND is_active = 'Y'`,
    run: `
BEGIN
  UPDATE doctors SET category_code = 'SP', is_active = 'Y', updated_at = SYSTIMESTAMP WHERE UPPER(display_name) = 'DR. KHOLOUD';
  IF SQL%ROWCOUNT = 0 THEN
    INSERT INTO doctors (display_name, title, category_code) VALUES ('Dr. Kholoud', 'DR', 'SP');
  END IF;
  COMMIT;
END;`,
  },
  {
    id: '18_tofflemire_matrix',
    optional: true,
    // CIC request (Oct 2026): add Tofflemire Matrix to the standard instrument list.
    done: `SELECT COUNT(*) AS n FROM equipment_catalog WHERE UPPER(item_name) = 'TOFFLEMIRE MATRIX' AND item_kind = 'INSTRUMENT' AND list_status = 'STANDARD' AND is_active = 'Y'`,
    run: `
BEGIN
  UPDATE equipment_catalog SET list_status = 'STANDARD', is_active = 'Y', item_name = 'Tofflemire Matrix', updated_at = SYSTIMESTAMP
   WHERE UPPER(item_name) = 'TOFFLEMIRE MATRIX' AND item_kind = 'INSTRUMENT';
  IF SQL%ROWCOUNT = 0 THEN
    INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status) VALUES ('Tofflemire Matrix', 'INSTRUMENT', 'N', 'STANDARD');
  END IF;
  COMMIT;
END;`,
  },
  {
    id: '19_apex_locator_hook',
    optional: true,
    // CIC request (Oct 2026): add Apex Locator hook to the standard instrument list.
    done: `SELECT COUNT(*) AS n FROM equipment_catalog WHERE UPPER(item_name) = 'APEX LOCATOR HOOK' AND item_kind = 'INSTRUMENT' AND list_status = 'STANDARD' AND is_active = 'Y'`,
    run: `
BEGIN
  UPDATE equipment_catalog SET list_status = 'STANDARD', is_active = 'Y', item_name = 'Apex Locator hook', updated_at = SYSTIMESTAMP
   WHERE UPPER(item_name) = 'APEX LOCATOR HOOK' AND item_kind = 'INSTRUMENT';
  IF SQL%ROWCOUNT = 0 THEN
    INSERT INTO equipment_catalog (item_name, item_kind, requires_ppm, list_status) VALUES ('Apex Locator hook', 'INSTRUMENT', 'N', 'STANDARD');
  END IF;
  COMMIT;
END;`,
  },
  {
    id: '20_faculty_supervisors',
    optional: true,
    // CIC request (Oct 2026): four faculty for surgery supervision (no clinic in the timetable).
    done: `SELECT CASE WHEN COUNT(*) = 4 THEN 1 ELSE 0 END AS n FROM doctors WHERE category_code = 'FC' AND is_active = 'Y'
            AND UPPER(display_name) IN ('PROF. HANAN BLATO', 'DR. SUMAIYAH BASUDAN', 'DR. KHOLOUD ALMANEI', 'DR. SUNDUS BUKHARI')`,
    run: `
DECLARE
  TYPE t_names IS TABLE OF VARCHAR2(60);
  l_all t_names := t_names('Prof. Hanan Blato', 'Dr. Sumaiyah Basudan', 'Dr. Kholoud Almanei', 'Dr. Sundus Bukhari');
BEGIN
  FOR i IN 1 .. l_all.COUNT LOOP
    UPDATE doctors SET category_code = 'FC', is_active = 'Y', updated_at = SYSTIMESTAMP WHERE UPPER(display_name) = UPPER(l_all(i));
    IF SQL%ROWCOUNT = 0 THEN
      INSERT INTO doctors (display_name, title, category_code)
      VALUES (l_all(i), CASE WHEN l_all(i) LIKE 'Prof.%' THEN 'PROF' ELSE 'DR' END, 'FC');
    END IF;
  END LOOP;
  COMMIT;
END;`,
  },
  {
    id: '21_merge_sulaiman_into_alhadlaq',
    optional: true,
    // CIC request (Oct 2026): Prof. Sulaiman and Prof. Alhadlaq are the same person; keep Prof. Alhadlaq.
    // His timetable sessions and name aliases move to Prof. Alhadlaq; past log rows stay as recorded.
    done: `SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END AS n FROM doctors WHERE UPPER(display_name) = 'PROF. SULAIMAN' AND is_active = 'Y'`,
    run: `
DECLARE
  l_old NUMBER; l_new NUMBER;
BEGIN
  SELECT MIN(doctor_id) INTO l_old FROM doctors WHERE UPPER(display_name) = 'PROF. SULAIMAN';
  SELECT MIN(doctor_id) INTO l_new FROM doctors WHERE UPPER(display_name) = 'PROF. ALHADLAQ';
  IF l_new IS NULL THEN
    INSERT INTO doctors (display_name, title, category_code) VALUES ('Prof. Alhadlaq', 'PROF', 'FC') RETURNING doctor_id INTO l_new;
  END IF;
  UPDATE doctors SET is_active = 'Y', category_code = 'FC', updated_at = SYSTIMESTAMP WHERE doctor_id = l_new;
  IF l_old IS NOT NULL THEN
    UPDATE doctor_timetable t SET doctor_id = l_new
     WHERE t.doctor_id = l_old
       AND NOT EXISTS (SELECT 1 FROM doctor_timetable x WHERE x.doctor_id = l_new AND x.semester_id = t.semester_id
                          AND x.weekday = t.weekday AND x.session_code = t.session_code AND NVL(x.clinic_id, 0) = NVL(t.clinic_id, 0));
    DELETE FROM doctor_timetable WHERE doctor_id = l_old;
    UPDATE doctor_aliases SET doctor_id = l_new WHERE doctor_id = l_old;
    UPDATE doctors SET is_active = 'N', updated_at = SYSTIMESTAMP WHERE doctor_id = l_old;
  END IF;
  UPDATE doctor_aliases SET doctor_id = l_new WHERE alias_norm = 'sulaiman';
  IF SQL%ROWCOUNT = 0 THEN
    INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) VALUES ('sulaiman', l_new, 'CIC merge');
  END IF;
  COMMIT;
END;`,
  },
  {
    id: '22_merge_fahad_j_rename_fahd_s',
    optional: true,
    // CIC request (Oct 2026): Prof. Fahad J is Prof. Aljarbou (keep Prof. Aljarbou); Prof. Fahd S is renamed Prof. Alsalleeh.
    // Timetable sessions and name aliases follow; past log rows stay as recorded.
    done: `SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END AS n FROM doctors WHERE UPPER(display_name) IN ('PROF. FAHAD J', 'PROF. FAHD S') AND is_active = 'Y'`,
    run: `
DECLARE
  PROCEDURE merge_into(p_old VARCHAR2, p_new VARCHAR2, p_alias VARCHAR2) IS
    l_old NUMBER; l_new NUMBER;
  BEGIN
    SELECT MIN(doctor_id) INTO l_old FROM doctors WHERE UPPER(display_name) = UPPER(p_old);
    SELECT MIN(doctor_id) INTO l_new FROM doctors WHERE UPPER(display_name) = UPPER(p_new);
    IF l_new IS NULL AND l_old IS NOT NULL THEN
      UPDATE doctors SET display_name = p_new, is_active = 'Y', category_code = 'FC', updated_at = SYSTIMESTAMP WHERE doctor_id = l_old;
      l_new := l_old;
    ELSIF l_new IS NULL THEN
      INSERT INTO doctors (display_name, title, category_code) VALUES (p_new, 'PROF', 'FC') RETURNING doctor_id INTO l_new;
    ELSE
      UPDATE doctors SET is_active = 'Y', category_code = 'FC', updated_at = SYSTIMESTAMP WHERE doctor_id = l_new;
      IF l_old IS NOT NULL THEN
        UPDATE doctor_timetable t SET doctor_id = l_new
         WHERE t.doctor_id = l_old
           AND NOT EXISTS (SELECT 1 FROM doctor_timetable x WHERE x.doctor_id = l_new AND x.semester_id = t.semester_id
                              AND x.weekday = t.weekday AND x.session_code = t.session_code AND NVL(x.clinic_id, 0) = NVL(t.clinic_id, 0));
        DELETE FROM doctor_timetable WHERE doctor_id = l_old;
        UPDATE doctor_aliases SET doctor_id = l_new WHERE doctor_id = l_old;
        UPDATE doctors SET is_active = 'N', updated_at = SYSTIMESTAMP WHERE doctor_id = l_old;
      END IF;
    END IF;
    UPDATE doctor_aliases SET doctor_id = l_new WHERE alias_norm = p_alias;
    IF SQL%ROWCOUNT = 0 THEN
      INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) VALUES (p_alias, l_new, 'CIC merge');
    END IF;
  END;
BEGIN
  merge_into('Prof. Fahad J', 'Prof. Aljarbou', 'fahad j');
  merge_into('Prof. Fahd S', 'Prof. Alsalleeh', 'fahd s');
  COMMIT;
END;`,
  },
  {
    id: '23_merge_sara_into_alsubait',
    optional: true,
    // CIC request (Oct 2026): Prof. Sara is Prof. Alsubait (keep Prof. Alsubait).
    // Timetable sessions and name aliases follow; past log rows stay as recorded.
    done: `SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END AS n FROM doctors WHERE UPPER(display_name) = 'PROF. SARA' AND is_active = 'Y'`,
    run: `
DECLARE
  PROCEDURE merge_into(p_old VARCHAR2, p_new VARCHAR2, p_alias VARCHAR2) IS
    l_old NUMBER; l_new NUMBER;
  BEGIN
    SELECT MIN(doctor_id) INTO l_old FROM doctors WHERE UPPER(display_name) = UPPER(p_old);
    SELECT MIN(doctor_id) INTO l_new FROM doctors WHERE UPPER(display_name) = UPPER(p_new);
    IF l_new IS NULL AND l_old IS NOT NULL THEN
      UPDATE doctors SET display_name = p_new, is_active = 'Y', category_code = 'FC', updated_at = SYSTIMESTAMP WHERE doctor_id = l_old;
      l_new := l_old;
    ELSIF l_new IS NULL THEN
      INSERT INTO doctors (display_name, title, category_code) VALUES (p_new, 'PROF', 'FC') RETURNING doctor_id INTO l_new;
    ELSE
      UPDATE doctors SET is_active = 'Y', category_code = 'FC', updated_at = SYSTIMESTAMP WHERE doctor_id = l_new;
      IF l_old IS NOT NULL THEN
        UPDATE doctor_timetable t SET doctor_id = l_new
         WHERE t.doctor_id = l_old
           AND NOT EXISTS (SELECT 1 FROM doctor_timetable x WHERE x.doctor_id = l_new AND x.semester_id = t.semester_id
                              AND x.weekday = t.weekday AND x.session_code = t.session_code AND NVL(x.clinic_id, 0) = NVL(t.clinic_id, 0));
        DELETE FROM doctor_timetable WHERE doctor_id = l_old;
        UPDATE doctor_aliases SET doctor_id = l_new WHERE doctor_id = l_old;
        UPDATE doctors SET is_active = 'N', updated_at = SYSTIMESTAMP WHERE doctor_id = l_old;
      END IF;
    END IF;
    UPDATE doctor_aliases SET doctor_id = l_new WHERE alias_norm = p_alias;
    IF SQL%ROWCOUNT = 0 THEN
      INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) VALUES (p_alias, l_new, 'CIC merge');
    END IF;
  END;
BEGIN
  merge_into('Prof. Sara', 'Prof. Alsubait', 'sara');
  COMMIT;
END;`,
  },
];

let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      for (const s of STEPS) {
        const r = await one(s.done);
        if (!r || Number(r.n) === 0) {
          try { await exec(s.run); console.log('schema step applied:', s.id); }
          catch (e) {
            if (/ORA-01430/.test(e.message)) continue;                 // already added by a parallel instance
            if (s.optional) { console.error('schema step skipped:', s.id, e.message); continue; }
            throw e;
          }
        }
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

module.exports = { ensureSchema, _reset: () => { ready = null; } };
