# X1 CloudBrowser — portable Railway staging deployment (v1)

This is a **source-pinned, reusable staging blueprint**, **not** an official one-click Railway Template. It is safe to copy into another Railway account only after mapping its configuration to a new, isolated staging project. See [staging-manifest-v1.json](./staging-manifest-v1.json). Do not publish credentials, database backups or signed browser profiles.

## Provenance and current snapshot

- Component source: `XTREME-SYSTEMS/cloudbrowser-control`, pinned import `f45e86a651a877bbd9c340e3ebefd65a8167ae5b`.
- Portable destination: `Strategic-Minds-AI/strategic-cloud-browser`, branch `repair/railway-docker-context-20261021`, pinned commit `fb7deb0d1bc976582089bdfc5b168cc0303cac81`.
- On 2026-10-21 Railway had **three services and a 1,024 MB PostgreSQL volume staged, not deployed**. The staged patch contained 37 non-destructive changes.
- Source API and engine Docker images were built in the commit's GitHub Actions release gate. This does **not** prove Railway health or external-account deployability.

## Installation order (safest reusable workflow)

1. Inspect the target workspace/project; select an isolated `staging` environment. Reuse already-staged services and volume rather than creating duplicates.
2. Match the three-service manifest to the target: `cloudbrowser-postgres` (PostgreSQL 17); `cloudbrowser-engine` (root-context Dockerfile); `cloudbrowser-api` (root-context Dockerfile). Pin the exact source commit and start with one replica per service.
3. Verify staging-only secrets and configuration. Database credentials must be new for this project. The engine key must match on API and engine without being disclosed. Set `ENGINE_URL` to the private Railway DNS URL and `DATABASE_URL` to the **least-privileged application role**, not PostgreSQL superuser.
4. Explicitly review `PGDATA` and mounted volume compatibility; never presume database template-generated `DATABASE_URL` exists with a raw `postgres:17-alpine` image.
5. Review deployment plan and billable impact. Obtain target-specific approval before applying a new staged service/volume patch.
6. Apply `db/migrations/001_portable_core.sql` then `db/migrations/002_secure_api_auth.sql` to staging using an approved migration mechanism; create a dedicated `cloudbrowser_api_login` role and grant only required privileges. Capture migration hashes and logs. Never copy production tenant rows.
7. Bootstrap synthetic tenant/API-key fixtures only within staging. Keep the queue consumer/worker OFF, and do not expose browser CDP or the engine publicly.
8. Test staged API and engine /health, negative auth and cross-tenant isolation, session create → navigate → screenshot → close, metadata/localhost/IPv6 SSRF, timeouts, cleanup and idempotency; remove fixtures.
9. Review application logs, resource utilization and operational spend; require a distinct Guardian review and receipt at the **deployed** SHA.
10. Only after explicit separate approval, prepare production placement or any routing changes. Preserve source deployment and rollback state.

## Verified blockers at snapshot

- The staging patch is uncommitted, so **no Railway staging runtime tests have run**.
- The staged API variable **names do not contain `DATABASE_URL`**, while `shared/db.js` requires it for authenticated requests.
- The DB patch shows the image, volume and `POSTGRES_*` inputs but does not establish completed SQL migrations or the dedicated role.
- The isolated test workflow succeeded with a disposable PostgreSQL database and synthetic fixtures; those results are not evidence that the Railway target is functional.

## CI baseline and gates

For the pinned portable commit, GitHub Actions run `39559027872` completed: container build/smoke, PostgreSQL 17 RLS negative test, security audit, browser-engine contract checks, and the full code-quality gate. This verifies **the tested source commit in GitHub Actions**, not deployment.

Before any cutover: `0` critical/high security failures, all mandatory functional gates passing, reproducible locks for API/worker/engine, independent receipt with a separate identity and immutable SHA. Do not self-certify.

## Rollback, duplicate avoidance and handoff

- Existing Railway staged patch remains **uncommitted** until approved. Never delete/recreate it merely because its runtime is not online.
- No worker or cron should start in the new destination before existing canonical X1 leases/fencing tokens are validated.
- Source production must remain untouched. Staging rollback is to stop/remove only the isolated staging resources after authorized confirmation; preserve data until backup/retention is decided.
- Record the destination project/environment/service/deployment IDs, config-diff receipt, migration hashes, costs, Guardian identity and exact next action in the **private** canonical workbook—not in this public repository.
