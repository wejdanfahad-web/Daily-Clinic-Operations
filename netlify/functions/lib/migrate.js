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
