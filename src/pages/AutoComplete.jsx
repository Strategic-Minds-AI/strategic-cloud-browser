import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, Plus, RefreshCw, Play, AlertTriangle, CheckCircle2, XCircle, HelpCircle, Gauge, ListChecks, FileCheck2, Lock } from "lucide-react";

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

const STATE_STYLES = {
  healthy: "bg-emerald-100 text-emerald-700",
  degraded: "bg-amber-100 text-amber-700",
  blocked: "bg-red-100 text-red-700",
  unbenchmarked: "bg-slate-100 text-slate-600",
  verified_100: "bg-gold-gradient text-slate-900",
};

const PRIORITY_STYLES = {
  P0: "bg-red-100 text-red-700 border-red-300",
  P1: "bg-orange-100 text-orange-700 border-orange-300",
  P2: "bg-amber-100 text-amber-700 border-amber-300",
  P3: "bg-slate-100 text-slate-600 border-slate-300",
};

function ScoreRing({ score }) {
  const color = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";
  return (
    <div className="flex items-center gap-2">
      <Gauge className={`w-5 h-5 ${color}`} />
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-muted-foreground">/100</span>
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === "PASS") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "FAIL") return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "BLOCKED") return <Lock className="w-4 h-4 text-red-600" />;
  return <HelpCircle className="w-4 h-4 text-slate-400" />;
}

