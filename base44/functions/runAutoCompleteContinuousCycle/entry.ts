import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

// XTREME AutoComplete canonical continuous orchestrator.
// One function owns the recurring audit -> classify -> bounded heal -> validate -> rescore loop.
// All recurring workflows delegate here so overlapping clocks cannot independently mutate state.

const CONSTITUTION = [
  { dimension: "build", gate: "HARD", weight: 15 },
  { dimension: "lint", gate: "HARD", weight: 5 },
  { dimension: "type", gate: "HARD", weight: 5 },
  { dimension: "security", gate: "HARD", weight: 20 },
  { dimension: "data", gate: "HARD", weight: 10 },
  { dimension: "rls", gate: "HARD", weight: 10 },
  { dimension: "e2e", gate: "HARD", weight: 10 },
  { dimension: "browser", gate: "SOFT", weight: 10 },
  { dimension: "mobile", gate: "SOFT", weight: 5 },
  { dimension: "visual", gate: "SOFT", weight: 5 },
  { dimension: "performance", gate: "SOFT", weight: 5 },
];

const CLOUD_BROWSER_APP_ID = "6a837c8e995cc4824aabf594";
const CLOUD_BROWSER_REPO = "XTREME-SYSTEMS/cloudbrowser-control";
const LEASE_KEY = "autocomplete.continuous.lease";
const ENABLED_KEY = "autocomplete.continuous.enabled";
const CLEAN_STREAK_PREFIX = "autocomplete.clean_streak.";
const CLEAN_EVIDENCE_PREFIX = "autocomplete.clean_evidence.";
const CLEAN_AT_PREFIX = "autocomplete.clean_at.";
const HEAL_BUDGET_KEY = "autocomplete.healing_budget";
const LEASE_TTL_MS = 15 * 60 * 1000;
const LEASE_VERIFY_DELAY_MS = 300;
const BENCHMARK_FRESH_MS = 6 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEEP_INTERVAL_MINUTES = 60;
const MAX_HEAL_RUNS_24H = 6;
const MAX_ACTIVE_JOBS = 25;
const MAX_QUEUED_JOBS = 50;
const MAX_UNRESOLVED_FLAGS = 20;
const ALLOWED_HEAL_TRIGGERS = new Set(["fortress_engineer_2h", "architecture_daily", "manual_operator"]);

const AUTO_REPAIR_DIMENSIONS = new Set(["build", "lint", "type", "e2e", "browser", "mobile", "visual", "performance"]);
const LANE_BY_DIMENSION: Record<string, string> = {
  build: "Frontend Principal",
  lint: "Frontend Principal",
  type: "Frontend Principal",
  security: "Security Auditor",
  data: "Data Architect",
  rls: "Security Auditor",
  e2e: "QA Sentinel",
  browser: "QA Sentinel",
  mobile: "QA Sentinel",
  visual: "Visual Systems Lead",
  performance: "Runtime/DevOps",
};

function unwrap(res: any) {
  return res?.data ?? res;
}

function parseJson(value: any, fallback: any = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ageMs(ts: any) {
  const t = ts ? new Date(ts).getTime() : 0;
  if (!Number.isFinite(t) || t <= 0) return Number.POSITIVE_INFINITY;
  const delta = Date.now() - t;
  // Future-dated receipts beyond a small clock-skew allowance are invalid,
  // not permanently fresh evidence.
  if (delta < -MAX_CLOCK_SKEW_MS) return Number.POSITIVE_INFINITY;
  return Math.max(0, delta);
}

async function safeInvoke(base44: any, name: string, args: any = {}) {
  const started = Date.now();
  try {
    const res = await base44.asServiceRole.functions.invoke(name, args);
    return { ok: true, data: unwrap(res), duration_ms: Date.now() - started };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), duration_ms: Date.now() - started };
  }
}

async function getSetting(db: any, key: string) {
  const rows = await db.entities.Setting.filter({ setting_key: key }).catch(() => []);
  return rows?.[0] || null;
}

