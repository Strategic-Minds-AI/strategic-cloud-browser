# GPT UNIVERSAL OPERATOR — SOURCE AUDIT + GAP MATRIX

**PHASE:** 1 — SOURCE AUDIT
**DATE:** 2026-09-16
**AUDIT SCOPE:** browser-engine/, base44/functions/, base44/entities/, workflows, MCP, Railway, Supabase, auth, screenshots, Playwright, ACT/OBSERVE/EXTRACT/AGENT, sessions, retry/self-heal/proxy/context/logging/queue/cost/validation/live-view.

---

## 00 — PROJECT CHARTER

Transform Xtreme CloudBrowser into the universal browser execution, observation, validation, testing, repair-verification, and automation layer for GPT and the XTREME Control Tower.

- **GPT** = BRAIN (decides WHAT)
- **CloudBrowser** = EYES, HANDS, RUNTIME, SCREENSHOT ENGINE, TEST EXECUTOR, VALIDATION SENSOR (decides HOW)
- **Base44** = approved implementation system
- **GitHub** = canonical source authority
- **Supabase** = durable workflow state, leases, queues, receipts, evidence, memory, approvals
- **Vercel Workflow + Cron** = deterministic orchestration heartbeat
- **Railway** = persistent/heavy browser workers

Deterministic chain: GPT → MCP/Gateway → Intent Compiler → Policy+Approval → OBSERVE → PLAN → ACT → EXTRACT → SCREENSHOT → VALIDATE → REPAIR → EVIDENCE RECEIPT → MEMORY/NEXT.

Narrative claims are never accepted as evidence.

---

## 01 — SOURCE TRUTH MANIFEST (current state)

| Component | Location | Status |
|---|---|---|
| Browser engine (Playwright) | browser-engine/server.js v3.1.0 | WORKING — 30+ action types, stealth, CAPTCHA, pooling, SSRF, Supabase sessions |
| Engine client (failover) | base44/shared/engineClient.ts | WORKING — multi-engine failover, secret-vault key |
| Control-plane action wrapper | base44/functions/engineAction | WORKING — user-auth, persists Session/LogEntry/Screenshot/Result |
| REST/OpenAPI gateway | base44/functions/cloudBrowserGatewayV6 | WORKING — API-key, IP allowlist, rate limit, concurrency quota, route scopes |
| MCP tool surface | base44/functions/mcpTools | PARTIAL — 14 tools, no OBSERVE/EXTRACT/AGENT/visual/approval/receipt |
| MCP config | base44/mcp/config.json | MINIMAL — `{"auth":"oauth"}` only |
| Encrypted contexts | BrowserContext entity + crypto.ts | WORKING — encrypt/decrypt cookies+storage, lease, revoke |
| Session manager | browser-engine/session-manager.js | WORKING — Supabase-backed, cleanup loop |
| Self-heal (infra) | runSelfHealingLoop, railwayAutoHeal, HealingFlag | WORKING — circuit breakers, dedup, daily cap |
| Validation | runFullValidation, runMasterReleaseSuite, AutoComplete | PARTIAL — constitution baselined, no browser-repair loop |
| Visual diff | diffScreenshots function | PARTIAL — exists, not structured |
| Capability registry | CapabilityRegistry entity | PARTIAL — entity exists, not runtime-routed |
| Trigger/event bus | Webhook entity, receiveWebhook, externalTrigger | PARTIAL — no unified event catalog |
| Budget | CostSettings, checkBudget, CostEntry | PARTIAL — no per-job browser budget enforcement |
| Observability | getMetrics, getObservabilityMetrics | PARTIAL — no unified dashboard |

---

## 02 — GAP MATRIX (spec requirement vs current state)

