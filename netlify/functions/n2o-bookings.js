// Clinic 11 bookings for nitrous oxide sedation (with PEDO). No patient details are accepted or stored.
//
// GET  /api/n2o-bookings?date=YYYY-MM-DD   public: is Clinic 11 already booked that day { AM, PM }
// GET  /api/n2o-bookings?list=upcoming     CIC: upcoming bookings
// POST /api/n2o-bookings { doctor_id, pedo_resident, supervisor_doctor_id, work_date, session, note }   public
//      doctor_id = the ENDO resident / postgraduate operating; pedo_resident = typed name of the PEDO resident;
//      supervisor_doctor_id = a faculty (FC) doctor. One booking per session (Clinic 11 is one room).
// POST /api/n2o-bookings { booking_id, action: "seen" | "cancel" }   CIC
const { query, exec } = require('./lib/db');
const { notifyCic } = require('./lib/push');
const { ensureSchema } = require('./lib/migrate');
const { handler, json, cachedJson, parseBody, HttpError, isIsoDate, riyadhToday, requireCic } = require('./lib/http');

const weekdayOf = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();

exports.handler = handler(['GET', 'POST'], async (event) => {
  await ensureSchema();
  const q = event.queryStringParameters || {};

  if (event.httpMethod === 'GET' && q.list === 'upcoming') {
    requireCic(event);
    const rows = await query(`
      SELECT b.booking_id, TO_CHAR(b.work_date, 'YYYY-MM-DD') AS work_date, b.session_code, b.note, b.status, b.pedo_resident,
             d1.display_name AS doctor_name, d1.category_code AS doctor_category, d3.display_name AS supervisor_name,
             TO_CHAR(CAST(b.submitted_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS submitted_at
        FROM n2o_bookings b
        JOIN doctors d1 ON d1.doctor_id = b.doctor_id
        JOIN doctors d3 ON d3.doctor_id = b.supervisor_doctor_id
       WHERE b.work_date >= TO_DATE(:t, 'YYYY-MM-DD') AND b.status <> 'CANCELLED'
       ORDER BY b.work_date, b.session_code`, { t: riyadhToday() });
    return json(200, { bookings: rows });
  }

  if (event.httpMethod === 'GET') {
    if (!isIsoDate(q.date)) throw new HttpError(400, 'Date must be YYYY-MM-DD.');
    const rows = await query(`SELECT session_code FROM n2o_bookings WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND status <> 'CANCELLED'`, { d: q.date });
    const taken = new Set(rows.map((r) => r.session_code));
    return cachedJson({ date: q.date, AM: taken.has('AM'), PM: taken.has('PM') }, 15);
  }

  const b = parseBody(event);

  if (b.action === 'seen' || b.action === 'cancel') {
    requireCic(event);
    const id = Number(b.booking_id);
    if (!id) throw new HttpError(400, 'booking_id is required.');
    await exec(`BEGIN
      UPDATE n2o_bookings SET status = CASE WHEN :a = 'cancel' THEN 'CANCELLED' WHEN status = 'NEW' THEN 'SEEN' ELSE status END,
             seen_at = NVL(seen_at, SYSTIMESTAMP)
       WHERE booking_id = :id AND status <> 'CANCELLED';
      COMMIT; END;`, { a: b.action, id });
    return json(200, { ok: true });
  }

  if (b.website) throw new HttpError(400, 'Rejected.'); // honeypot
  const doc = Number(b.doctor_id), sup = Number(b.supervisor_doctor_id);
  const pedo = String(b.pedo_resident || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const date = b.work_date, session = String(b.session || '').toUpperCase();
  const note = b.note ? String(b.note).trim().slice(0, 120) : null;
  if (!doc) throw new HttpError(400, 'Choose the operator.');
  if (pedo.length < 2) throw new HttpError(400, 'Type the name of the PEDO resident.');
  if (!sup) throw new HttpError(400, 'Choose the supervisor.');
  if (!isIsoDate(date)) throw new HttpError(400, 'Pick the date.');
  if (date < riyadhToday()) throw new HttpError(400, 'That date has already passed.');
  if ([5, 6].includes(weekdayOf(date))) throw new HttpError(400, 'Clinics are closed on Friday and Saturday.');
  if (!['AM', 'PM'].includes(session)) throw new HttpError(400, 'Choose AM or PM.');

  await exec(`
DECLARE
  l_lock VARCHAR2(3);
  l_n    NUMBER;
BEGIN
  SELECT session_code INTO l_lock FROM session_times WHERE session_code = 'PM' FOR UPDATE; /* serialise bookings */
  SELECT COUNT(*) INTO l_n FROM doctors WHERE doctor_id = :doc AND is_active = 'Y' AND REGEXP_LIKE(category_code, '^(PG|BD)');
  IF l_n = 0 THEN RAISE_APPLICATION_ERROR(-20035, 'The operator must be a resident or postgraduate on the active list.'); END IF;
  SELECT COUNT(*) INTO l_n FROM doctors WHERE doctor_id = :sup AND is_active = 'Y' AND category_code = 'FC';
  IF l_n = 0 THEN RAISE_APPLICATION_ERROR(-20034, 'The supervisor must be a faculty member.'); END IF;
  SELECT COUNT(*) INTO l_n FROM n2o_bookings
   WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND session_code = :s AND status <> 'CANCELLED';
  IF l_n > 0 THEN
    RAISE_APPLICATION_ERROR(-20036, 'Clinic 11 is already booked for N2O sedation on ' || TO_CHAR(TO_DATE(:d, 'YYYY-MM-DD'), 'Dy DD Mon', 'NLS_DATE_LANGUAGE=ENGLISH')
      || ' · ' || :s || '. Please pick another session.');
  END IF;
  INSERT INTO n2o_bookings (doctor_id, pedo_resident, supervisor_doctor_id, work_date, session_code, note)
  VALUES (:doc, :pedo, :sup, TO_DATE(:d, 'YYYY-MM-DD'), :s, :note);
  COMMIT;
END;`, { doc, pedo, sup, d: date, s: session, note });

  const names = await query(`SELECT doctor_id, display_name FROM doctors WHERE doctor_id IN (:a, :c)`, { a: doc, c: sup });
  const nm = Object.fromEntries(names.map((n) => [Number(n.doctor_id), n.display_name]));
  const summary = `${nm[doc]} with PEDO ${pedo} (supervisor ${nm[sup]}) · ${date} · ${session}`;
  try {
    await notifyCic({ eventType: 'SURGERY_BOOKED', title: 'Clinic 11 · N₂O sedation booking', body: summary + (note ? ` · ${note}` : ''), url: '/#/assign', dedupeKey: `N2O:${doc}:${date}:${session}:${Date.now()}` });
  } catch (e) { console.error('notify CIC failed', e); }
  return json(200, { ok: true, message: `Booked. The CIC has been notified: Clinic 11 · ${summary}.` });
});
