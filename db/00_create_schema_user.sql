-- =============================================================================
-- ENDO Clinic System — 00_create_schema_user.sql
-- Run as: ADMIN (Oracle Autonomous Database, Always Free)
-- Purpose: create the application schema that owns every ENDO object.
-- Run once. Then connect as ENDO and run 01 → 04 in order.
-- =============================================================================

-- 1. Application schema (change the password before running)
CREATE USER endo IDENTIFIED BY "Change_Me_#2026_Strong";

ALTER USER endo QUOTA UNLIMITED ON data;

GRANT CREATE SESSION,
      CREATE TABLE,
      CREATE VIEW,
      CREATE SEQUENCE,
      CREATE TRIGGER,
      CREATE PROCEDURE,
      CREATE TYPE
TO endo;

-- 2. Lets Database Actions (SQL worksheet) be used as ENDO
BEGIN
  ORDS_ADMIN.ENABLE_SCHEMA(
    p_enabled             => TRUE,
    p_schema              => 'ENDO',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => 'endo',
    p_auto_rest_auth      => TRUE   -- no anonymous AutoREST; Phase 2 defines explicit, secured modules
  );
  COMMIT;
END;
/