async function putSetting(db: any, key: string, value: string, category = "schedules", reason = "AutoComplete runtime state") {
  const existing = await getSetting(db, key);
  const payload = {
    desired_value: value,
    effective_value: value,
    actual_runtime_value: value,
    apply_status: "verified",
    drift_status: "none",
    runtime_target: "control_plane",
    operator_editable: false,
    approval_required: false,
    changed_by: "autocomplete-system",
    changed_at: nowIso(),
    change_reason: reason,
    last_verified_at: nowIso(),
  };
  if (existing) {
    await db.entities.Setting.update(existing.id, payload);
    return existing.id;
  }
  const row = await db.entities.Setting.create({
    setting_key: key,
    category,
    scope_type: "platform",
    default_value: value,
    ...payload,
  });
  return row.id;
}

async function acquireLease(db: any, cycleId: string) {
  const current = await getSetting(db, LEASE_KEY);
  const state = parseJson(current?.effective_value, {});
  const expiresAt = state?.expires_at ? new Date(state.expires_at).getTime() : 0;
  if (expiresAt > Date.now() && state?.cycle_id && state.cycle_id !== cycleId) {
    return { acquired: false, holder: state.cycle_id, expires_at: state.expires_at };
  }

  const lease = {
    cycle_id: cycleId,
    acquired_at: nowIso(),
    expires_at: new Date(Date.now() + LEASE_TTL_MS).toISOString(),
  };
  await putSetting(db, LEASE_KEY, JSON.stringify(lease), "schedules", "AutoComplete singleton lease claim");

  // Two-phase claim verification. This is deliberately fail-closed: if a racing
  // invocation overwrote our claim, only the final visible holder proceeds.
  await sleep(LEASE_VERIFY_DELAY_MS);
  const confirmedRow = await getSetting(db, LEASE_KEY);
  const confirmed = parseJson(confirmedRow?.effective_value, {});
  if (confirmed?.cycle_id !== cycleId || new Date(confirmed?.expires_at || 0).getTime() <= Date.now()) {
    return { acquired: false, holder: confirmed?.cycle_id || null, expires_at: confirmed?.expires_at || null, lost_race: true };
  }

  return { acquired: true, ...lease };
}

async function renewLease(db: any, cycleId: string) {
  const current = await getSetting(db, LEASE_KEY);
  const state = parseJson(current?.effective_value, {});
  if (state?.cycle_id !== cycleId) return false;
  const renewed = { ...state, renewed_at: nowIso(), expires_at: new Date(Date.now() + LEASE_TTL_MS).toISOString() };
  await putSetting(db, LEASE_KEY, JSON.stringify(renewed), "schedules", "AutoComplete singleton lease renewed");
  const verify = parseJson((await getSetting(db, LEASE_KEY))?.effective_value, {});
  return verify?.cycle_id === cycleId;
}

async function releaseLease(db: any, cycleId: string) {
  const current = await getSetting(db, LEASE_KEY);
  const state = parseJson(current?.effective_value, {});
  if (state?.cycle_id !== cycleId) return;
  const lease = {
    cycle_id: cycleId,
    released_at: nowIso(),
    expires_at: new Date(0).toISOString(),
  };
  await putSetting(db, LEASE_KEY, JSON.stringify(lease), "schedules", "AutoComplete singleton lease released").catch(() => {});
}

async function reserveHealingBudget(db: any, trigger: string) {
  const current = await getSetting(db, HEAL_BUDGET_KEY);
  const state = parseJson(current?.effective_value, {});
  const now = Date.now();
  const windowStartMs = state?.window_start ? new Date(state.window_start).getTime() : 0;
  const invalidWindow = !Number.isFinite(windowStartMs) || windowStartMs <= 0 || windowStartMs > now + MAX_CLOCK_SKEW_MS;
  const expiredWindow = !invalidWindow && now - windowStartMs >= 24 * 60 * 60 * 1000;
  const reset = invalidWindow || expiredWindow;
  const count = reset ? 0 : Math.max(0, Number(state?.count || 0));

  if (count >= MAX_HEAL_RUNS_24H) {
    return { allowed: false, count, limit: MAX_HEAL_RUNS_24H, window_start: state?.window_start || null };
  }

  const next = {
    window_start: reset ? nowIso() : state.window_start,
    count: count + 1,
    limit: MAX_HEAL_RUNS_24H,
    last_trigger: trigger,
    last_reserved_at: nowIso(),
  };
  await putSetting(db, HEAL_BUDGET_KEY, JSON.stringify(next), "budgets", "Reserve bounded AutoComplete healing capacity");
  return { allowed: true, ...next };
}

