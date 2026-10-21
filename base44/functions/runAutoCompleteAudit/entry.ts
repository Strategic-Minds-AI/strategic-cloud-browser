import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// AutoComplete validation constitution (from the Production Readiness workbook, sheet 07).
// Weighted score is informative; VERIFIED_100 requires every HARD gate PASS and zero mandatory UNKNOWN/FAIL.
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

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { system_id } = body;
    if (!system_id) return Response.json({ error: "system_id required" }, { status: 400 });

    const manifest = await base44.asServiceRole.entities.SystemManifest.get(system_id);
    if (!manifest) return Response.json({ error: "System not found" }, { status: 404 });

    const runId = `run-${Date.now()}`;
    const existing = await base44.asServiceRole.entities.BenchmarkResult.filter({ system_manifest_id: system_id });
    const byDim = {};
    for (const e of existing) byDim[e.dimension] = e;

    const results = [];
    for (const c of CONSTITUTION) {
      const row = {
        system_manifest_id: system_id,
        dimension: c.dimension,
        gate: c.gate,
        weight: c.weight,
        status: "UNKNOWN",
        run_id: runId,
        validated_at: new Date().toISOString(),
      };
      if (byDim[c.dimension]) {
        await base44.asServiceRole.entities.BenchmarkResult.update(byDim[c.dimension].id, row);
      } else {
        await base44.asServiceRole.entities.BenchmarkResult.create(row);
      }
      results.push({ dimension: c.dimension, status: "UNKNOWN", weight: c.weight, gate: c.gate });
    }

    const totalWeight = CONSTITUTION.reduce((s, c) => s + c.weight, 0);
    const passWeight = results.filter(r => r.status === "PASS").reduce((s, r) => s + r.weight, 0);
    const score = Math.round((passWeight / totalWeight) * 100);

    await base44.asServiceRole.entities.SystemManifest.update(system_id, {
      status: "baselined",
      health_state: "unbenchmarked",
    });

    return Response.json({
      ok: true,
      system_id,
      system_name: manifest.system_name,
      run_id: runId,
      dimensions_baseline: results.length,
      score,
      constitution: CONSTITUTION,
    });
  } catch (error) {
    console.error("runAutoCompleteAudit error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}