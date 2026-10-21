# Self-initializing PostgreSQL 17 staging image. Database volume must be empty on first deployment.
# Deploy only to X1 CloudBrowser isolated staging; never reuse a production data volume.
FROM postgres:17-alpine
COPY db/migrations/001_portable_core.sql /docker-entrypoint-initdb.d/010_portable_core.sql
COPY db/migrations/002_secure_api_auth.sql /docker-entrypoint-initdb.d/020_secure_api_auth.sql
COPY db/staging/030_create_api_login.sh /docker-entrypoint-initdb.d/030_create_api_login.sh
RUN chmod 0755 /docker-entrypoint-initdb.d/030_create_api_login.sh