async function logReceipt(db: any, cycleId: string, description: string, metadata: any) {
  try {
    await db.entities.AuditLog.create({
      action: "run",
      entity_type: "autocomplete_continuous_cycle",
      entity_id: cycleId,
      description,
      metadata,
      timestamp: nowIso(),
      user_email: "system@autocomplete.local",
    });
  } catch (e) {
    console.error("AutoComplete receipt persistence failed", e);
  }
}

async function upsertBenchmark(db: any, existingRows: any[], manifestId: string, dimension: string, patch: any, runId: string) {
  const existing = existingRows.find((r: any) => r.system_manifest_id === manifestId && r.dimension === dimension);
  const base = CONSTITUTION.find((c) => c.dimension === dimension)!;
  const row = {
    system_manifest_id: manifestId,
    dimension,
    gate: base.gate,
    weight: base.weight,
    status: patch.status || "UNKNOWN",
    score: Number.isFinite(patch.score) ? patch.score : (patch.status === "PASS" ? 100 : 0),
    evidence_artifact: patch.evidence_artifact || "",
    failure_fingerprint: patch.failure_fingerprint || "",
    root_cause: patch.root_cause || "",
    exact_repair: patch.exact_repair || "",
    run_id: runId,
    validated_at: patch.validated_at || nowIso(),
  };
  if (existing) {
    await db.entities.BenchmarkResult.update(existing.id, row);
    Object.assign(existing, row);
    return existing;
  }
  const created = await db.entities.BenchmarkResult.create(row);
  existingRows.push(created);
  return created;
}

async function ingestIndependentEvidence(db: any, benchmarkRows: any[], manifest: any) {
  if (!manifest?.canonical_sha) return { ingested: 0, reason: "canonical_sha_not_pinned" };
  const receipts = await db.entities.EvidenceReceipt.list("-timestamp", 500).catch(() => []);
  const allowedDimensions = new Set(CONSTITUTION.map((c) => c.dimension));
  const latest: Record<string, any> = {};

  for (const receipt of receipts) {
    const data = receipt?.data || {};
    const dimension = data.dimension;
    if (receipt.system_id !== manifest.id || !allowedDimensions.has(dimension)) continue;
    if (data.independent_validator !== true && data.validation_role !== "independent_validator") continue;
    if (data.source_sha !== manifest.canonical_sha) continue;
    if (!receipt.receipt_id || ageMs(receipt.timestamp) > BENCHMARK_FRESH_MS) continue;
    if (!latest[dimension] || new Date(receipt.timestamp || 0).getTime() > new Date(latest[dimension].timestamp || 0).getTime()) {
      latest[dimension] = receipt;
    }
  }

  let ingested = 0;
  const receiptIds: string[] = [];
  for (const c of CONSTITUTION) {
    const receipt = latest[c.dimension];
    if (!receipt) continue;
    const data = receipt.data || {};
    const status = receipt.status === "pass" ? "PASS" : receipt.status === "fail" ? "FAIL" : receipt.status === "blocked" ? "BLOCKED" : "UNKNOWN";
    await upsertBenchmark(db, benchmarkRows, manifest.id, c.dimension, {
      status,
      score: status === "PASS" ? Math.max(0, Math.min(100, Number(data.score ?? 100))) : 0,
      evidence_artifact: `evidence://${receipt.receipt_id}?source_sha=${manifest.canonical_sha}`,
      failure_fingerprint: data.failure_fingerprint || "",
      root_cause: status === "PASS" ? "" : (data.root_cause || receipt.actual_result || `Independent validator returned ${receipt.status}`),
      exact_repair: data.exact_repair || "",
      validated_at: receipt.timestamp,
    }, data.validation_run_id || receipt.receipt_id);
    ingested++;
    receiptIds.push(receipt.receipt_id);
  }

  return { ingested, receipt_ids: receiptIds };
}

function statusFromBoolean(pass: boolean, blocked = false) {
  if (blocked) return "BLOCKED";
  return pass ? "PASS" : "FAIL";
}

function summarizeFailure(dimension: string, row: any) {
  const reason = row?.root_cause || `${dimension} is ${row?.status || "UNKNOWN"}`;
  return `${dimension}: ${reason}`;
}

