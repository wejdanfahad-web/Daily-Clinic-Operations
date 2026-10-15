-- =============================================================================
-- ENDO Clinic System — 01_sequences_tables.sql
-- Run as: ENDO
-- Oracle Autonomous Database 19c / 23ai compatible (no 23ai-only syntax).
--
-- Design rules
--   * ASSIGNMENT_LOGS and EQUIPMENT_HISTORY are append-only (enforced in 02).
--     A correction is a NEW row that points at the row it replaces
--     (supersedes_log_id). Nothing is ever updated or deleted.
--   * Staff / doctors / clinics are never deleted: FKs from the logs block it.
--     Deactivate them instead (is_active / employment_status).
--   * All audit timestamps are TIMESTAMP WITH TIME ZONE, set by the database
--     (ADB runs in UTC; views convert to Asia/Riyadh).
--   * Phone numbers are optional (NULL) everywhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sequences
-- -----------------------------------------------------------------------------
CREATE SEQUENCE staff_seq             START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE doctor_seq            START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE equipment_item_seq    START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE equipment_seq         START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE equipment_hist_seq    START WITH 1 INCREMENT BY 1 CACHE 20;
CREATE SEQUENCE assignment_log_seq    START WITH 1 INCREMENT BY 1 CACHE 20;
CREATE SEQUENCE assignment_group_seq  START WITH 1 INCREMENT BY 1 CACHE 20;
CREATE SEQUENCE notification_seq      START WITH 1 INCREMENT BY 1 CACHE 20;
CREATE SEQUENCE report_seq            START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE checklist_seq         START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE push_sub_seq          START WITH 1 INCREMENT BY 1 NOCACHE;

-- -----------------------------------------------------------------------------
-- CLINICS — natural key = the clinic number used on the floor (1–19)
-- -----------------------------------------------------------------------------
CREATE TABLE clinics (
  clinic_id     NUMBER(3)      NOT NULL,
  clinic_name   VARCHAR2(60)   NOT NULL,
  clinic_type   VARCHAR2(15)   DEFAULT 'ENDO' NOT NULL,
  is_active     CHAR(1)        DEFAULT 'Y'    NOT NULL,
  notes         VARCHAR2(400),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at    TIMESTAMP WITH TIME ZONE,
  CONSTRAINT clinics_pk        PRIMARY KEY (clinic_id),
  CONSTRAINT clinics_id_ck     CHECK (clinic_id > 0),
  CONSTRAINT clinics_type_ck   CHECK (clinic_type IN ('ENDO','SURGERY','PEDO','OTHER')),
  CONSTRAINT clinics_active_ck CHECK (is_active IN ('Y','N'))
);

-- -----------------------------------------------------------------------------
-- STAFF — dental assistants (plus the CIC as supervisor)
-- -----------------------------------------------------------------------------
CREATE TABLE staff (
  staff_id           NUMBER(10)    DEFAULT ON NULL staff_seq.NEXTVAL,
  display_name       VARCHAR2(50)  NOT NULL,          -- name as used on the schedule: 'Haifa'
  full_name          VARCHAR2(120),
  employee_no        VARCHAR2(20),
  job_title          VARCHAR2(60)  DEFAULT 'Dental Assistant' NOT NULL,
  staff_type         VARCHAR2(20)  DEFAULT 'DENTAL_ASSISTANT' NOT NULL,  -- decides which duty rotations apply
  home_clinic_id     NUMBER(3),                       -- the "CI" column on the weekly sheet
  phone_e164         VARCHAR2(16),                    -- optional; kept for a possible paid WhatsApp channel later
  whatsapp_opt_in    CHAR(1)       DEFAULT 'N' NOT NULL,
  employment_status  VARCHAR2(15)  DEFAULT 'ACTIVE' NOT NULL,
  is_supervisor      CHAR(1)       DEFAULT 'N' NOT NULL,  -- receives escalation copies of alerts
  -- Login: staff ID (employee_no) + password. Only a hash is stored (bcrypt/argon2, made in the Netlify function).
  app_role           VARCHAR2(10)  DEFAULT 'STAFF' NOT NULL,     -- STAFF | ADMIN (CIC). "In charge" access is derived per session, never stored.
  password_hash      VARCHAR2(200),                    -- NULL = account not set up yet
  must_change_pw     CHAR(1)       DEFAULT 'Y' NOT NULL,          -- first login with the CIC-issued temporary password
  failed_logins      NUMBER(3)     DEFAULT 0 NOT NULL,
  locked_until       TIMESTAMP WITH TIME ZONE,          -- set after 5 wrong attempts
  last_login_at      TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at         TIMESTAMP WITH TIME ZONE,
  CONSTRAINT staff_pk           PRIMARY KEY (staff_id),
  CONSTRAINT staff_empno_uk     UNIQUE (employee_no),
  CONSTRAINT staff_clinic_fk    FOREIGN KEY (home_clinic_id) REFERENCES clinics (clinic_id),
  CONSTRAINT staff_phone_ck     CHECK (phone_e164 IS NULL OR REGEXP_LIKE(phone_e164, '^\+[1-9][0-9]{7,14}$')),
  CONSTRAINT staff_optin_ck     CHECK (whatsapp_opt_in IN ('Y','N')),
  CONSTRAINT staff_status_ck    CHECK (employment_status IN ('ACTIVE','ON_LEAVE','REDEPLOYED','INACTIVE')),
  CONSTRAINT staff_super_ck     CHECK (is_supervisor IN ('Y','N')),
  CONSTRAINT staff_role_ck      CHECK (app_role IN ('STAFF','ADMIN')),
  CONSTRAINT staff_mustpw_ck    CHECK (must_change_pw IN ('Y','N')),
  CONSTRAINT staff_type_ck      CHECK (staff_type IN ('DENTAL_ASSISTANT','STAFF_NURSE','CIC'))
);

