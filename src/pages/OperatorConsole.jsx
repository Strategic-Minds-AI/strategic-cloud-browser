import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Play, RefreshCw, Camera, Eye, MousePointerClick, FileText, ShieldCheck, Activity, Terminal, Image as ImageIcon, CheckCircle2, XCircle } from "lucide-react";

const TOOL_GROUPS = [
  { label: "Lifecycle", tools: ["browser_start", "browser_end", "browser_status", "browser_health"] },
  { label: "Navigate", tools: ["navigate", "reload", "back", "forward"] },
  { label: "Observe", tools: ["observe", "find_element", "inspect_dom", "inspect_accessibility_tree"] },
  { label: "Act", tools: ["click", "hover", "type", "fill", "press_key", "scroll", "select_option"] },
  { label: "Extract", tools: ["extract_text", "extract_links", "extract_structured"] },
  { label: "Screenshot", tools: ["screenshot", "full_page_screenshot"] },
  { label: "Agent", tools: ["agent_execute", "agent_pause", "agent_resume", "agent_cancel"] },
  { label: "Approval", tools: ["approval_request", "approval_status"] },
  { label: "Receipt", tools: ["receipt_get", "evidence_get"] },
];

export default function OperatorConsole() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [tool, setTool] = useState("browser_start");
  const [paramsText, setParamsText] = useState('{\n  "viewport": { "width": 1280, "height": 720 }\n}');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await base44.entities.Session.list("-created_date", 20);
      setSessions(s || []);
      if (s?.length && !activeSession) setActiveSession(s[0].id);
      const r = await base44.entities.EvidenceReceipt.list("-timestamp", 20);
      setReceipts(r || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [activeSession]);

  useEffect(() => { load(); }, [load]);

  const runTool = async () => {
    setRunning(true);
    setResult(null);
    try {
      const params = JSON.parse(paramsText);
      if (activeSession && !params.session_id && !["browser_start", "browser_health", "approval_request", "approval_status", "job_create"].includes(tool)) {
        params.session_id = activeSession;
      }
      const res = await base44.functions.invoke("mcpGateway", { tool, params });
      setResult(res.data);
      if (res.data?.screenshot_url) setScreenshot(res.data.screenshot_url);
      if (tool === "browser_start" && res.data?.session_id) setActiveSession(res.data.session_id);
      await load();
    } catch (e) {
      setResult({ error: e.message || String(e) });
    } finally {
      setRunning(false);
    }
  };

  const quickAction = async (t, extra = {}) => {
    setTool(t);
    const base = { session_id: activeSession, ...extra };
    setParamsText(JSON.stringify(base, null, 2));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Terminal className="w-6 h-6 text-primary" />
          GPT Operator Console
        </h1>
        <p className="text-sm text-muted-foreground">Canonical MCP control surface — GPT is the brain, CloudBrowser is the eyes & hands. Every mutation writes an evidence receipt.</p>
      </div>

      {/* Session bar */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-xs">Active Session:</Label>
            <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={activeSession || ""} onChange={(e) => setActiveSession(e.target.value)}>
              <option value="">— none —</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.id.slice(0, 12)} · {s.status}</option>)}
            </select>
            <Badge variant="outline">{sessions.length} sessions</Badge>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tool invoker */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Play className="w-4 h-4" /> Tool Invoker</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {TOOL_GROUPS.map((g) => (
                <div key={g.label} className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase px-1">{g.label}</span>
                  <div className="flex flex-wrap gap-1">
                    {g.tools.map((t) => (
                      <Button key={t} size="sm" variant={tool === t ? "default" : "outline"} className="h-7 text-xs" onClick={() => setTool(t)}>{t}</Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Label className="text-xs">Tool: <Badge variant="secondary">{tool}</Badge></Label>
            </div>
            <div>
              <Label className="text-xs">Params (JSON)</Label>
              <textarea className="w-full h-32 rounded-md border border-input bg-transparent p-2 text-xs font-mono" value={paramsText} onChange={(e) => setParamsText(e.target.value)} />
            </div>
            <Button onClick={runTool} disabled={running}>
              {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run {tool}
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> Result</CardTitle></CardHeader>
          <CardContent>
            {result === null && <p className="text-sm text-muted-foreground">Run a tool to see structured JSON output.</p>}
            {result?.error && <div className="flex items-center gap-2 text-red-600 text-sm mb-2"><XCircle className="w-4 h-4" /> {result.error}</div>}
            {result && !result.error && <div className="flex items-center gap-2 text-emerald-600 text-sm mb-2"><CheckCircle2 className="w-4 h-4" /> executed</div>}
            {result && (
              <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-auto max-h-64 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
            )}
            {result?.receipt_id && <Badge variant="outline" className="mt-2">receipt: {result.receipt_id}</Badge>}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Quick Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => quickAction("browser_start", {})}><Activity className="w-4 h-4" /> Start Session</Button>
          <Button size="sm" variant="outline" onClick={() => quickAction("navigate", { url: "https://example.com" })}><MousePointerClick className="w-4 h-4" /> Navigate</Button>
          <Button size="sm" variant="outline" onClick={() => quickAction("observe", {})}><Eye className="w-4 h-4" /> Observe</Button>
          <Button size="sm" variant="outline" onClick={() => quickAction("screenshot", {})}><Camera className="w-4 h-4" /> Screenshot</Button>
          <Button size="sm" variant="outline" onClick={() => quickAction("agent_execute", { goal: "Find the main heading and report its text" })}><Terminal className="w-4 h-4" /> Agent Step</Button>
          <Button size="sm" variant="outline" onClick={() => quickAction("browser_health", {})}><ShieldCheck className="w-4 h-4" /> Engine Health</Button>
        </CardContent>
      </Card>

      {/* Screenshot + Receipts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Last Screenshot</CardTitle></CardHeader>
          <CardContent>
            {screenshot ? <img src={screenshot} alt="screenshot" className="w-full rounded-md border" /> : <p className="text-sm text-muted-foreground">No screenshot yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Evidence Receipts</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-auto">
            {receipts.length === 0 && <p className="text-sm text-muted-foreground">No receipts yet.</p>}
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs border rounded-md p-2">
                {r.status === "pass" ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                <span className="font-mono">{r.tool}</span>
                <Badge variant="outline" className="text-[10px]">{r.evidence_type}</Badge>
                <span className="text-muted-foreground ml-auto">{new Date(r.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}