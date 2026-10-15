# ENDO Clinic System — Phase 1: Database

## Run order (Oracle Autonomous DB → Database Actions → SQL, run each as a script / F5)

| # | File | Run as | What it does |
|---|------|--------|--------------|
| 00 | `00_create_schema_user.sql` | ADMIN | Creates the `ENDO` schema and enables it for ORDS |
| 01 | `01_sequences_tables.sql` | ENDO | 16 sequences, 24 tables, constraints, indexes |
| 02 | `02_triggers.sql` | ENDO | Append-only protection, validation, phone normalisation, PPM auto-dates, equipment history |
| 03 | `03_views.sql` | ENDO | Current assignments, rotation queues, `SURGERY_QUEUE`, PPM status, alert recipients |
| 04 | `04_seed_data.sql` | ENDO | Clinics 1–19, 17 staff + CIC, 48 doctors, duty types, opening rotation counts, 2026 checklist history, 2026 appraisal steps + progress |
| 99 | `99_smoke_test.sql` | ENDO | Self-checking test that rolls itself back; every line should read `PASS` |

## How the sheet maps to the database

| On the weekly sheet | In the database |
|---|---|
| `Dr. Reema` in Haifa's row | 1 row in `ASSIGNMENT_LOGS`, type `CLINIC`; clinic defaults to Haifa's CI (9) |
| `Dr. Marwa, 2, Dr. Nada, 17` | 2 rows, same `assignment_group_id`, clinics 2 and 17 → counts as 1 double clinic |
| Yellow `Dr. Yazeed, Dr. Muhannad` | 2 rows, type `SURGERY`, same group → counts as **1** surgery |
| Vitals / Floater / In charge / Store… | type codes in `ASSIGNMENT_TYPES` (category `DUTY`) |
| On leave / SL / excuse / appt. | category `UNAVAILABLE` (shown as "Not available") |
| Instruments & Crash cart tabs | types `INSTRUMENTS` / `CRASH_CART`, session `DAY`, with their own rotation queues |
| Rotation Tracker counts | `ROTATION_BASELINE` opening balances; new assignments add on top |
| DAILY CHECKLISTS tab | `CLINIC_CHECKLISTS` |
| Shared surgery Excel (hospital) | replaced by doctors booking on the public page → `SURGERY_BOOKINGS` (no patient details) |
| Semester timetable (uploaded) | `SEMESTERS` + `DOCTOR_TIMETABLE`; planned leave in `STAFF_LEAVE`; day plans in `SCHEDULE_DRAFTS` until published; checks in `V_PLANNER_ISSUES` |

## Rules that are enforced (not just suggested)

- `ASSIGNMENT_LOGS`, `EQUIPMENT_HISTORY`: UPDATE and DELETE raise an error, and DROP/TRUNCATE by the ENDO user is blocked. To fix a mistake you add an `AMEND` or `CANCEL` row that points to the original. Each row can be corrected only once, so the history stays one straight chain.
- The database sets `recorded_at` itself, so the browser can't backdate it.
- `SURGERY_QUEUE` and the other queues are **views** worked out from the log, so they can't drift out of sync.
- Notifications are free web-push (the dashboard installed on the phone). Staff with no device signed up stay in `V_PPM_ALERT_RECIPIENTS` with `can_notify='N'` and `skip_reason='NO_DEVICE'`, so the job logs a skip instead of failing. Phone numbers are optional and only kept for a possible paid WhatsApp channel later.
- Login is staff ID + password; only a hash is stored. "In charge" rights are never stored: `V_ACTIVE_IN_CHARGE` works them out from today's log and `SESSION_TIMES` (AM 09:00–13:00, PM 13:00–16:30), so they end automatically.

## Data-quality issues found in the current sheets

- Staff: the tracker says **Ranya**, the schedule says **Raniya**. Seeded as Raniya.
- Doctor spelling variants merged: Khaled/Khalid Almane → Dr. Khaled Alamnei (confirmed spelling), Khaled/Khalid Almadhi, Prof. Alobaida/Obaida, Dr. Riaydh/Riyadh, Dr. M. Tamimi → Dr. Mohammed T (assumed).
- `Dr. Noura` with no initial (4 cells) = Dr. Noura H, PG4. `Dr. A. Alriyahi` = Dr. Abdullah R. Both confirmed by the CIC and merged.
- Clinic 1 never appears on any schedule or checklist, so it's seeded as inactive.

## Compliance and appraisals
- `clinic_checklists.checklist_type` is `EQUIPMENT` (equipment daily checklist) or `DISINFECTION` (room disinfection). One row per clinic per month; the CIC ticks it after checking that month's sheet. `v_checklist_compliance` gives the monthly % per type.
- `appraisal_steps` holds each year's 4 milestones and deadlines; `staff_appraisals` holds one row per staff per step, marked done by the CIC. `v_appraisal_status` flags overdue steps (Riyadh date). Staff only ever see their own rows.