CREATE UNIQUE INDEX staff_name_uk  ON staff (UPPER(display_name));
CREATE INDEX        staff_clinic_ix ON staff (home_clinic_id);

-- -----------------------------------------------------------------------------
-- DOCTOR_CATEGORIES — colour-coded training level shown on every schedule chip
--   PG1–PG4 postgraduate, BD1–BD3 board, FC faculty, SP specialist
-- -----------------------------------------------------------------------------
CREATE TABLE doctor_categories (
  category_code  VARCHAR2(5)   NOT NULL,
  category_name  VARCHAR2(40)  NOT NULL,
  chip_bg        VARCHAR2(7)   NOT NULL,                -- chip background colour
  chip_fg        VARCHAR2(7)   NOT NULL,                -- chip text colour
  patient_load   NUMBER(3,2)   DEFAULT 1 NOT NULL,      -- workload weight per clinic with a doctor of this level
  sort_order     NUMBER(3)     DEFAULT 100 NOT NULL,
  CONSTRAINT doc_cat_pk    PRIMARY KEY (category_code),
  CONSTRAINT doc_cat_bg_ck CHECK (REGEXP_LIKE(chip_bg, '^#[0-9A-Fa-f]{6}$')),
  CONSTRAINT doc_cat_fg_ck CHECK (REGEXP_LIKE(chip_fg, '^#[0-9A-Fa-f]{6}$'))
);

-- -----------------------------------------------------------------------------
-- DOCTORS
-- -----------------------------------------------------------------------------
CREATE TABLE doctors (
  doctor_id      NUMBER(10)    DEFAULT ON NULL doctor_seq.NEXTVAL,
  display_name   VARCHAR2(60)  NOT NULL,              -- 'Dr. Noura R', 'Prof. Ahmed'
  full_name      VARCHAR2(120),
  title          VARCHAR2(5)   DEFAULT 'DR' NOT NULL,
  category_code  VARCHAR2(5),                         -- PG1–PG4, BD1–BD3, FC, SP (NULL = not set yet)
  department     VARCHAR2(10)  DEFAULT 'ENDO' NOT NULL,
  max_assistants NUMBER(1)     DEFAULT 1 NOT NULL,    -- assistants allowed per session (Prof. Ahmed = 2)
  is_active      CHAR(1)       DEFAULT 'Y' NOT NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at     TIMESTAMP WITH TIME ZONE,
  CONSTRAINT doctors_maxasst_ck CHECK (max_assistants BETWEEN 1 AND 4),
  CONSTRAINT doctors_pk        PRIMARY KEY (doctor_id),
  CONSTRAINT doctors_title_ck  CHECK (title IN ('DR','PROF')),
  CONSTRAINT doctors_cat_fk    FOREIGN KEY (category_code) REFERENCES doctor_categories (category_code),
  CONSTRAINT doctors_dept_ck   CHECK (department IN ('ENDO','PEDO','OTHER')),
  CONSTRAINT doctors_active_ck CHECK (is_active IN ('Y','N'))
);

CREATE UNIQUE INDEX doctors_name_uk ON doctors (UPPER(display_name));
CREATE INDEX        doctors_cat_ix  ON doctors (category_code);

-- -----------------------------------------------------------------------------
-- ROTATIONS — every fair-share duty that has a "who's next" queue
-- -----------------------------------------------------------------------------
CREATE TABLE rotations (
  rotation_code  VARCHAR2(20)  NOT NULL,
  rotation_name  VARCHAR2(60)  NOT NULL,
  description    VARCHAR2(400),
  eligible_staff_type VARCHAR2(20),                   -- NULL = everyone; else only this staff type
  slots_per_day  NUMBER(2),                           -- auto-generated daily duties (2 for instruments / crash cart)
  skip_if_vitals CHAR(1)       DEFAULT 'N' NOT NULL,  -- 'Y' = never pick someone on AM Vitals that day
  is_active      CHAR(1)       DEFAULT 'Y' NOT NULL,
  sort_order     NUMBER(3)     DEFAULT 100 NOT NULL,
  CONSTRAINT rotations_pk        PRIMARY KEY (rotation_code),
  CONSTRAINT rotations_type_ck   CHECK (eligible_staff_type IS NULL OR eligible_staff_type IN ('DENTAL_ASSISTANT','STAFF_NURSE','CIC')),
  CONSTRAINT rotations_vit_ck    CHECK (skip_if_vitals IN ('Y','N')),
  CONSTRAINT rotations_active_ck CHECK (is_active IN ('Y','N'))
);

