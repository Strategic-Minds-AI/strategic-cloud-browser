#!/bin/sh
set -eu
# Runs only during initial PostgreSQL initialization on a fresh staging volume,
# after 001 and 002. Credentials originate in Railway provider-managed variables.
# psql variable quoting prevents SQL injection from random credential bytes.
: "${CLOUDBROWSER_API_DB_PASSWORD:?missing restricted API database credential}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v cb_login_password="$CLOUDBROWSER_API_DB_PASSWORD" <<'SQL'
CREATE ROLE cloudbrowser_api_login LOGIN INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE cloudbrowser_api_login PASSWORD :'cb_login_password';
GRANT cloudbrowser_api TO cloudbrowser_api_login;
SQL

# Fail installation if role accidentally gains owner/worker privileges.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
     WHERE rolname = 'cloudbrowser_api_login'
       AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)
  ) THEN
    RAISE EXCEPTION 'API login is privileged; abort database initialization';
  END IF;
  IF NOT pg_has_role('cloudbrowser_api_login','cloudbrowser_api','member')
     OR pg_has_role('cloudbrowser_api_login','cloudbrowser_worker','member') THEN
    RAISE EXCEPTION 'API role membership invalid; abort database initialization';
  END IF;
END
$verify$;
SQL