| # | Spec Capability | Current | Gap | Priority |
|---|---|---|---|---|
| 1 | OBSERVE (semantic elements, roles, selectors, bbox) | browser_observe = raw evaluate | MAJOR — no semantic discovery | P0 |
| 2 | ACT (policy-validated deterministic action) | browser_act = direct engine execute | MAJOR — no policy validator | P0 |
| 3 | EXTRACT (schema-constrained, confidence, evidence) | browser_extract = extract_text | MAJOR — no schema/confidence | P0 |
| 4 | AGENT (bounded autonomous loop) | none | MAJOR — not implemented | P0 |
| 5 | MCP ~80 tools | 14 tools | MAJOR — incomplete surface | P0 |
| 6 | MCP streamable HTTP transport | JSON POST only | MODERATE | P1 |
| 7 | Approved visual manifest pipeline | none | MAJOR | P1 |
| 8 | Screenshot diff engine (structured) | diffScreenshots (unstructured) | MODERATE | P1 |
| 9 | Multi-viewport validation (4 viewports) | single viewport | MODERATE | P1 |
| 10 | Approval engine + approval object | none | MAJOR | P0 |
| 11 | Evidence ledger / receipts | LogEntry only | MAJOR — no receipt structure | P0 |
| 12 | Browser repair loop | runSelfHealingLoop (infra only) | MAJOR — no browser-repair loop | P1 |
| 13 | Five-minute /api/reconcile | externalTrigger + SystemHeartbeat | PARTIAL | P1 |
| 14 | Trigger/event bus (unified catalog) | Webhook + receiveWebhook | PARTIAL | P1 |
| 15 | Capability-driven routing | CapabilityRegistry entity | PARTIAL — not runtime-routed | P1 |
| 16 | Kill switches (global/project/browser/publish/spend/messaging) | none | MAJOR | P1 |
| 17 | Budget controls (per-job/agent/project/provider) | CostSettings, checkBudget | PARTIAL | P1 |
| 18 | Session safety (TTL, lease, zombie detection, worker restart recovery) | TTL + cleanup | PARTIAL — no lease/zombie | P1 |
| 19 | Multi-tenancy (tenant on every record, RLS) | RLS + project_id | PARTIAL | P1 |
| 20 | Observability dashboard (unified) | getMetrics, getObservabilityMetrics | PARTIAL | P2 |
| 21 | Validation constitution (VERIFIED_100) | AutoComplete (baselined) | PARTIAL | P1 |
| 22 | Base44 browser adapter (operate Base44 UI) | none | MAJOR | P1 |
| 23 | Persistent authenticated contexts (SSO/MFA pause) | BrowserContext + cookie/storage | PARTIAL — no MFA pause | P1 |
| 24 | Canonical runtime (one Playwright, no duplicate) | one engine | GOOD — preserve | — |
| 25 | Content lock / freeze system | none | MAJOR | P2 |
| 26 | BuildPacket bridge | none | MAJOR | P2 |
| 27 | API generator (tenant-scoped credentials) | ApiKey entity + scopes | PARTIAL | P2 |
| 28 | GPT interrupt bad loops | none | MAJOR | P1 |

---

## 03 — PRESERVED CAPABILITIES (do not rewrite)

- browser-engine/server.js Playwright runtime + all 30+ action_types
- engineClient.ts multi-engine failover
- cloudBrowserGatewayV6 REST gateway (API-key, rate limit, concurrency, scopes)
- BrowserContext encrypted contexts + lease + revoke
- SessionManager Supabase persistence
- captcha self-solver + multi-provider (2captcha/anticaptcha/capmonster)
- stealth fingerprint + human behavior
- engineAction control-plane wrapper
- mcpTools existing 14 tools (absorbed into canonical gateway, not deleted)

---

## 04 — IMPLEMENTATION ORDER (from spec)

1. ✅ audit existing CloudBrowser
2. ✅ preserve working runtime
3. ✅ produce gap matrix (this doc)
4. → finish OBSERVE
5. → finish ACT (policy validator)
6. → harden EXTRACT (schema-constrained)
7. → finish AGENT (bounded loop)
8. → implement canonical MCP gateway
9. → persistent encrypted authenticated contexts (partially exists)
10. → screenshot/diff artifacts
11. → visual-manifest pipeline
12. → BuildPacket bridge
13. → trigger/event bus
14. → five-minute Vercel reconcile
15. → approval engine
16. → evidence ledger
17. → repair loop
18. → Base44 browser adapter
19. → multi-viewport Playwright validation
20. → tenant isolation tests
21-25. staging validation → preview acceptance

**STOP before production release.**