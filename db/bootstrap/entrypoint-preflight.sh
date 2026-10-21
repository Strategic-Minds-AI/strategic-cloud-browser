#!/bin/sh
set -eu

# Do not initialize a persistent Postgres volume with incomplete credentials.
# Do not echo passwords; this script is also used by the CI container.
if [ "${1:-}" = "postgres" ]; then
  [ -n "${POSTGRES_DB:-}" ] || { echo "staging DB name required" >&2; exit 1; }
  [ -n "${POSTGRES_PASSWORD:-}" ] || { echo "staging DB owner password required" >&2; exit 1; }
  [ ${#POSTGRES_PASSWORD} -ge 32 ] || { echo "staging DB owner password too short" >&2; exit 1; }
  [ -n "${CLOUDBROWSER_API_DB_PASSWORD:-}" ] || { echo "restricted API role secret required" >&2; exit 1; }
  [ ${#CLOUDBROWSER_API_DB_PASSWORD} -ge 32 ] || { echo "restricted API role secret too short" >&2; exit 1; }
  if [ "$POSTGRES_PASSWORD" = "$CLOUDBROWSER_API_DB_PASSWORD" ]; then
    echo "API and DB owner credentials must differ" >&2
    exit 1
  fi
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
