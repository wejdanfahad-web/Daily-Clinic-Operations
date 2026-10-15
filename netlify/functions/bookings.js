// Surgery bookings by doctors. No patient details are ever accepted or stored.
//
// GET  /api/bookings?date=YYYY-MM-DD   public: how full that day is  { AM, PM, day, limits }
// GET  /api/bookings?list=upcoming     CIC: all upcoming bookings
// POST /api/bookings { doctor_id, assisting_doctor_id, work_date, session, note }   public
//
// Rules (checked inside one locked transaction so two doctors pressing Send together
// can't both take the last slot):
//   - max 2 surgeries per session, max 3 per day (instrument sets don't cover more)
//   - operator and "assisted by" must be different doctors
//   - neither doctor may already be in another surgery that session
//   - no past dates, no Friday/Saturday
const { query, one, exec } = require('./lib/db');
const { notifyCic } = require('./lib/push');
const { handler, json, cachedJson, parseBody, HttpError, isIsoDate, riyadhToday, requireCic } = require('./lib/http');

const PER_SESSION = 2;
const PER_DAY = 3;

function weekdayOf(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); } // 5 = Fri, 6 = Sat

exports.handler = handler(['GET', 'POST'], async (event) => {
  const q = event.queryStringParameters || {};

  if (event.httpMethod === 'GET' && q.list === 'upcoming') {
    requireCic(event);
    const rows = await query(`
      SELECT b.booking_id, TO_CHAR(b.work_date, 'YYYY-MM-DD') AS work_date, b.session_code, b.note, b.status,
             d1.doctor_id, d1.display_name AS doctor_name, d1.category_code AS doctor_category,
             d2.doctor_id AS assisting_doctor_id, d2.display_name AS assisting_doctor_name, d2.category_code AS assisting_category,
             s.display_name AS assigned_staff,
             TO_CHAR(CAST(b.submitted_at AT TIME ZONE 'Asia/Riyadh' AS DATE), 'YYYY-MM-DD HH24:MI') AS submitted_at
        FROM surgery_bookings b
        JOIN doctors d1 ON d1.doctor_id = b.doctor_id
        JOIN doctors d2 ON d2.doctor_id = b.assisting_doctor_id
        LEFT JOIN assignment_logs l ON l.log_id = b.assignment_log_id
        LEFT JOIN staff s ON s.staff_id = l.staff_id
       WHERE b.work_date >= TO_DATE(:t, 'YYYY-MM-DD') AND b.status <> 'CANCELLED'
       ORDER BY b.work_date, b.session_code, b.submitted_at`, { t: riyadhToday() });
    return json(200, { bookings: rows, limits: { per_session: PER_SESSION, per_day: PER_DAY } });
  }

  if (event.httpMethod === 'GET') {
    const date = q.date;
    if (!isIsoDate(date)) throw new HttpError(400, 'Date must be YYYY-MM-DD.');
    const r = await one(`
      SELECT NVL(SUM(CASE WHEN session_code = 'AM' THEN 1 END), 0) AS am,
             NVL(SUM(CASE WHEN session_code = 'PM' THEN 1 END), 0) AS pm,
             COUNT(*) AS day
        FROM surgery_bookings WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND status <> 'CANCELLED'`, { d: date });
    return cachedJson({ date, AM: Number(r.am), PM: Number(r.pm), day: Number(r.day), limits: { per_session: PER_SESSION, per_day: PER_DAY } }, 15);
  }

  // POST — new booking
  const b = parseBody(event);
  if (b.website) throw new HttpError(400, 'Rejected.'); // hidden honeypot field; real users leave it empty
  const doc = Number(b.doctor_id), asst = Number(b.assisting_doctor_id);
  const date = b.work_date, session = String(b.session || '').toUpperCase();
  const note = b.note ? String(b.note).trim().slice(0, 120) : null;

  if (!doc) throw new HttpError(400, 'Choose the operator.');
  if (!asst) throw new HttpError(400, 'Choose the assisting doctor.');
  if (doc === asst) throw new HttpError(400, 'The assisting doctor must be a different doctor.');
  if (!isIsoDate(date)) throw new HttpError(400, 'Pick the surgery date.');
  if (date < riyadhToday()) throw new HttpError(400, 'That date has already passed.');
  if ([5, 6].includes(weekdayOf(date))) throw new HttpError(400, 'Clinics are closed on Friday and Saturday.');
  if (!['AM', 'PM'].includes(session)) throw new HttpError(400, 'Choose AM or PM.');

  await exec(`
DECLARE
  l_lock    VARCHAR2(3);
  l_sess    NUMBER;
  l_day     NUMBER;
  l_busy    VARCHAR2(60);
  l_active  NUMBER;
BEGIN
  -- serialise bookings so the slot counts below can't race
  SELECT session_code INTO l_lock FROM session_times WHERE session_code = 'AM' FOR UPDATE;

  SELECT COUNT(*) INTO l_active FROM doctors WHERE doctor_id IN (:doc, :asst) AND is_active = 'Y';
  IF l_active < 2 THEN RAISE_APPLICATION_ERROR(-20030, 'One of the doctors is not on the active list.'); END IF;

  SELECT COUNT(*) INTO l_sess FROM surgery_bookings
   WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND session_code = :s AND status <> 'CANCELLED';
  IF l_sess >= :per_sess THEN
    RAISE_APPLICATION_ERROR(-20031, 'Both surgery slots on ' || TO_CHAR(TO_DATE(:d, 'YYYY-MM-DD'), 'Dy DD Mon', 'NLS_DATE_LANGUAGE=ENGLISH')
      || ' · ' || :s || ' are taken. Please pick another session.');
  END IF;

  SELECT COUNT(*) INTO l_day FROM surgery_bookings
   WHERE work_date = TO_DATE(:d, 'YYYY-MM-DD') AND status <> 'CANCELLED';
  IF l_day >= :per_day THEN
    RAISE_APPLICATION_ERROR(-20032, TO_CHAR(TO_DATE(:d, 'YYYY-MM-DD'), 'Dy DD Mon', 'NLS_DATE_LANGUAGE=ENGLISH')
      || ' already has ' || :per_day || ' surgeries booked (the daily maximum). Please pick another day.');
  END IF;

  BEGIN
    SELECT d.display_name INTO l_busy
      FROM surgery_bookings b JOIN doctors d ON d.doctor_id IN (:doc, :asst)
     WHERE b.work_date = TO_DATE(:d, 'YYYY-MM-DD') AND b.session_code = :s AND b.status <> 'CANCELLED'
       AND d.doctor_id IN (b.doctor_id, b.assisting_doctor_id)
     FETCH FIRST 1 ROWS ONLY;
    RAISE_APPLICATION_ERROR(-20033, l_busy || ' is already in a surgery that session.');
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
  END;

  INSERT INTO surgery_bookings (doctor_id, assisting_doctor_id, work_date, session_code, note)
  VALUES (:doc, :asst, TO_DATE(:d, 'YYYY-MM-DD'), :s, :note);
  COMMIT;
END;`, { doc, asst, d: date, s: session, note, per_sess: PER_SESSION, per_day: PER_DAY });

  const names = await query(`SELECT doctor_id, display_name FROM doctors WHERE doctor_id IN (:a, :b)`, { a: doc, b: asst });
  const nm = Object.fromEntries(names.map((n) => [Number(n.doctor_id), n.display_name]));
  const summary = `${nm[doc]} (assisted by ${nm[asst]}) · ${date} · ${session}`;

  try {
    await notifyCic({ eventType: 'SURGERY_BOOKED', title: 'New surgery booking', body: summary + (note ? ` · ${note}` : ''), url: '/?tab=assign', dedupeKey: `SURG:${doc}:${date}:${session}:${Date.now()}` });
  } catch (e) { console.error('notify CIC failed', e); } // the booking itself is saved either way

  return json(200, { ok: true, message: `Sent. The CIC has been notified about ${summary}.` });
});
