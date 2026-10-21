import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cable, Copy, Check, RefreshCw, ShieldCheck } from "lucide-react";

function CopyButton({ value, className = "" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // ignore
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className={className}>
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function Step({ n, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
        {n}
      </span>
      <span className="text-sm text-muted-foreground leading-relaxed pt-0.5">{children}</span>
    </li>
  );
}

export default function Connect() {
  const serverUrl = "https://xtremecloudbrowser.com/api/mcp";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Cable className="w-6 h-6 text-primary" />
          Connect AI Assistants
        </h1>
        <p className="text-muted-foreground text-sm">
          Link ChatGPT, Claude, Cursor, or any MCP-compatible AI client to your Xtreme Cloud Browser app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your MCP Server URL</CardTitle>
          <CardDescription>Paste this URL into your AI client's connector settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all">
              {serverUrl}
            </code>
            <CopyButton value={serverUrl} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 pt-6">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold">Sign-in required</p>
            <p className="text-muted-foreground">
              This app uses OAuth. When you connect, your AI client will open a consent page where you
              sign in with your Xtreme Cloud Browser account and approve access. The assistant only
              ever acts as you — with your permissions, not more.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="claude">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="claude">Claude</TabsTrigger>
          <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="claude">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect to Claude</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                <Step n={1}>Open Claude and click your <strong>profile menu</strong> (bottom-left).</Step>
                <Step n={2}>Go to <strong>Settings → Connectors</strong>.</Step>
                <Step n={3}>Click <strong>"Add custom connector"</strong>.</Step>
                <Step n={4}>Give it a name (e.g. "Xtreme Cloud Browser") and paste the MCP server URL above.</Step>
                <Step n={5}>Click <strong>Add</strong>. Claude will open the consent page — sign in and approve.</Step>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chatgpt">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect to ChatGPT</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                <Step n={1}>In ChatGPT, go to <strong>Apps</strong> and enable <strong>Developer mode</strong> (acknowledge the risk prompt).</Step>
                <Step n={2}>Click <strong>"Create app"</strong>.</Step>
                <Step n={3}>Name it (e.g. "Xtreme Cloud Browser") and paste the MCP server URL above.</Step>
                <Step n={4}>Click <strong>Create</strong>, then enable the app from the chat composer before prompting it.</Step>
                <Step n={5}>ChatGPT will open the consent page — sign in with your app account and approve.</Step>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cursor">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect to Cursor</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                <Step n={1}>In Cursor, open <strong>Settings → Tools &amp; Integrations</strong>.</Step>
                <Step n={2}>Click <strong>"New MCP Server"</strong> — this opens <code className="text-xs bg-muted px-1 rounded">mcp.json</code>.</Step>
                <Step n={3}>Add an entry whose <code className="text-xs bg-muted px-1 rounded">url</code> is the MCP server URL above. Save the file.</Step>
                <Step n={4}>Toggle the server <strong>on</strong>. Cursor will prompt you to sign in and approve on the consent page.</Step>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect to any MCP client</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                <Step n={1}>Copy the MCP server URL above.</Step>
                <Step n={2}>In your AI client, add it as a <strong>streamable HTTP MCP server</strong>.</Step>
                <Step n={3}>A name and the URL are all most clients need. Reload the client after adding.</Step>
                <Step n={4}>On first use, the client opens the consent page — sign in and approve.</Step>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 pt-6">
          <RefreshCw className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold">Refresh after updates</p>
            <p className="text-muted-foreground">
              AI assistants cache the tool list. If we add or change tools, refresh or reconnect the
              connector in your client so it picks up the latest capabilities.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}