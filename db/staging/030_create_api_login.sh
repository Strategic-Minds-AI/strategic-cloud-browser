#!/bin/sh
# Executed by the official postgres entrypoint on FIRST database initialization ONLY.
set -eu
: "${CLOUDBROWSER_API_ROLE_PASSWORD:?Staging application role password is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
# \getenv avoids embedding the credential in the process's command-line arguments.
# format(%L) quotes the secret as an SQL string literal, preventing SQL injection.
psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv cb_role_password CLOUDBROWSER_API_ROLE_PASSWORD
SELECT format('CREATE ROLE cloudbrowser_api_login LOGIN PASSWORD %L', :'cb_role_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudbrowser_api_login')
\gexec
GRANT cloudbrowser_api TO cloudbrowser_api_login;
SQL