async function syncRepairTask(db: any, repairRows: any[], manifest: any, dimension: string, row: any) {
  const gapId = `AUTO:${manifest.id}:${dimension}`;
  const existing = repairRows.find((r: any) => r.gap_id === gapId);
  if (row.status === "PASS") {
    if (existing && !["resolved", "rejected"].includes(existing.status)) {
      await db.entities.RepairTask.update(existing.id, {
        status: "resolved",
        resolved_at: nowIso(),
        evidence: row.evidence_artifact || `Fresh ${dimension} PASS evidence`,
      });
      existing.status = "resolved";
    }
    return;
  }

  const approvalRequired = !AUTO_REPAIR_DIMENSIONS.has(dimension);
  const payload = {
    system_manifest_id: manifest.id,
    gap_id: gapId,
    priority: row.gate === "HARD" ? "P0" : "P1",
    category: dimension,
    finding: summarizeFailure(dimension, row),
    root_cause: row.root_cause || `Mandatory ${dimension} evidence is not PASS`,
    exact_repair: row.exact_repair || `Repair the smallest responsible ${dimension} layer in a sandbox/branch, rerun the exact failed check, then run regression.`,
    acceptance_proof: `Fresh ${dimension} PASS evidence at the canonical source revision; no UNKNOWN/BLOCKED substitution.`,
    auto_repair: !approvalRequired,
    approval_required: approvalRequired,
    status: existing && ["planning", "in_progress", "validating"].includes(existing.status) ? existing.status : "open",
    assigned_lane: LANE_BY_DIMENSION[dimension] || "System Engineer",
    rollback_pointer: existing?.rollback_pointer || "",
    evidence: row.evidence_artifact || "No fresh evidence",
    resolved_at: null,
  };
  if (existing) {
    await db.entities.RepairTask.update(existing.id, payload);
    Object.assign(existing, payload);
  } else {
    const created = await db.entities.RepairTask.create(payload);
    repairRows.push(created);
  }
}

async function updateCleanStreak(db: any, manifestId: string, allPass: boolean, certificationCycle: boolean, latestByDimension: Record<string, any>) {
  const streakKey = CLEAN_STREAK_PREFIX + manifestId;
  const evidenceKey = CLEAN_EVIDENCE_PREFIX + manifestId;
  const cleanAtKey = CLEAN_AT_PREFIX + manifestId;
  const current = await getSetting(db, streakKey);
  const oldValue = Number(current?.effective_value || 0) || 0;

  if (!allPass) {
    await putSetting(db, streakKey, "0", "observability", "AutoComplete clean streak reset by non-PASS evidence");
    return { streak: 0, incremented: false, reason: "non_pass" };
  }

  if (!certificationCycle) {
    return { streak: oldValue, incremented: false, reason: "quick_cycle_cannot_certify" };
  }

  const priorEvidence = await getSetting(db, evidenceKey);
  const priorFingerprint = priorEvidence?.effective_value || "";
  const priorCleanAt = await getSetting(db, cleanAtKey);
  const priorCleanMs = priorCleanAt?.effective_value ? new Date(priorCleanAt.effective_value).getTime() : 0;

  const parts: string[] = [];
  for (const c of CONSTITUTION) {
    const row = latestByDimension[c.dimension];
    if (!row || row.status !== "PASS" || !row.evidence_artifact || !row.run_id || ageMs(row.validated_at) > BENCHMARK_FRESH_MS) {
      return { streak: oldValue, incremented: false, reason: `incomplete_evidence:${c.dimension}` };
    }
    const rowMs = new Date(row.validated_at).getTime();
    if (priorCleanMs > 0 && rowMs <= priorCleanMs) {
      return { streak: oldValue, incremented: false, reason: `replayed_evidence:${c.dimension}` };
    }
    parts.push(`${c.dimension}:${row.run_id}:${row.validated_at}:${row.evidence_artifact}`);
  }

  const fingerprint = parts.join("|");
  if (fingerprint === priorFingerprint) {
    return { streak: oldValue, incremented: false, reason: "same_evidence_fingerprint" };
  }

  const next = oldValue + 1;
  const cleanAt = nowIso();
  await putSetting(db, streakKey, String(next), "observability", "AutoComplete clean streak incremented by fresh certification evidence");
  await putSetting(db, evidenceKey, fingerprint, "observability", "AutoComplete certification evidence fingerprint");
  await putSetting(db, cleanAtKey, cleanAt, "observability", "AutoComplete last clean certification timestamp");
  return { streak: next, incremented: true, reason: "fresh_certification" };
}

