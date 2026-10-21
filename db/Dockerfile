FROM postgres:17-alpine

# Build context is always the repository root. The official Postgres entrypoint
# initializes this schema only when the staging data volume is EMPTY.
COPY db/migrations/001_portable_core.sql /docker-entrypoint-initdb.d/010_portable_core.sql
COPY db/migrations/002_secure_api_auth.sql /docker-entrypoint-initdb.d/020_secure_api_auth.sql
COPY db/bootstrap/030-restricted-login.sh /docker-entrypoint-initdb.d/030_restricted_login.sh
COPY db/bootstrap/entrypoint-preflight.sh /usr/local/bin/cloudbrowser-pg-preflight
RUN chmod 0755 /docker-entrypoint-initdb.d/030_restricted_login.sh /usr/local/bin/cloudbrowser-pg-preflight

# Verify all required environment variables before postgres creates PGDATA.
ENTRYPOINT ["/usr/local/bin/cloudbrowser-pg-preflight"]
CMD ["postgres"]
