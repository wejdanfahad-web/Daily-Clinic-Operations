// POST /api/assign — record assignments (CIC any day; the staff member in charge: today only).
// {
//   work_date: "2026-10-18",
//   client_request_id: "uuid",               // optional; resubmitting the same id is ignored
//   entries: [
//     { session: "AM", staff_id: 5, type_code: "CLINIC", doctor_ids: [12], clinic_id: 9, notes: "" },
//     { session: "AM", staff_id: 7, type_code: "SURGERY", doctor_ids: [3, 8] },     // 2 doctors = 1 surgery
//     { session: "PM", staff_id: 6, type_code: "VITALS", supersedes_log_id: 882, action: "CANCEL" }
//   ]
// }
const { writeEntries } = require('./lib/assignments');
const { notifyStaff } = require('./lib/push');
const { handler, json, parseBody, HttpError, isIsoDate, riyadhToday, requireCicOrInCharge } = require('./lib/http');

exports.handler = handler(['POST'], async (event) => {
  const user = await requireCicOrInCharge(event);
  const { work_date, entries, client_request_id } = parseBody(event);
  if (!isIsoDate(work_date)) throw new HttpError(400, 'work_date must be YYYY-MM-DD.');
  const today = riyadhToday();
  if (user.inCharge && work_date !== today) throw new HttpError(403, 'The staff member in charge can only change today\'s assignments.');

  const { crid, written, typeMap } = await writeEntries({
    workDate: work_date, entries, clientRequestId: client_request_id,
    recordedBy: `${user.name} (#${user.sid})${user.inCharge ? ' in charge' : ''}`,
  });

  // Notify: types flagged notify_on_assign (e.g. In charge), and any change to today/tomorrow.
  const soon = work_date === today || work_date === riyadhToday(1);
  const notified = [];
  for (const w of written) {
    const t = typeMap[w.type_code];
    const isChange = w.action !== 'ASSIGN';
    if (!(t && t.notify_on_assign === 'Y') && !(isChange && soon)) continue;
    const what = w.action === 'CANCEL' ? 'cancelled' : `${w.type_name}${w.doctor_name ? ' with ' + w.doctor_name : ''}${w.clinic_id ? ' · Clinic ' + w.clinic_id : ''}`;
    const r = await notifyStaff(w.staff_id, {
      eventType: t && t.notify_on_assign === 'Y' && !isChange ? (w.type_code === 'IN_CHARGE' ? 'IN_CHARGE' : 'SCHEDULE_CHANGE') : 'SCHEDULE_CHANGE',
      title: isChange ? 'Your schedule changed' : 'New assignment',
      body: `${work_date} ${w.session_code}: ${what}`,
      url: `/#/assign/${work_date}`,
      dedupeKey: `ASG:${w.log_id}`,
      assignmentLogId: w.log_id,
      notBefore: `${work_date} 07:30`, // staff learn a day's schedule at 07:30 on that day
    });
    notified.push({ log_id: w.log_id, status: r.status });
  }
  return json(200, { ok: true, client_request_id: crid, written, notified });
});