async function rescoreManifest(db: any, manifest: any, allBenchmarkRows: any[], repairRows: any[], certificationCycle = false) {
  const rows = allBenchmarkRows
    .filter((r: any) => r.system_manifest_id === manifest.id)
    .sort((a: any, b: any) => new Date(b.validated_at || 0).getTime() - new Date(a.validated_at || 0).getTime());
  if (rows.length === 0) return { skipped: true, reason: "no benchmark evidence" };

  const latestByDimension: Record<string, any> = {};
  for (const row of rows) if (!latestByDimension[row.dimension]) latestByDimension[row.dimension] = row;

  let weighted = 0;
  let allPass = true;
  const failures: string[] = [];
  for (const c of CONSTITUTION) {
    let row = latestByDimension[c.dimension];
    if (!row || ageMs(row.validated_at) > BENCHMARK_FRESH_MS) {
      row = {
        dimension: c.dimension,
        gate: c.gate,
        weight: c.weight,
        status: "UNKNOWN",
        score: 0,
        root_cause: !row ? "No benchmark evidence exists" : "Benchmark evidence is stale",
        exact_repair: `Produce fresh ${c.dimension} evidence and store the receipt.`,
        evidence_artifact: row?.evidence_artifact || "",
      };
    }
    if (row.status === "PASS" && !row.evidence_artifact) {
      row = { ...row, status: "UNKNOWN", score: 0, root_cause: "PASS row has no evidence artifact", exact_repair: `Produce independently verifiable ${c.dimension} evidence.` };
    }
    const score = row.status === "PASS" ? Math.max(0, Math.min(100, Number(row.score || 100))) : 0;
    weighted += (c.weight * score) / 100;
    if (row.status !== "PASS") {
      allPass = false;
      failures.push(summarizeFailure(c.dimension, row));
    }
    await syncRepairTask(db, repairRows, manifest, c.dimension, row);
  }

  const clean = await updateCleanStreak(db, manifest.id, allPass, certificationCycle, latestByDimension);
  const sourcePinned = Boolean(manifest.canonical_sha);
  if (!sourcePinned) failures.push("source_truth: canonical_sha is not pinned");
  const verified100 = allPass && sourcePinned && Math.round(weighted) === 100 && clean.streak >= 3;
  const healthScore = Math.round(weighted);
  const healthState = verified100 ? "verified_100" : healthScore >= 85 ? "healthy" : healthScore >= 50 ? "degraded" : "blocked";
  const status = verified100 ? "verified_100" : "baselined";
  const whatIsWrong = failures.length ? failures.slice(0, 8).join(" | ") : "All current benchmark dimensions PASS; clean-cycle proof still accumulating.";
  const pathTo100 = verified100
    ? "Preservation mode: retain fresh evidence and prevent regression."
    : `Close ${failures.length} blocker(s); require pinned canonical SHA, all 11 dimensions PASS with fresh non-replayed evidence, and 3 independent certification cycles. Current clean streak: ${clean.streak}/3 (${clean.reason}).`; 

  await db.entities.SystemManifest.update(manifest.id, {
    health_score: healthScore,
    health_state: healthState,
    status,
    what_is_wrong: whatIsWrong,
    path_to_100: pathTo100,
  });

  return { health_score: healthScore, health_state: healthState, status, clean_streak: clean.streak, clean_cycle_incremented: clean.incremented, clean_cycle_reason: clean.reason, source_pinned: sourcePinned, verified_100: verified100, failures };
}

function probeEvidence(runId: string, name: string, detail: string, sourceSha?: string) {
  return `autocomplete://${runId}/${name}?source_sha=${encodeURIComponent(sourceSha || "UNPINNED")}&detail=${encodeURIComponent(detail.slice(0, 400))}`;
}