-- -----------------------------------------------------------------------------
-- ASSIGNMENT_TYPES — what can appear in a schedule cell
--   category CLINICAL = with a doctor in a clinic
--            SURGERY  = surgery case (yellow on the sheet)
--            DUTY     = non-doctor duty (Vitals, Floater, In charge, Store…)
--            UNAVAILABLE = On leave, SL, excuse, appointment (shown as "Not available")
-- -----------------------------------------------------------------------------
CREATE TABLE assignment_types (
  type_code       VARCHAR2(20)  NOT NULL,
  type_name       VARCHAR2(60)  NOT NULL,
  category        VARCHAR2(12)  NOT NULL,
  needs_doctor    CHAR(1)       DEFAULT 'N' NOT NULL,
  rotation_code   VARCHAR2(20),                       -- feeds this rotation's count
  legend_color    VARCHAR2(7),                        -- '#FFFF00'
  notify_on_assign CHAR(1)      DEFAULT 'N' NOT NULL,
  workload_points NUMBER(4,2)   DEFAULT 0.5 NOT NULL, -- per session, for the workload dashboard (double clinic is scored 2 / triple 3 in the view) -- 'Y' = message the staff member when assigned (e.g. In charge)
  sort_order      NUMBER(3)     DEFAULT 100 NOT NULL,
  is_active       CHAR(1)       DEFAULT 'Y' NOT NULL,
  CONSTRAINT asg_types_pk         PRIMARY KEY (type_code),
  CONSTRAINT asg_types_notify_ck  CHECK (notify_on_assign IN ('Y','N')),
  CONSTRAINT asg_types_rot_fk     FOREIGN KEY (rotation_code) REFERENCES rotations (rotation_code),
  CONSTRAINT asg_types_cat_ck     CHECK (category IN ('CLINICAL','SURGERY','DUTY','UNAVAILABLE')),
  CONSTRAINT asg_types_doc_ck     CHECK (needs_doctor IN ('Y','N')),
  CONSTRAINT asg_types_active_ck  CHECK (is_active IN ('Y','N')),
  CONSTRAINT asg_types_color_ck   CHECK (legend_color IS NULL OR REGEXP_LIKE(legend_color, '^#[0-9A-Fa-f]{6}$'))
);

-- -----------------------------------------------------------------------------
-- ASSIGNMENT_LOGS — PERMANENT, APPEND-ONLY audit of every movement
--   One row = one staff member, one session, at most one doctor + one clinic.
--   A surgery with two doctors, or a double clinic, = two rows that share an
--   assignment_group_id.
--   Corrections: insert action='AMEND' (or 'CANCEL') with supersedes_log_id.
-- -----------------------------------------------------------------------------
CREATE TABLE assignment_logs (
  log_id               NUMBER(12)    DEFAULT ON NULL assignment_log_seq.NEXTVAL,
  assignment_group_id  NUMBER(12)    NOT NULL,        -- set by trigger if not supplied
  action               VARCHAR2(10)  DEFAULT 'ASSIGN' NOT NULL,
  supersedes_log_id    NUMBER(12),
  work_date            DATE          NOT NULL,        -- the clinic day (no time part)
  session_code         VARCHAR2(3)   NOT NULL,        -- AM / PM / DAY (all-day duties)
  staff_id             NUMBER(10)    NOT NULL,
  doctor_id            NUMBER(10),
  clinic_id            NUMBER(3),
  type_code            VARCHAR2(20)  NOT NULL,
  is_surgery           CHAR(1) GENERATED ALWAYS AS
                         (CASE WHEN type_code = 'SURGERY' THEN 'Y' ELSE 'N' END) VIRTUAL,
  notes                VARCHAR2(400),
  source               VARCHAR2(10)  DEFAULT 'WEB' NOT NULL,
  recorded_by          VARCHAR2(100) NOT NULL,        -- who entered it (app login / email)
  recorded_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  client_request_id    VARCHAR2(64),                  -- idempotency key from the web app
  CONSTRAINT asg_logs_pk          PRIMARY KEY (log_id),
  CONSTRAINT asg_logs_staff_fk    FOREIGN KEY (staff_id)  REFERENCES staff (staff_id),
  CONSTRAINT asg_logs_doctor_fk   FOREIGN KEY (doctor_id) REFERENCES doctors (doctor_id),
  CONSTRAINT asg_logs_clinic_fk   FOREIGN KEY (clinic_id) REFERENCES clinics (clinic_id),
  CONSTRAINT asg_logs_type_fk     FOREIGN KEY (type_code) REFERENCES assignment_types (type_code),
  CONSTRAINT asg_logs_super_fk    FOREIGN KEY (supersedes_log_id) REFERENCES assignment_logs (log_id),
  CONSTRAINT asg_logs_action_ck   CHECK (action IN ('ASSIGN','AMEND','CANCEL')),
  CONSTRAINT asg_logs_chain_ck    CHECK ( (action = 'ASSIGN' AND supersedes_log_id IS NULL)
                                       OR (action IN ('AMEND','CANCEL') AND supersedes_log_id IS NOT NULL) ),
  CONSTRAINT asg_logs_session_ck  CHECK (session_code IN ('AM','PM','DAY')),
  CONSTRAINT asg_logs_date_ck     CHECK (work_date = TRUNC(work_date)),
  CONSTRAINT asg_logs_source_ck   CHECK (source IN ('WEB','IMPORT','API','SYSTEM')),
  CONSTRAINT asg_logs_request_uk  UNIQUE (client_request_id),
  -- a row can be replaced only once → history is a clean chain, never a fork
  CONSTRAINT asg_logs_super_uk    UNIQUE (supersedes_log_id)
);

