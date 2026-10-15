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
];

let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      for (const s of STEPS) {
        const r = await one(s.done);
        if (!r || Number(r.n) === 0) {
          try { await exec(s.run); console.log('schema step applied:', s.id); }
          catch (e) { if (!/ORA-01430/.test(e.message)) throw e; } // already added by a parallel instance
        }
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

module.exports = { ensureSchema, _reset: () => { ready = null; } };