async function applyCloudBrowserProbes(base44: any, db: any, benchmarkRows: any[], manifest: any, runId: string, deep: boolean) {
  const receipts: any[] = [];

  const engine = await safeInvoke(base44, "engineHealth", {});
  const engineData = engine.data || {};
  const enginePass = engine.ok && engineData.ok === true && engineData.swarm?.unhealthy_count === 0;
  await upsertBenchmark(db, benchmarkRows, manifest.id, "browser", {
    status: statusFromBoolean(enginePass, !engine.ok || engineData.configured === false),
    score: enginePass ? 100 : 0,
    evidence_artifact: probeEvidence(runId, "engineHealth", JSON.stringify(engineData.swarm || engine.error || {}), manifest.canonical_sha),
    root_cause: enginePass ? "" : (engine.error || engineData.error || `Engine swarm status: ${engineData.swarm?.status || "unknown"}`),
    exact_repair: "Restore a healthy engine swarm, then rerun engineHealth and browser lifecycle regression.",
  }, runId);
  receipts.push({ probe: "engineHealth", ok: enginePass, duration_ms: engine.duration_ms, summary: engineData.swarm || engine.error });

  const minute = new Date().getUTCMinutes();
  if (minute % 15 === 0 || deep) {
    const metrics = await safeInvoke(base44, "getObservabilityMetrics", {});
    const d = metrics.data || {};
    const metricsPass = metrics.ok && d.session_metrics && d.job_metrics && d.action_metrics;
    await upsertBenchmark(db, benchmarkRows, manifest.id, "performance", {
      status: statusFromBoolean(Boolean(metricsPass), !metrics.ok),
      score: metricsPass ? 100 : 0,
      evidence_artifact: probeEvidence(runId, "observability", JSON.stringify({ session: d.session_metrics, job: d.job_metrics, action: d.action_metrics }), manifest.canonical_sha),
      root_cause: metricsPass ? "" : (metrics.error || "Required observability percentiles are unavailable"),
      exact_repair: "Restore metrics persistence and P50/P95/P99 calculation, then rerun observability checks.",
    }, runId);
    receipts.push({ probe: "getObservabilityMetrics", ok: Boolean(metricsPass), duration_ms: metrics.duration_ms });
  }

  if (deep) {
    const tenant = await safeInvoke(base44, "runTenantIsolationTests", {});
    const td = tenant.data || {};
    const tenantScore = Number(td.score ?? td.pass_rate ?? (td.rls_active ? 100 : 0));
    const tenantPass = tenant.ok && (td.rls_active === true || tenantScore === 100 || td.failed === 0);
    const tenantEvidence = probeEvidence(runId, "tenantIsolation", JSON.stringify({ score: tenantScore, negative: td.negative_tests, positive: td.positive_tests }), manifest.canonical_sha);
    await upsertBenchmark(db, benchmarkRows, manifest.id, "rls", {
      status: statusFromBoolean(tenantPass, !tenant.ok),
      score: tenantPass ? 100 : Math.max(0, Math.min(99, tenantScore || 0)),
      evidence_artifact: tenantEvidence,
      root_cause: tenantPass ? "" : (tenant.error || `Tenant isolation score ${tenantScore || 0}`),
      exact_repair: "Repair tenant/RLS isolation at the smallest failing layer and rerun adversarial cross-tenant tests.",
    }, runId);
    await upsertBenchmark(db, benchmarkRows, manifest.id, "data", {
      status: statusFromBoolean(tenantPass, !tenant.ok),
      score: tenantPass ? 100 : Math.max(0, Math.min(99, tenantScore || 0)),
      evidence_artifact: tenantEvidence,
      root_cause: tenantPass ? "" : (tenant.error || "Tenant-scoped data contract failed"),
      exact_repair: "Restore project-scoped data contracts and prove create/read/update/delete isolation with cleanup.",
    }, runId);
    receipts.push({ probe: "runTenantIsolationTests", ok: tenantPass, duration_ms: tenant.duration_ms, score: tenantScore });

    const mcp = await safeInvoke(base44, "runMcpBlackBox", {});
    const md = mcp.data || {};
    const mcpScore = Number(md.score ?? md.pass_rate ?? 0);
    const mcpPass = mcp.ok && (mcpScore === 100 || (md.failed === 0 && Number(md.passed || 0) > 0));
    const mcpEvidence = probeEvidence(runId, "mcpBlackBox", JSON.stringify({ score: mcpScore, passed: md.passed, failed: md.failed, total: md.total_tests }), manifest.canonical_sha);
    await upsertBenchmark(db, benchmarkRows, manifest.id, "e2e", {
      status: statusFromBoolean(mcpPass, !mcp.ok),
      score: mcpPass ? 100 : Math.max(0, Math.min(99, mcpScore || 0)),
      evidence_artifact: mcpEvidence,
      root_cause: mcpPass ? "" : (mcp.error || `MCP black-box score ${mcpScore || 0}`),
      exact_repair: "Repair the exact failing MCP/browser lifecycle test, rerun it, then rerun the complete MCP black-box suite.",
    }, runId);
    if (mcpPass) {
      await upsertBenchmark(db, benchmarkRows, manifest.id, "browser", {
        status: "PASS",
        score: 100,
        evidence_artifact: mcpEvidence,
        root_cause: "",
        exact_repair: "",
      }, runId);
    }
    receipts.push({ probe: "runMcpBlackBox", ok: mcpPass, duration_ms: mcp.duration_ms, score: mcpScore });
  }

  return receipts;
}

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;
  const cycleId = `ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  let lease: any = null;

  try {
    const body = await req.json().catch(() => ({}));
    const trigger = body?.trigger || "scheduled";
    const forceDeep = body?.force_deep === true;
    const requestHealing = body?.request_healing === true;

    const enabled = await getSetting(db, ENABLED_KEY);
    if (enabled && enabled.effective_value === "false") {
      return Response.json({ ok: true, skipped: true, reason: "AutoComplete continuous loop disabled", cycle_id: cycleId });
    }
    if (!enabled) await putSetting(db, ENABLED_KEY, "true", "schedules", "Initialize canonical continuous loop");

    lease = await acquireLease(db, cycleId);
    if (!lease.acquired) {
      await logReceipt(db, cycleId, "AutoComplete cycle skipped because canonical lease is held", { trigger, lease });
      return Response.json({ ok: true, skipped: true, reason: "lease_held", cycle_id: cycleId, lease });
    }

    const [manifests, benchmarkRows, repairRows, jobs, flags, settings] = await Promise.all([
      db.entities.SystemManifest.list("health_score", 100).catch(() => []),
      db.entities.BenchmarkResult.list("-validated_at", 500).catch(() => []),
      db.entities.RepairTask.list("-created_date", 500).catch(() => []),
      db.entities.Job.list("-created_date", 200).catch(() => []),
      db.entities.HealingFlag.list("-flagged_at", 200).catch(() => []),
      db.entities.Setting.list("-changed_at", 500).catch(() => []),
    ]);

    const activeJobs = jobs.filter((j: any) => ["running", "in_progress", "retrying"].includes(j.status)).length;
    const queuedJobs = jobs.filter((j: any) => ["queued", "pending"].includes(j.status)).length;
    const unresolvedFlags = flags.filter((f: any) => !["resolved"].includes(f.status)).length;
    const driftedSettings = settings.filter((s: any) => ["drifted", "failed"].includes(s.apply_status) || ["desired_drift", "runtime_drift"].includes(s.drift_status));
    const backpressure = {
      active_jobs: activeJobs,
      queued_jobs: queuedJobs,
      unresolved_healing_flags: unresolvedFlags,
      ok: activeJobs <= MAX_ACTIVE_JOBS && queuedJobs <= MAX_QUEUED_JOBS && unresolvedFlags <= MAX_UNRESOLVED_FLAGS,
    };

    const now = new Date();
    const deepDue = forceDeep || (now.getUTCMinutes() % DEEP_INTERVAL_MINUTES === 0);
    const runId = `${cycleId}_${deepDue ? "deep" : "quick"}`;
    const probes: any[] = [];

    const cloudManifest = manifests.find((m: any) => m.base44_app_id === CLOUD_BROWSER_APP_ID || m.canonical_repo === CLOUD_BROWSER_REPO);
    let independentEvidence: any = { ingested: 0, reason: "cloud_manifest_not_found" };
    if (cloudManifest) {
      if (!await renewLease(db, cycleId)) throw new Error("AutoComplete lease lost before evidence ingestion");
      independentEvidence = await ingestIndependentEvidence(db, benchmarkRows, cloudManifest);
      if (!await renewLease(db, cycleId)) throw new Error("AutoComplete lease lost before runtime probes");
      probes.push(...await applyCloudBrowserProbes(base44, db, benchmarkRows, cloudManifest, runId, deepDue && backpressure.ok));
      if (!await renewLease(db, cycleId)) throw new Error("AutoComplete lease lost after runtime probes");
    }

    // Detect setting drift, but do not automatically apply sensitive/production settings.
    if (cloudManifest && driftedSettings.length > 0) {
      const gapId = `AUTO:${cloudManifest.id}:settings-drift`;
      const existing = repairRows.find((r: any) => r.gap_id === gapId);
      const payload = {
        system_manifest_id: cloudManifest.id,
        gap_id: gapId,
        priority: "P1",
        category: "settings",
        finding: `${driftedSettings.length} setting(s) are failed or drifted`,
        root_cause: "Desired/runtime configuration drift detected by the control plane",
        exact_repair: "Reconcile only non-sensitive settings after read-back; route secrets/restarts/production changes to approval.",
        acceptance_proof: "All affected settings read back with apply_status=verified and drift_status=none.",
        auto_repair: false,
        approval_required: true,
        status: existing && ["planning", "in_progress", "validating"].includes(existing.status) ? existing.status : "open",
        assigned_lane: "Runtime/DevOps",
        evidence: driftedSettings.slice(0, 20).map((s: any) => s.setting_key).join(", "),
      };
      if (existing) await db.entities.RepairTask.update(existing.id, payload);
      else repairRows.push(await db.entities.RepairTask.create(payload));
    }

    const manifestScores: any[] = [];
    for (const manifest of manifests) {
      // Do not overwrite manually baselined systems until benchmark evidence exists.
      const hasEvidence = benchmarkRows.some((r: any) => r.system_manifest_id === manifest.id);
      if (!hasEvidence && manifest.id !== cloudManifest?.id) {
        manifestScores.push({ system: manifest.system_name, skipped: true, reason: "awaiting external benchmark evidence" });
        continue;
      }
      const certificationCycle = deepDue && backpressure.ok;
      const scored = await rescoreManifest(db, manifest, benchmarkRows, repairRows, certificationCycle);
      manifestScores.push({ system: manifest.system_name, ...scored });
    }

    // Bounded legacy healing is allowed only from explicit, allowlisted engineering triggers.
    // It never controls VERIFIED_100 and a failed attempt still consumes one budget slot.
    let healing: any = { attempted: false };
    const healingRequested = requestHealing && ALLOWED_HEAL_TRIGGERS.has(trigger);
    if (requestHealing && !healingRequested) {
      healing = { attempted: false, reason: `healing trigger not allowlisted: ${trigger}` };
    }
    if (healingRequested && backpressure.ok) {
      if (!await renewLease(db, cycleId)) throw new Error("AutoComplete lease lost before healing");
      const budget = await reserveHealingBudget(db, trigger);
      if (budget.allowed) {
        const heal = await safeInvoke(base44, "runSelfHealingLoop", { source: "autocomplete_continuous", cycle_id: cycleId });
        healing = { attempted: true, ok: heal.ok, budget, data: heal.data || null, error: heal.error || null, duration_ms: heal.duration_ms };
        await db.entities.AuditLog.create({
          action: "run",
          entity_type: "autocomplete_healing",
          entity_id: cycleId,
          description: heal.ok ? "Bounded AutoComplete healing cycle executed" : "Bounded AutoComplete healing cycle failed",
          metadata: { ok: heal.ok, trigger, budget, summary: heal.data || heal.error },
          timestamp: nowIso(),
          user_email: "system@autocomplete.local",
        }).catch(() => {});
      } else {
        healing = { attempted: false, reason: "24h healing budget exhausted", budget };
      }
    } else if (healingRequested && !backpressure.ok) {
      healing = { attempted: false, reason: "backpressure_open", backpressure };
    }

    const summary = {
      trigger,
      mode: deepDue ? "deep" : "quick",
      backpressure,
      manifests: manifestScores,
      probes,
      independent_evidence: independentEvidence,
      certification_cycle: deepDue && backpressure.ok,
      drifted_settings: driftedSettings.length,
      open_repairs: repairRows.filter((r: any) => ["open", "planning", "in_progress", "validating", "blocked"].includes(r.status)).length,
      healing,
      duration_ms: Date.now() - startedAt,
    };

    await logReceipt(db, cycleId, `AutoComplete ${deepDue ? "deep" : "quick"} cycle completed`, summary);
    return Response.json({ ok: true, cycle_id: cycleId, ...summary });
  } catch (error: any) {
    const failure = { error: error?.message || String(error), duration_ms: Date.now() - startedAt };
    await logReceipt(db, cycleId, "AutoComplete continuous cycle failed", failure).catch(() => {});
    return Response.json({ ok: false, cycle_id: cycleId, ...failure }, { status: 500 });
  } finally {
    if (lease?.acquired) await releaseLease(db, cycleId);
  }
}
