// POST /api/booking-action — CIC handles a surgery booking.
//   { booking_id, action: "seen" }
//   { booking_id, action: "cancel" }
//   { booking_id, action: "assign", staff_id }   → writes the SURGERY assignment (both doctors, one surgery)
//                                                    and the surgery queue moves on automatically.
const { one, exec } = require('./lib/db');
const { notifyStaff } = require('./lib/push');
const { handler, json, parseBody, HttpError, requireCic } = require('./lib/http');

exports.handler = handler(['POST'], async (event) => {
  const user = requireCic(event);
  const { booking_id, action, staff_id } = parseBody(event);
  const id = Number(booking_id);
  if (!id) throw new HttpError(400, 'booking_id is required.');

  if (action === 'seen' || action === 'cancel') {
    await exec(`
      BEGIN
        UPDATE surgery_bookings
           SET status = CASE WHEN :a = 'cancel' THEN 'CANCELLED' WHEN status = 'NEW' THEN 'SEEN' ELSE status END,
               seen_at = NVL(seen_at, SYSTIMESTAMP)
         WHERE booking_id = :id AND status <> 'CANCELLED';
        IF SQL%ROWCOUNT = 0 THEN RAISE_APPLICATION_ERROR(-20040, 'Booking not found or already cancelled.'); END IF;
        COMMIT;
      END;`, { a: action, id });
    return json(200, { ok: true });
  }

  if (action !== 'assign') throw new HttpError(400, 'Unknown action.');
  const sid = Number(staff_id);
  if (!sid) throw new HttpError(400, 'Choose who will assist.');

  await exec(`
DECLARE
  l_doc   NUMBER; l_asst NUMBER; l_date DATE; l_sess VARCHAR2(3); l_status VARCHAR2(10);
  l_elig  VARCHAR2(1); l_grp NUMBER; l_log NUMBER;
BEGIN
  SELECT doctor_id, assisting_doctor_id, work_date, session_code, status
    INTO l_doc, l_asst, l_date, l_sess, l_status
    FROM surgery_bookings WHERE booking_id = :id FOR UPDATE;
  IF l_status = 'CANCELLED' THEN RAISE_APPLICATION_ERROR(-20041, 'This booking was cancelled.'); END IF;
  IF l_status = 'ASSIGNED'  THEN RAISE_APPLICATION_ERROR(-20042, 'An assistant is already assigned to this surgery.'); END IF;

  BEGIN
    SELECT is_eligible INTO l_elig FROM surgery_queue WHERE staff_id = :sid;
  EXCEPTION WHEN NO_DATA_FOUND THEN l_elig := 'N';
  END;
  IF l_elig <> 'Y' THEN RAISE_APPLICATION_ERROR(-20043, 'This staff member is not available for surgery (not trained or not active).'); END IF;

  l_grp := assignment_group_seq.NEXTVAL;
  INSERT INTO assignment_logs (assignment_group_id, work_date, session_code, staff_id, doctor_id, type_code, notes, recorded_by)
  VALUES (l_grp, l_date, l_sess, :sid, l_doc, 'SURGERY', 'Booking #' || :id, :by)
  RETURNING log_id INTO l_log;
  INSERT INTO assignment_logs (assignment_group_id, work_date, session_code, staff_id, doctor_id, type_code, notes, recorded_by)
  VALUES (l_grp, l_date, l_sess, :sid, l_asst, 'SURGERY', 'Booking #' || :id, :by);

  UPDATE surgery_bookings SET status = 'ASSIGNED', assignment_log_id = l_log, seen_at = NVL(seen_at, SYSTIMESTAMP)
   WHERE booking_id = :id;
  COMMIT;
END;`, { id, sid, by: `${user.name} (#${user.sid})` });

  const b = await one(`
    SELECT TO_CHAR(b.work_date, 'YYYY-MM-DD') AS work_date, b.session_code, b.assignment_log_id,
           d1.display_name AS doc, d2.display_name AS asst
      FROM surgery_bookings b JOIN doctors d1 ON d1.doctor_id = b.doctor_id JOIN doctors d2 ON d2.doctor_id = b.assisting_doctor_id
     WHERE b.booking_id = :id`, { id });

  const push = await notifyStaff(sid, {
    eventType: 'SCHEDULE_CHANGE', title: 'Surgery assignment',
    body: `${b.work_date} ${b.session_code}: Surgery with ${b.doc} + ${b.asst}`,
    url: `/?date=${b.work_date}`, dedupeKey: `SURGASG:${id}:${sid}`, assignmentLogId: b.assignment_log_id,
  });
  return json(200, { ok: true, notified: push.status });
});