CREATE INDEX asg_logs_date_ix    ON assignment_logs (work_date, session_code);
CREATE INDEX asg_logs_staff_ix   ON assignment_logs (staff_id, work_date);
CREATE INDEX asg_logs_doctor_ix  ON assignment_logs (doctor_id, work_date);
CREATE INDEX asg_logs_clinic_ix  ON assignment_logs (clinic_id, work_date);
CREATE INDEX asg_logs_type_ix    ON assignment_logs (type_code, work_date);
CREATE INDEX asg_logs_group_ix   ON assignment_logs (assignment_group_id);

-- -----------------------------------------------------------------------------
-- ROTATION_BASELINE — opening balances carried over from the Excel tracker,
-- so the queue does not restart from zero. Events after as_of_date add on top.
-- -----------------------------------------------------------------------------
CREATE TABLE rotation_baseline (
  staff_id           NUMBER(10)   NOT NULL,
  rotation_code      VARCHAR2(20) NOT NULL,
  opening_count      NUMBER(5)    DEFAULT 0 NOT NULL,
  opening_last_date  DATE,
  as_of_date         DATE         NOT NULL,
  CONSTRAINT rot_base_pk       PRIMARY KEY (staff_id, rotation_code),
  CONSTRAINT rot_base_staff_fk FOREIGN KEY (staff_id)      REFERENCES staff (staff_id),
  CONSTRAINT rot_base_rot_fk   FOREIGN KEY (rotation_code) REFERENCES rotations (rotation_code),
  CONSTRAINT rot_base_cnt_ck   CHECK (opening_count >= 0)
);

-- -----------------------------------------------------------------------------
-- STAFF_ROTATION_ELIGIBILITY — exceptions only. No row = eligible.
-- e.g. a staff member not trained for surgery, or the CIC.
-- -----------------------------------------------------------------------------
CREATE TABLE staff_rotation_eligibility (
  staff_id       NUMBER(10)    NOT NULL,
  rotation_code  VARCHAR2(20)  NOT NULL,
  is_eligible    CHAR(1)       DEFAULT 'N' NOT NULL,
  reason         VARCHAR2(200),
  CONSTRAINT rot_elig_pk       PRIMARY KEY (staff_id, rotation_code),
  CONSTRAINT rot_elig_staff_fk FOREIGN KEY (staff_id)      REFERENCES staff (staff_id),
  CONSTRAINT rot_elig_rot_fk   FOREIGN KEY (rotation_code) REFERENCES rotations (rotation_code),
  CONSTRAINT rot_elig_flag_ck  CHECK (is_eligible IN ('Y','N'))
);

-- -----------------------------------------------------------------------------
-- EQUIPMENT_CATALOG — what an item is (machine / instrument / consumable)
-- -----------------------------------------------------------------------------
CREATE TABLE equipment_catalog (
  item_id              NUMBER(10)    DEFAULT ON NULL equipment_item_seq.NEXTVAL,
  item_name            VARCHAR2(120) NOT NULL,
  item_kind            VARCHAR2(12)  NOT NULL,
  requires_ppm         CHAR(1)       DEFAULT 'N' NOT NULL,
  ppm_interval_months  NUMBER(3),                     -- if set, due date auto-fills from last PPM
  manufacturer         VARCHAR2(80),
  model                VARCHAR2(80),
  is_active            CHAR(1)       DEFAULT 'Y' NOT NULL,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at           TIMESTAMP WITH TIME ZONE,
  CONSTRAINT eq_cat_pk        PRIMARY KEY (item_id),
  CONSTRAINT eq_cat_kind_ck   CHECK (item_kind IN ('MACHINE','INSTRUMENT','CONSUMABLE')),
  CONSTRAINT eq_cat_ppm_ck    CHECK (requires_ppm IN ('Y','N')),
  CONSTRAINT eq_cat_int_ck    CHECK (ppm_interval_months IS NULL OR ppm_interval_months BETWEEN 1 AND 120),
  CONSTRAINT eq_cat_active_ck CHECK (is_active IN ('Y','N'))
);

CREATE UNIQUE INDEX eq_cat_name_uk ON equipment_catalog (UPPER(item_name));

-- -----------------------------------------------------------------------------
-- EQUIPMENT_PPM — what is physically in each clinic, with quantity and PPM
--   Machines: usually one row per asset tag (quantity 1).
--   Instruments: one row per item per clinic with a quantity.
-- -----------------------------------------------------------------------------
CREATE TABLE equipment_ppm (
  equipment_id            NUMBER(10)   DEFAULT ON NULL equipment_seq.NEXTVAL,
  clinic_id               NUMBER(3)    NOT NULL,
  item_id                 NUMBER(10)   NOT NULL,
  asset_tag               VARCHAR2(40),               -- biomedical / asset tag number
  serial_no               VARCHAR2(60),
  quantity                NUMBER(5)    DEFAULT 1 NOT NULL,
  par_level               NUMBER(5),                  -- expected minimum; below = flagged
  condition_status        VARCHAR2(15) DEFAULT 'IN_SERVICE' NOT NULL,
  last_ppm_date           DATE,
  ppm_due_date            DATE,
  last_verified_by        NUMBER(10),                 -- staff who last confirmed the entry
  last_verified_at        TIMESTAMP WITH TIME ZONE,
  updated_by              VARCHAR2(100),              -- set by the API on every change
  notes                   VARCHAR2(400),
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at              TIMESTAMP WITH TIME ZONE,
  CONSTRAINT eq_ppm_pk         PRIMARY KEY (equipment_id),
  CONSTRAINT eq_ppm_clinic_fk  FOREIGN KEY (clinic_id)        REFERENCES clinics (clinic_id),
  CONSTRAINT eq_ppm_item_fk    FOREIGN KEY (item_id)          REFERENCES equipment_catalog (item_id),
  CONSTRAINT eq_ppm_staff_fk   FOREIGN KEY (last_verified_by) REFERENCES staff (staff_id),
  CONSTRAINT eq_ppm_tag_uk     UNIQUE (asset_tag),
  CONSTRAINT eq_ppm_qty_ck     CHECK (quantity >= 0),
  CONSTRAINT eq_ppm_par_ck     CHECK (par_level IS NULL OR par_level >= 0),
  CONSTRAINT eq_ppm_status_ck  CHECK (condition_status IN ('IN_SERVICE','OUT_OF_SERVICE','UNDER_REPAIR','RETIRED')),
  CONSTRAINT eq_ppm_dates_ck   CHECK (ppm_due_date IS NULL OR last_ppm_date IS NULL OR ppm_due_date >= last_ppm_date)
);

