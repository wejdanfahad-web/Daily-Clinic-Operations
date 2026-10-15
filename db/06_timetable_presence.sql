-- =============================================================================
-- ENDO Clinic System — 06_timetable_presence.sql
-- Run as: ENDO (Database Actions → SQL → Run Script). Adds, never deletes.
-- 1. The semester timetable records WHO is present each session; the clinic is optional
--    (the department timetable has no clinic numbers — the CIC places doctors in clinics).
-- 2. DOCTOR_ALIASES remembers how names in uploaded timetables map to doctors
--    (e.g. "Noura Alharbi" → Dr. Noura H). Seeded from the 1 Oct 2026 timetable.
-- =============================================================================
ALTER TABLE doctor_timetable MODIFY (clinic_id NULL);

CREATE TABLE doctor_aliases (
  alias_norm   VARCHAR2(120) NOT NULL,                 -- normalised: lower case, no titles/punctuation
  doctor_id    NUMBER(10)    NOT NULL,
  created_by   VARCHAR2(100) NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT doc_alias_pk     PRIMARY KEY (alias_norm),
  CONSTRAINT doc_alias_doc_fk FOREIGN KEY (doctor_id) REFERENCES doctors (doctor_id)
);
CREATE INDEX doc_alias_doc_ix ON doctor_aliases (doctor_id);

INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'reema albelaihi', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Reema';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'noura alharbi', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Noura H';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'aljohara a saud', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Aljohara';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'basmah alshaiji', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Basmah';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'noura alkhayat', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Noura K';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'noura alaqeel', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Noura A';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'marwa alamoudi', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Marwa';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'nada alturki', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Nada';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'abdullah albaiz', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Abdullah B';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'ghaida binslamah', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Ghaida';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'abdulaziz altwairki', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Abdulaziz';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'muhannad alhugbani', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Muhannad';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'noura alrebdi', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Noura R';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'yazeed assiri', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Yazeed';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'talal alkahlan', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Talal';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'abdulrahman alkhathran', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Abdulrahman K';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'hussain almomen', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Hussain';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'yara alshaibani', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Yara';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'rafal basager', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Rafal';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'asmaa bin humaid', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Asmaa';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'moayad alothman', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Moayad';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'heba amous', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Heba';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'a alkahtany', doctor_id, 'seed' FROM doctors WHERE display_name = 'Prof. Ahmed';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'ziyad allahem', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Ziyad';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'a alriyahi', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Abdullah R';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'anas bahammam', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Anas';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'ibrahim alaugaily', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Ibrahim';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'ahmad zeeshan', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Ahmed Z';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'alaa aldoss', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Alaa';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'm altamimi', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Mohammed T';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'f alsalleeh', doctor_id, 'seed' FROM doctors WHERE display_name = 'Prof. Fahd S';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'husam alfawaz', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Hussam';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'alhadlaq', doctor_id, 'seed' FROM doctors WHERE display_name = 'Prof. Alhadlaq';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'mazen alqahtany', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Mazen';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'alobaida', doctor_id, 'seed' FROM doctors WHERE display_name = 'Prof. Obaida';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'maha alghofaily', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Maha';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'riyadh althumairy', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Riyadh';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'khaled almadi', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Khalid Almadhi';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'abdullah alsuwailem', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Abdullah S';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'muath alshayban', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Muath';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'abdullah alqedairy', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Abdullah Q';
INSERT INTO doctor_aliases (alias_norm, doctor_id, created_by) SELECT 'khaled almane', doctor_id, 'seed' FROM doctors WHERE display_name = 'Dr. Khaled Alamnei';
COMMIT;

-- Check: should show 42 names
SELECT COUNT(*) AS aliases FROM doctor_aliases;
