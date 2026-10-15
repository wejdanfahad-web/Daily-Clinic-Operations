-- =============================================================================
-- ENDO Clinic System — 05_case_supervisor.sql
-- Run as: ENDO (Database Actions → SQL → Run Script). Safe to run once; adds, never deletes.
-- Adds the "Case Supervisor" (faculty member) to surgery bookings.
-- =============================================================================
ALTER TABLE surgery_bookings ADD (supervisor_doctor_id NUMBER(10));

ALTER TABLE surgery_bookings ADD CONSTRAINT surg_book_sup_fk
  FOREIGN KEY (supervisor_doctor_id) REFERENCES doctors (doctor_id);

CREATE INDEX surg_book_sup_ix ON surgery_bookings (supervisor_doctor_id);

-- Check: should list the new column
SELECT column_name, data_type FROM user_tab_columns
 WHERE table_name = 'SURGERY_BOOKINGS' AND column_name = 'SUPERVISOR_DOCTOR_ID';