-- one untagged line per item per clinic; tagged machines can repeat per clinic
CREATE UNIQUE INDEX eq_ppm_line_uk  ON equipment_ppm (clinic_id, item_id, NVL(asset_tag, '#UNTAGGED#'));
CREATE INDEX        eq_ppm_item_ix  ON equipment_ppm (item_id);
CREATE INDEX        eq_ppm_due_ix   ON equipment_ppm (condition_status, ppm_due_date);
CREATE INDEX        eq_ppm_staff_ix ON equipment_ppm (last_verified_by);

-- -----------------------------------------------------------------------------
-- EQUIPMENT_HISTORY — append-only trail of quantity / PPM / status changes
-- (written automatically by trigger; never by the app)
-- -----------------------------------------------------------------------------
CREATE TABLE equipment_history (
  hist_id             NUMBER(12)    DEFAULT ON NULL equipment_hist_seq.NEXTVAL,
  equipment_id        NUMBER(10)    NOT NULL,
  change_type         VARCHAR2(10)  NOT NULL,
  old_quantity        NUMBER(5),
  new_quantity        NUMBER(5),
  old_last_ppm_date   DATE,
  new_last_ppm_date   DATE,
  old_ppm_due_date    DATE,
  new_ppm_due_date    DATE,
  old_status          VARCHAR2(15),
  new_status          VARCHAR2(15),
  changed_by          VARCHAR2(100),
  changed_at          TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT eq_hist_pk      PRIMARY KEY (hist_id),
  CONSTRAINT eq_hist_eq_fk   FOREIGN KEY (equipment_id) REFERENCES equipment_ppm (equipment_id),
  CONSTRAINT eq_hist_type_ck CHECK (change_type IN ('INSERT','UPDATE'))
);

CREATE INDEX eq_hist_eq_ix ON equipment_history (equipment_id, changed_at);

-- -----------------------------------------------------------------------------
-- NOTIFICATION_LOG — every alert attempt, INCLUDING ones skipped for a NULL
-- phone or with notifications switched off, so nothing silently disappears and
-- nightly runs never double-send.
-- -----------------------------------------------------------------------------
CREATE TABLE notification_log (
  notification_id    NUMBER(12)     DEFAULT ON NULL notification_seq.NEXTVAL,
  channel            VARCHAR2(10)   DEFAULT 'PUSH' NOT NULL,
  event_type         VARCHAR2(20)   NOT NULL,
  staff_id           NUMBER(10),
  recipient          VARCHAR2(120),                   -- device / address used at send time (NULL if skipped)
  equipment_id       NUMBER(10),
  assignment_log_id  NUMBER(12),
  dedupe_key         VARCHAR2(200)  NOT NULL,         -- e.g. PPM_DUE:EQ12:2026-10-20:ST5:2026-10-14
  status             VARCHAR2(20)   DEFAULT 'PENDING' NOT NULL,
  provider           VARCHAR2(20),                    -- TWILIO / ULTRAMSG
  provider_msg_id    VARCHAR2(100),
  message_body       VARCHAR2(1600),
  error_message      VARCHAR2(1000),
  created_at         TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  sent_at            TIMESTAMP WITH TIME ZONE,
  CONSTRAINT notif_pk          PRIMARY KEY (notification_id),
  CONSTRAINT notif_staff_fk    FOREIGN KEY (staff_id)          REFERENCES staff (staff_id),
  CONSTRAINT notif_eq_fk       FOREIGN KEY (equipment_id)      REFERENCES equipment_ppm (equipment_id),
  CONSTRAINT notif_asg_fk      FOREIGN KEY (assignment_log_id) REFERENCES assignment_logs (log_id),
  CONSTRAINT notif_dedupe_uk   UNIQUE (dedupe_key),
  CONSTRAINT notif_channel_ck  CHECK (channel IN ('PUSH','EMAIL','WHATSAPP','SMS')),
  CONSTRAINT notif_event_ck    CHECK (event_type IN ('PPM_DUE','PPM_OVERDUE','LOW_STOCK','SCHEDULE_CHANGE',
                                                     'IN_CHARGE','IN_CHARGE_SUMMARY','DAILY_DUTY','SURGERY_BOOKED','MONTHLY_REPORT')),
  CONSTRAINT notif_status_ck   CHECK (status IN ('PENDING','SENT','SKIPPED_NO_DEVICE','SKIPPED_NO_PHONE',
                                                 'SKIPPED_OPT_OUT','FAILED'))
);

