# CloudBrowser Chromium sandbox — isolated candidate (not deployed)
Date: 2026-10-21. Mission: X1-INFINITY-MAXIMUM-PARALLEL-CONTINUOUS-EXECUTION-001.

## Scope
Source baseline fb7deb0d1bc976582089bdfc5b168cc0303cac81.
Branch security/cloudbrowser-sandbox-isolation-20261021.
- Run browser engine under the unprivileged node user with browser binaries in an owned directory.
- Explicitly request Playwright chromiumSandbox on every Chromium launch path.
- Remove --no-sandbox and --disable-setuid-sandbox bypass flags.
- Keep existing API auth, CORS, outbound network policy, isolated worker and session controls.
- Static source/CI checks are not evidence that the Linux kernel supports Chromium namespaces.

## Critical deployment prerequisites
Playwright documents that untrusted crawling needs non-root execution and an appropriate seccomp profile allowing user namespaces. Railway may not offer the required seccomp/user-namespace configuration for this environment; verify the actual provider runtime restrictions BEFORE deploying this candidate. If Chromium cannot launch with sandboxing enabled, leave the existing staging deployment unchanged and assess supported infrastructure alternatives. Do not quietly restore no-sandbox or weaken auth to make a smoke test pass.
Reference: https://playwright.dev/docs/docker and https://playwright.dev/docs/api/class-browsertype

## Staging acceptance
- [ ] CI source contract, lockfile and syntax checks pass at exact SHA.
- [ ] Docker image builds with no root runtime and approved base image.
- [ ] Runtime container UID check plus read/write directories audited.
- [ ] Real Chromium launch succeeds with sandbox and secured seccomp restrictions.
- [ ] Untrusted URL SSRF/metadata IP denial and DNS rebinding controls pass.
- [ ] Session create/navigate/screenshot/console/delete under valid auth.
- [ ] Unauthorized request/tenant and missing key fail closed.
- [ ] Independent Guardian retrieves actual CI/browser artifacts and attests exact SHA.
- [ ] Owner approves any Railway staging deployment, billing or secret changes.
Rollback: discard isolated branch; Railway patch untouched.