export default function AutoComplete() {
  const [systems, setSystems] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [newSys, setNewSys] = useState({ system_name: "", canonical_repo: "", base44_app_id: "", runtime: "base44", owner: "", risk_level: "medium" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, g, r] = await Promise.all([
        base44.entities.SystemManifest.list("-health_score", 50),
        base44.entities.RepairTask.filter({ status: "open" }, "-priority", 50),
        base44.entities.BenchmarkResult.list("-validated_at", 100),
      ]);
      setSystems(s || []);
      setGaps(g || []);
      setResults(r || []);
    } catch (e) {
      console.error("load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAudit = async (systemId) => {
    setRunning(systemId);
    try {
      await base44.functions.invoke("runAutoCompleteAudit", { system_id: systemId });
      await load();
    } catch (e) {
      console.error("audit error", e);
    } finally {
      setRunning(null);
    }
  };

  const registerSystem = async () => {
    if (!newSys.system_name) return;
    try {
      await base44.entities.SystemManifest.create({
        ...newSys,
        status: "registered",
        health_state: "unbenchmarked",
        health_score: 0,
        autocomplete_mode: "READ_ONLY",
        protected_gate: true,
        portfolio_status: "review",
        registered_at: new Date().toISOString(),
      });
      setNewSys({ system_name: "", canonical_repo: "", base44_app_id: "", runtime: "base44", owner: "", risk_level: "medium" });
      setShowForm(false);
      await load();
    } catch (e) {
      console.error("register error", e);
    }
  };

  const resolveGap = async (gapId) => {
    try {
      await base44.entities.RepairTask.update(gapId, { status: "resolved", resolved_at: new Date().toISOString() });
      await load();
    } catch (e) { console.error(e); }
  };

  const resultsFor = (sysId) => results.filter(r => r.system_manifest_id === sysId);
  const passCount = (sysId) => resultsFor(sysId).filter(r => r.status === "PASS").length;
  const hardGates = (sysId) => resultsFor(sysId).filter(r => r.gate === "HARD");
  const hardPass = (sysId) => hardGates(sysId).filter(r => r.status === "PASS").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            AutoComplete Control Plane
          </h1>
          <p className="text-sm text-muted-foreground">Portfolio scorecard → deterministic audit → repair → independent validation → release gate</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-4 h-4" /> Register System
          </Button>
        </div>
      </div>

      {/* Portfolio summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Systems</div><div className="text-2xl font-bold">{systems.length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Avg Score</div><div className="text-2xl font-bold">{systems.length ? Math.round(systems.reduce((s, x) => s + (x.health_score || 0), 0) / systems.length) : 0}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">Open Gaps</div><div className="text-2xl font-bold text-amber-600">{gaps.length}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">P0 Gaps</div><div className="text-2xl font-bold text-red-600">{gaps.filter(g => g.priority === "P0").length}</div></CardContent></Card>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Register a System</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>System Name</Label><Input value={newSys.system_name} onChange={e => setNewSys({ ...newSys, system_name: e.target.value })} placeholder="CloudBrowser" /></div>
            <div><Label>Canonical Repo</Label><Input value={newSys.canonical_repo} onChange={e => setNewSys({ ...newSys, canonical_repo: e.target.value })} placeholder="XTREME-SYSTEMS/cloudbrowser-control" /></div>
            <div><Label>Base44 App ID</Label><Input value={newSys.base44_app_id} onChange={e => setNewSys({ ...newSys, base44_app_id: e.target.value })} /></div>
            <div><Label>Runtime</Label>
              <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={newSys.runtime} onChange={e => setNewSys({ ...newSys, runtime: e.target.value })}>
                <option value="base44">Base44</option><option value="vercel">Vercel</option><option value="railway">Railway</option><option value="supabase">Supabase</option><option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div><Label>Owner</Label><Input value={newSys.owner} onChange={e => setNewSys({ ...newSys, owner: e.target.value })} /></div>
            <div><Label>Risk</Label>
              <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={newSys.risk_level} onChange={e => setNewSys({ ...newSys, risk_level: e.target.value })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div className="md:col-span-3 flex gap-2"><Button onClick={registerSystem}>Register</Button><Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="scorecard">
        <TabsList>
          <TabsTrigger value="scorecard"><Gauge className="w-4 h-4 mr-1" /> Scorecard</TabsTrigger>
          <TabsTrigger value="gaps"><ListChecks className="w-4 h-4 mr-1" /> Repair Queue</TabsTrigger>
          <TabsTrigger value="constitution"><FileCheck2 className="w-4 h-4 mr-1" /> Constitution</TabsTrigger>
        </TabsList>

        {/* Scorecard */}
        <TabsContent value="scorecard" className="space-y-3">
          {systems.length === 0 && !loading && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">No systems registered yet. Click "Register System" to add your first.</CardContent></Card>
          )}
          {systems.map((sys) => {
            const rc = resultsFor(sys.id);
            const hp = hardPass(sys.id);
            const hg = hardGates(sys.id).length;
            return (
              <Card key={sys.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{sys.system_name}</h3>
                        <Badge className={STATE_STYLES[sys.health_state] || "bg-slate-100"} variant="secondary">{sys.health_state}</Badge>
                        <Badge variant="outline">{sys.status}</Badge>
                        {sys.protected_gate && <Badge variant="outline" className="gap-1"><Lock className="w-3 h-3" /> Protected</Badge>}
                      </div>
                      {sys.canonical_repo && <p className="text-xs text-muted-foreground font-mono">{sys.canonical_repo}</p>}
                      {sys.what_is_wrong && <p className="text-xs text-amber-600 mt-1"><AlertTriangle className="w-3 h-3 inline mr-1" />{sys.what_is_wrong}</p>}
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        <span>Runtime: {sys.runtime}</span>
                        {sys.owner && <span>Owner: {sys.owner}</span>}
                        <span>Hard gates: {hp}/{hg} PASS</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <ScoreRing score={sys.health_score || 0} />
                      <Button size="sm" variant="outline" onClick={() => runAudit(sys.id)} disabled={running === sys.id}>
                        {running === sys.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        Run Audit
                      </Button>
                    </div>
                  </div>
                  {rc.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
                      {rc.map(r => (
                        <span key={r.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted">
                          <StatusIcon status={r.status} />
                          {r.dimension}
                          <span className="text-muted-foreground">·{r.gate}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Repair queue */}
        <TabsContent value="gaps" className="space-y-3">
          {gaps.length === 0 && !loading && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">No open gaps. The portfolio is clean.</CardContent></Card>
          )}
          {gaps.map((gap) => (
            <Card key={gap.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={PRIORITY_STYLES[gap.priority]} variant="outline">{gap.priority}</Badge>
                      {gap.gap_id && <span className="text-xs font-mono text-muted-foreground">{gap.gap_id}</span>}
                      {gap.category && <Badge variant="secondary">{gap.category}</Badge>}
                    </div>
                    <p className="text-sm font-medium">{gap.finding}</p>
                    {gap.root_cause && <p className="text-xs text-muted-foreground"><span className="font-medium">Root cause:</span> {gap.root_cause}</p>}
                    {gap.exact_repair && <p className="text-xs text-muted-foreground"><span className="font-medium">Repair:</span> {gap.exact_repair}</p>}
                    {gap.acceptance_proof && <p className="text-xs text-emerald-600"><span className="font-medium">Proof:</span> {gap.acceptance_proof}</p>}
                    {gap.assigned_lane && <p className="text-xs text-muted-foreground">Lane: {gap.assigned_lane}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => resolveGap(gap.id)}>
                    <CheckCircle2 className="w-4 h-4" /> Resolve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Constitution */}
        <TabsContent value="constitution">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation Constitution</CardTitle>
              <CardDescription>Weighted score is informative. VERIFIED_100 requires every HARD gate PASS and zero mandatory UNKNOWN/FAIL/BLOCKED.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr><th className="text-left p-2 font-medium">Dimension</th><th className="text-left p-2 font-medium">Gate</th><th className="text-left p-2 font-medium">Weight</th><th className="text-left p-2 font-medium">VERIFIED_100 Rule</th></tr>
                  </thead>
                  <tbody>
                    {CONSTITUTION.map(c => (
                      <tr key={c.dimension} className="border-t">
                        <td className="p-2 font-medium">{c.dimension}</td>
                        <td className="p-2"><Badge variant={c.gate === "HARD" ? "destructive" : "secondary"}>{c.gate}</Badge></td>
                        <td className="p-2">{c.weight}%</td>
                        <td className="p-2 text-xs text-muted-foreground">{c.gate === "HARD" ? "Mandatory pass" : "Informative"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}