CREATE INDEX notif_status_ix ON notification_log (status, created_at);
CREATE INDEX notif_staff_ix  ON notification_log (staff_id, created_at);
CREATE INDEX notif_eq_ix     ON notification_log (equipment_id);
CREATE INDEX notif_asg_ix    ON notification_log (assignment_log_id);

-- -----------------------------------------------------------------------------
-- MONTHLY_REPORTS — snapshot written by the 1st-of-month job
-- -----------------------------------------------------------------------------
CREATE TABLE monthly_reports (
  report_id      NUMBER(10)    DEFAULT ON NULL report_seq.NEXTVAL,
  report_month   DATE          NOT NULL,              -- first day of the month reported on
  report_json    CLOB          NOT NULL,
  generated_by   VARCHAR2(100) DEFAULT 'monthly-report-cron' NOT NULL,
  generated_at   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT mreports_pk       PRIMARY KEY (report_id),
  CONSTRAINT mreports_month_uk UNIQUE (report_month),
  CONSTRAINT mreports_month_ck CHECK (report_month = TRUNC(report_month, 'MM')),
  CONSTRAINT mreports_json_ck  CHECK (report_json IS JSON)
);

-- -----------------------------------------------------------------------------
-- CLINIC_CHECKLISTS — replaces the "DAILY CHECKLISTS" submission tracker.
-- One row per clinic × checklist type × month. The CIC ticks the box once she has
-- checked that month's sheet: EQUIPMENT = equipment daily checklist,
-- DISINFECTION = room disinfection compliance.
-- -----------------------------------------------------------------------------
CREATE TABLE clinic_checklists (
  checklist_id      NUMBER(10)   DEFAULT ON NULL checklist_seq.NEXTVAL,
  clinic_id         NUMBER(3)    NOT NULL,
  checklist_type    VARCHAR2(12) DEFAULT 'EQUIPMENT' NOT NULL,
  period_type       VARCHAR2(7)  NOT NULL,
  period_start      DATE         NOT NULL,
  is_submitted      CHAR(1)      DEFAULT 'N' NOT NULL,
  submitted_by      NUMBER(10),                 -- the CIC who ticked it
  submitted_at      TIMESTAMP WITH TIME ZONE,
  notes             VARCHAR2(400),
  CONSTRAINT chk_pk         PRIMARY KEY (checklist_id),
  CONSTRAINT chk_clinic_fk  FOREIGN KEY (clinic_id)    REFERENCES clinics (clinic_id),
  CONSTRAINT chk_staff_fk   FOREIGN KEY (submitted_by) REFERENCES staff (staff_id),
  CONSTRAINT chk_period_uk  UNIQUE (clinic_id, checklist_type, period_type, period_start),
  CONSTRAINT chk_kind_ck    CHECK (checklist_type IN ('EQUIPMENT','DISINFECTION')),
  CONSTRAINT chk_type_ck    CHECK (period_type IN ('MONTH','QUARTER')),
  CONSTRAINT chk_start_ck   CHECK ( (period_type = 'MONTH'   AND period_start = TRUNC(period_start, 'MM'))
                                 OR (period_type = 'QUARTER' AND period_start = TRUNC(period_start, 'Q')) ),
  CONSTRAINT chk_flag_ck    CHECK (is_submitted IN ('Y','N'))
);

CREATE INDEX chk_staff_ix ON clinic_checklists (submitted_by);

-- -----------------------------------------------------------------------------
-- SESSION_TIMES — clinic session windows (Riyadh time). Used for the temporary
-- "In charge" access and the end-of-session summary to the CIC.
-- -----------------------------------------------------------------------------
CREATE TABLE session_times (
  session_code  VARCHAR2(3)  NOT NULL,
  starts_at     VARCHAR2(5)  NOT NULL,                  -- 'HH24:MI'
  ends_at       VARCHAR2(5)  NOT NULL,
  CONSTRAINT session_times_pk    PRIMARY KEY (session_code),
  CONSTRAINT session_times_ck    CHECK (session_code IN ('AM','PM')),
  CONSTRAINT session_times_fmt   CHECK (REGEXP_LIKE(starts_at, '^[0-2][0-9]:[0-5][0-9]$') AND REGEXP_LIKE(ends_at, '^[0-2][0-9]:[0-5][0-9]$')),
  CONSTRAINT session_times_order CHECK (ends_at > starts_at)
);

-- -----------------------------------------------------------------------------
-- PUSH_SUBSCRIPTIONS — free web-push notifications. One row per phone/browser a
-- staff member allowed notifications on (the dashboard installed as an app).
-- -----------------------------------------------------------------------------
CREATE TABLE push_subscriptions (
  subscription_id  NUMBER(10)     DEFAULT ON NULL push_sub_seq.NEXTVAL,
  staff_id         NUMBER(10)     NOT NULL,
  endpoint         VARCHAR2(1000) NOT NULL,             -- push service URL for that device
  p256dh_key       VARCHAR2(200)  NOT NULL,
  auth_key         VARCHAR2(100)  NOT NULL,
  device_label     VARCHAR2(100),                       -- e.g. 'iPhone · Safari'
  is_active        CHAR(1)        DEFAULT 'Y' NOT NULL, -- set 'N' when the push service reports it expired
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  last_success_at  TIMESTAMP WITH TIME ZONE,
  CONSTRAINT push_sub_pk       PRIMARY KEY (subscription_id),
  CONSTRAINT push_sub_staff_fk FOREIGN KEY (staff_id) REFERENCES staff (staff_id),
  CONSTRAINT push_sub_active_ck CHECK (is_active IN ('Y','N')),
  CONSTRAINT push_sub_endpoint_uk UNIQUE (endpoint)
);

