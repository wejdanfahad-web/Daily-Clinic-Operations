// Talks to Oracle Autonomous Database through ORDS "REST-Enabled SQL" over HTTPS.
// Needs only small env vars (no wallet), which keeps us under Netlify's 4 KB limit.
//
//   ORDS_BASE_URL  e.g. https://xxxx-endodb.adb.uk-london-1.oraclecloudapps.com/ords/endo
//   DB_USER        ENDO
//   DB_PASSWORD    the ENDO password set in 00_create_schema_user.sql
//
// Every write is a PL/SQL block that ends in COMMIT, so each call is all-or-nothing.

class DbError extends Error {
  constructor(message, { status = 500, oraCode = null } = {}) {
    super(message);
    this.status = status;
    this.oraCode = oraCode;
  }
}

function toBinds(binds) {
  return Object.entries(binds || {}).map(([name, value]) => {
    if (typeof value === 'number') return { name, data_type: 'NUMBER', value };
    return { name, data_type: 'VARCHAR2', value: value === undefined || value === null ? null : String(value) };
  });
}

function lowerKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k.toLowerCase()] = v;
  return out;
}

// Turn "ORA-20031: Both surgery slots are taken\nORA-06512: at line 9" into a clean message.
function cleanOraMessage(text) {
  const m = /ORA-(\d{5}):\s*([^\n]*)/.exec(text || '');
  return m ? { code: Number(m[1]), message: m[2].trim() } : { code: null, message: text || 'Database error' };
}

async function run(statementText, binds = {}, { limit = 2000 } = {}) {
  const base = process.env.ORDS_BASE_URL;
  const user = process.env.DB_USER || 'ENDO';
  const pass = process.env.DB_PASSWORD;
  if (!base || !pass) throw new DbError('Database settings are missing (ORDS_BASE_URL / DB_PASSWORD).');

  const url = base.replace(/\/+$/, '') + '/_/sql';
  const body = JSON.stringify({ statementText, binds: toBinds(binds), offset: 0, limit });
  const auth = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');

  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body });
    // Always Free allows only a few simultaneous HTTP calls; back off briefly on 429/503.
    if (res.status !== 429 && res.status !== 503) break;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  if (res.status === 401) throw new DbError('Database login failed (check DB_USER / DB_PASSWORD).');
  if (!res.ok) throw new DbError('Database is not reachable (HTTP ' + res.status + '). If it was stopped, start it in the Oracle console.', { status: 503 });

  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) throw new DbError('Empty response from the database.');
  if (item.errorCode || item.errorDetails) {
    const { code, message } = cleanOraMessage(item.errorDetails || item.errorMessage);
    // ORA-20000..20999 are our own business-rule messages: show them to the user as-is.
    if (code && code >= 20000 && code <= 20999) throw new DbError(message, { status: 400, oraCode: code });
    if (code === 1) throw new DbError('That record already exists.', { status: 409, oraCode: code });
    console.error('DB error', item.errorDetails || item.errorMessage);
    throw new DbError('Database error' + (code ? ' (ORA-' + code + ')' : ''), { oraCode: code });
  }
  if (item.resultSet) return (item.resultSet.items || []).map(lowerKeys);
  return item.result !== undefined ? item.result : null;
}

const query = (sql, binds, opts) => run(sql, binds, opts);
async function one(sql, binds) { const rows = await run(sql, binds); return rows[0] || null; }
const exec = (plsql, binds) => run(plsql, binds);

module.exports = { query, one, exec, DbError };
