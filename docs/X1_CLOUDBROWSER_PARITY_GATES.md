# X1 CloudBrowser — parity and release gates (2026-10-23)

## Benchmark and target
Benchmark: the user's connected Base44 CloudBrowser app, canonical `base44/functions/mcpGateway/entry.ts` (observed source 2026-10-23). It has project-scoped API keys or administrator-session authentication, session lifecycle, navigation, DOM/accessibility observation, interaction, screenshot, text/links/table extraction, console/network/error inspection, tabs, contexts, jobs, receipts and approval-gated test actions. A listed handler or advertised MCP tool is **not proof the deployed browser succeeds**.

Target: X1 should be as capable for common approved customer jobs, and safer by default. Do not copy hidden credentials, bypass CAPTCHAs, enable arbitrary JavaScript evaluation or turn off Chromium sandbox in pursuit of parity.

## Current X1 source parity (source = draft PR #6; hosted verification separate)

| Capability | Existing CloudBrowser source | X1 source after draft PR #6 | Hosted X1 gate |
| --- | --- | --- | --- |
| Authenticated session start/end | Implemented | API and engine routes implemented | BLOCKED (host + MCP 401) |
| Navigation, reload, back/forward | Implemented | Implemented, SSRF check and redirect guard | NOT RUN |
| Click, hover, type, fill, press | Implemented | Implemented through bounded API action validator | NOT RUN |
| Dropdowns, scrolling, selector waits | Implemented | Implemented through bounded API action validator | NOT RUN |
| Screenshot, text and HTML extraction | Implemented | Implemented and covered by disposable CI | NOT RUN |
| Table extraction, page-load waits | Implemented | Implemented through bounded API action validator | NOT RUN |
| DOM/accessibility observation | Implemented | Partial engine internals, no full public parity | GAP |
| Tabs, persistent auth context, replay | Implemented | Partial engine internals, no safe public API parity | GAP |
| Console/network/error telemetry | Implemented | Engine captures logs, API does not expose full safe parity | GAP |
| Jobs and tenant-scope isolation | Implemented | Implemented in PostgreSQL-backed API/CI | HOST NOT VERIFIED |
| Receipts / approvals | Implemented | Incomplete full end-to-end hosted evidence | GAP |
| MCP ChatGPT bridge | Connected tool present | Original app gateway returns HTTP 401; not connected to X1 secure API | BLOCKED |
| Non-root Chromium sandbox | Not established by source benchmark | Mandatory source canary; hosted guarded engine deployments FAILED | FAIL |
| DNS/SSRF and network egress | Mixed source policies | Initial/redirect URL and DNS preflight; socket-level egress must be verified separately | BLOCKED |
| Independent release certification | Not assumed | No signed Guardian receipt for hosted exact SHA | BLOCKED |

**Current verdict: PARTIAL SOURCE PARITY, HOSTED RELEASE BLOCKED.** No invented quantitative scores or customer-ready assertions.

## Safe feature exposure
The public API uses `api/lib/browser-action-policy.js`. It permits only bounded `goto`, `back`, `forward`, `reload`, `wait_for_selector`, `wait_for_load_state`, `click`, `hover`, `type`, `fill`, `press`, `select_option`, `scroll`, `extract_text`, `extract_html`, `extract_attribute`, `extract_table`, `screenshot`. The API requires tenant ownership and `sessions:write`. Higher risk internal actions are intentionally not exposed.

The X1 engine `/readiness` will report `security.sandbox = required` and `security.non_root = true` only after actually launching Chromium with its sandbox enabled on non-root user, including a local `about:blank` canary. Before starting any client session, the X1 API requires that readiness contract; older unsandboxed engines fail closed. This is **not a cryptographic host attestation**, nor a substitute for a secure VM or network egress policy.

## Release checklist (all applicable hard gates mandatory)
1. **Authenticated Railway account**: reconnect/project-authorize the `strategic-minds-ai` Railway account to staging project `efc36e26-1f26-47bf-bc74-b81d95e8f262`. As of 2026-10-23 current Railway connector resolves to `xps-admin` (not the earlier account) and reports insufficient viewer rights. Never copy credentials between accounts.
2. **Approved security host**: use already available validated isolated host, or separate cost authorization for metered VM. Chromium `chromiumSandbox:true`, non-root, no `--no-sandbox`; verify user namespaces and kernel isolation. No weakened fallback.
3. **Runtime network policy**: deny RFC1918/link-local/metadata, IPv6 private, DNS rebinding and redirected requests at connection boundary as well as URL parser. Verify real blocked outbound requests. Deny unapproved WebSockets.
4. **Private auth bridge**: connect a least-privilege staging-only token/OAuth route server-side to actual ChatGPT CloudBrowser gateway. No public API key, client-side secret or bypass of 401.
5. **Live two-tenant canary**: create A/B sessions; navigate allowlisted public synthetic target, observe text, click/type/fill, screenshot, verify tenant B cannot read A, deny private IPs and unsafe actions, capture console/network and close both sessions.
6. **Reliability**: enforce concurrency caps, bounded retries, timeouts, receipts, no leaked sessions, rollback evidence; compare success, latency and resource cost only from measured tests.
7. **Independent Guardian**: reviewer distinct from builder tests exact SHA/deployment and signs documented PASS; no release on an advisory assessment alone.

## Exact historical operational evidence
- Working staging API: `c3654c43-701c-421a-984e-be44f183fa51`, SHA `f10adcd0067c03bb4f6ca77812f2f1fa1e94ddee`.
- Working PostgreSQL: `d6e1db73-100f-48bd-a66e-6e6e43cc98e4`, unchanged.
- Older engine still live (UNSAFE): `769a1fd4-b297-4b0c-9d9d-72b3333d1631`, SHA `39727d92db4aab575a1437323407c1db1d44c46a`.
- Secure Railway guarded image trials `db3762b9-d2f0-475d-93c0-d13e55d16966`, `c1463729-5474-4e53-a198-7c5e49b669bb` both FAILED 11 healthchecks; precise host failure unresolved.
- Draft PR: https://github.com/Strategic-Minds-AI/strategic-cloud-browser/pull/6. Latest SHA and GitHub Actions verdict must be checked live; do not rely on historical numbers.
- JARVIS hardware NVMe/thermal hold remains until independently cleared.

## Resume without duplicating systems
Keep original X1 project, control plane, Supabase queue and Guardian workflow. Do not create another browser/agent daemon, scheduler, provider account, DNS endpoint or paid service to evade an access blocker. Preserve the valid working API, stage one source patch at a time with rollback; do not merge to protected main/production without independent gate and scoped authorization.