CREATE INDEX        push_sub_staff_ix    ON push_subscriptions (staff_id, is_active);

-- =============================================================================
-- PLANNING: semester timetable → auto-planned daily drafts → publish to the log
-- =============================================================================
CREATE SEQUENCE semester_seq     START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE timetable_seq    START WITH 1 INCREMENT BY 1 CACHE 20;
CREATE SEQUENCE staff_leave_seq  START WITH 1 INCREMENT BY 1 NOCACHE;

-- One row per uploaded semester timetable
CREATE TABLE semesters (
  semester_id    NUMBER(10)    DEFAULT ON NULL semester_seq.NEXTVAL,
  semester_name  VARCHAR2(80)  NOT NULL,                -- e.g. 'First semester 2026-27'
  starts_on      DATE          NOT NULL,
  ends_on        DATE          NOT NULL,
  source_file    VARCHAR2(200),                         -- uploaded file name
  uploaded_by    VARCHAR2(100) NOT NULL,
  uploaded_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  confirmed_at   TIMESTAMP WITH TIME ZONE,              -- NULL = captured but not yet confirmed by the CIC
  CONSTRAINT semesters_pk       PRIMARY KEY (semester_id),
  CONSTRAINT semesters_dates_ck CHECK (ends_on >= starts_on)
);

-- Which doctor is in which clinic, each weekday and session, for a semester
CREATE TABLE doctor_timetable (
  timetable_id   NUMBER(12)   DEFAULT ON NULL timetable_seq.NEXTVAL,
  semester_id    NUMBER(10)   NOT NULL,
  doctor_id      NUMBER(10)   NOT NULL,
  weekday        NUMBER(1)    NOT NULL,                 -- 0 = Sunday … 4 = Thursday
  session_code   VARCHAR2(3)  NOT NULL,
  clinic_id      NUMBER(3)    NOT NULL,
  CONSTRAINT doc_tt_pk        PRIMARY KEY (timetable_id),
  CONSTRAINT doc_tt_sem_fk    FOREIGN KEY (semester_id) REFERENCES semesters (semester_id),
  CONSTRAINT doc_tt_doc_fk    FOREIGN KEY (doctor_id)   REFERENCES doctors (doctor_id),
  CONSTRAINT doc_tt_clinic_fk FOREIGN KEY (clinic_id)   REFERENCES clinics (clinic_id),
  CONSTRAINT doc_tt_day_ck    CHECK (weekday BETWEEN 0 AND 4),
  CONSTRAINT doc_tt_sess_ck   CHECK (session_code IN ('AM','PM')),
  -- a doctor normally has one clinic per session; a doctor allowed 2 assistants can have 2 rows
  CONSTRAINT doc_tt_doc_uk    UNIQUE (semester_id, doctor_id, weekday, session_code, clinic_id)
);
CREATE INDEX doc_tt_slot_ix ON doctor_timetable (semester_id, weekday, session_code, clinic_id);

-- Planned leave entered ahead of time (auto-fills "On leave" in drafts)
CREATE TABLE staff_leave (
  leave_id       NUMBER(10)    DEFAULT ON NULL staff_leave_seq.NEXTVAL,
  staff_id       NUMBER(10)    NOT NULL,
  from_date      DATE          NOT NULL,
  to_date        DATE          NOT NULL,
  session_code   VARCHAR2(3),                           -- NULL = whole day
  type_code      VARCHAR2(20)  DEFAULT 'ON_LEAVE' NOT NULL,
  notes          VARCHAR2(200),
  entered_by     VARCHAR2(100) NOT NULL,
  entered_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT staff_leave_pk       PRIMARY KEY (leave_id),
  CONSTRAINT staff_leave_staff_fk FOREIGN KEY (staff_id)  REFERENCES staff (staff_id),
  CONSTRAINT staff_leave_type_fk  FOREIGN KEY (type_code) REFERENCES assignment_types (type_code),
  CONSTRAINT staff_leave_dates_ck CHECK (to_date >= from_date),
  CONSTRAINT staff_leave_sess_ck  CHECK (session_code IS NULL OR session_code IN ('AM','PM'))
);
CREATE INDEX staff_leave_ix ON staff_leave (staff_id, from_date, to_date);

-- A day's plan before it is published. Only the CIC sees drafts.
-- Publishing writes one ASSIGNMENT_LOGS row per assignment and stamps published_at.
CREATE TABLE schedule_drafts (
  work_date      DATE          NOT NULL,
  draft_json     CLOB          NOT NULL,                -- { "Haifa": { "AM": [...], "PM": [...] }, ... }
  status         VARCHAR2(10)  DEFAULT 'DRAFT' NOT NULL,
  updated_by     VARCHAR2(100) NOT NULL,
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  published_by   VARCHAR2(100),
  published_at   TIMESTAMP WITH TIME ZONE,
  CONSTRAINT sched_drafts_pk     PRIMARY KEY (work_date),
  CONSTRAINT sched_drafts_date_ck CHECK (work_date = TRUNC(work_date)),
  CONSTRAINT sched_drafts_json_ck CHECK (draft_json IS JSON),
  CONSTRAINT sched_drafts_stat_ck CHECK (status IN ('DRAFT','PUBLISHED'))
);

-- -----------------------------------------------------------------------------
-- SURGERY_BOOKINGS — doctors book upcoming surgeries from the public page.
-- No patient details are stored here (they stay in the hospital's own systems).
-- The CIC is notified (push + email) and assigns an assistant from the surgery queue;
-- the assignment itself is written to ASSIGNMENT_LOGS as type SURGERY.
-- -----------------------------------------------------------------------------
CREATE SEQUENCE surgery_booking_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE surgery_bookings (
  booking_id         NUMBER(10)    DEFAULT ON NULL surgery_booking_seq.NEXTVAL,
  doctor_id          NUMBER(10)    NOT NULL,          -- operator
  assisting_doctor_id NUMBER(10)   NOT NULL,          -- "Assisted by" (every surgery has 2 operators)
  work_date          DATE          NOT NULL,
  session_code       VARCHAR2(3)   NOT NULL,
  note               VARCHAR2(120),                     -- procedure / equipment only, never patient details
  status             VARCHAR2(10)  DEFAULT 'NEW' NOT NULL,
  assignment_log_id  NUMBER(12),                        -- set when the CIC assigns an assistant
  submitted_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  seen_at            TIMESTAMP WITH TIME ZONE,
  CONSTRAINT surg_book_pk      PRIMARY KEY (booking_id),
  CONSTRAINT surg_book_doc_fk  FOREIGN KEY (doctor_id)         REFERENCES doctors (doctor_id),
  CONSTRAINT surg_book_asst_fk FOREIGN KEY (assisting_doctor_id) REFERENCES doctors (doctor_id),
  CONSTRAINT surg_book_two_ck  CHECK (assisting_doctor_id <> doctor_id),
  CONSTRAINT surg_book_log_fk  FOREIGN KEY (assignment_log_id) REFERENCES assignment_logs (log_id),
  CONSTRAINT surg_book_date_ck CHECK (work_date = TRUNC(work_date)),
  CONSTRAINT surg_book_sess_ck CHECK (session_code IN ('AM','PM')),
  CONSTRAINT surg_book_stat_ck CHECK (status IN ('NEW','SEEN','ASSIGNED','CANCELLED'))
);
CREATE INDEX surg_book_date_ix ON surgery_bookings (work_date, status);
-- a doctor can't book the same session twice (cancelled bookings don't count)
CREATE UNIQUE INDEX surg_book_doc_uk ON surgery_bookings (
  CASE WHEN status <> 'CANCELLED' THEN doctor_id END,
  CASE WHEN status <> 'CANCELLED' THEN work_date END,
  CASE WHEN status <> 'CANCELLED' THEN session_code END);
-- Checked by the booking API inside the same transaction (SELECT ... FOR UPDATE on the
-- day's bookings) before inserting: max 2 surgeries per session, max 3 per day (the
-- instrument sets don't cover more), and neither doctor
-- may already be operating or assisting in another surgery that session.
CREATE INDEX surg_book_doc_ix  ON surgery_bookings (doctor_id);
CREATE INDEX surg_book_asst_ix ON surgery_bookings (assisting_doctor_id);
CREATE INDEX surg_book_log_ix  ON surgery_bookings (assignment_log_id);

-- -----------------------------------------------------------------------------
-- APPRAISAL_STEPS — the yearly performance appraisal milestones and deadlines
-- (CIC can change deadlines each year).
-- STAFF_APPRAISALS — one row per staff × year × step; the CIC marks steps done.
-- Staff can read only their own rows (enforced in the API).
-- -----------------------------------------------------------------------------
CREATE TABLE appraisal_steps (
  appraisal_year    NUMBER(4)     NOT NULL,
  step_no           NUMBER(1)     NOT NULL,
  step_name         VARCHAR2(60)  NOT NULL,
  due_date          DATE          NOT NULL,
  CONSTRAINT apstep_pk     PRIMARY KEY (appraisal_year, step_no),
  CONSTRAINT apstep_no_ck  CHECK (step_no BETWEEN 1 AND 9)
);

CREATE SEQUENCE appraisal_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE staff_appraisals (
  appraisal_id      NUMBER(10)    DEFAULT ON NULL appraisal_seq.NEXTVAL,
  staff_id          NUMBER(10)    NOT NULL,
  appraisal_year    NUMBER(4)     NOT NULL,
  step_no           NUMBER(1)     NOT NULL,
  is_done           CHAR(1)       DEFAULT 'N' NOT NULL,
  done_on           DATE,
  marked_by         NUMBER(10),
  marked_at         TIMESTAMP WITH TIME ZONE,
  notes             VARCHAR2(400),
  CONSTRAINT appr_pk        PRIMARY KEY (appraisal_id),
  CONSTRAINT appr_staff_fk  FOREIGN KEY (staff_id)  REFERENCES staff (staff_id),
  CONSTRAINT appr_mark_fk   FOREIGN KEY (marked_by) REFERENCES staff (staff_id),
  CONSTRAINT appr_step_fk   FOREIGN KEY (appraisal_year, step_no) REFERENCES appraisal_steps (appraisal_year, step_no),
  CONSTRAINT appr_uk        UNIQUE (staff_id, appraisal_year, step_no),
  CONSTRAINT appr_flag_ck   CHECK (is_done IN ('Y','N'))
);
CREATE INDEX appr_step_ix ON staff_appraisals (appraisal_year, step_no);
CREATE INDEX appr_mark_ix ON staff_appraisals (marked_by);
