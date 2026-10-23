/**
 * Fail-closed sandbox-on Chromium proof for an isolated authorized host.
 * No API keys, external navigation, CDP exposure, or sandbox bypass.
 * Exit 0 proves only that non-root sandboxed Chromium can launch here.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const evidence = {
  schema: "x1.chromium-sandbox-runtime.v1",
  timestamp: new Date().toISOString(),
  platform: process.platform,
  uid: typeof process.getuid === "function" ? process.getuid() : null,
  requested_sandbox: true,
  bypass_flags: false,
  external_requests: false,
  result: "NOT_RUN",
};
try {
  const status = readFileSync("/proc/self/status", "utf8");
  for (const key of ["Seccomp", "NoNewPrivs"]) {
    const match = status.match(new RegExp("^" + key + ":\\s*(\\d+)", "m"));
    if (match) evidence[key.toLowerCase()] = Number(match[1]);
  }
} catch {
  evidence.proc_diagnostics = "UNAVAILABLE";
}
// Log only booleans / process identity for a hosted start diagnostic.
console.log(JSON.stringify({
  event: "x1_preflight_entered",
  uid: evidence.uid,
  has_engine_api_key: Boolean(process.env.ENGINE_API_KEY),
  has_port: Boolean(process.env.PORT),
}));
let browser;
try {
  if (evidence.platform !== "linux") throw new Error("LINUX_REQUIRED");
  if (evidence.uid === null || evidence.uid === 0) throw new Error("NON_ROOT_REQUIRED");
  console.log(JSON.stringify({ event: "x1_sandbox_launch_requested" }));
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    args: ["--disable-dev-shm-usage"],
    timeout: 20000,
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto("about:blank", { timeout: 5000 });
  if (await page.evaluate(() => document.URL) !== "about:blank") {
    throw new Error("LOCAL_CANARY_FAILED");
  }
  evidence.result = "PASS_SANDBOX_LAUNCH_ONLY";
  await context.close();
} catch (error) {
  const msg = String(error?.message || "");
  evidence.result = "FAIL_CLOSED";
  evidence.reason = /namespace|sandbox|permission|seccomp|EPERM|EACCES/i.test(msg)
    ? "HOST_SANDBOX_PERMISSION_BLOCK"
    : msg.includes("NON_ROOT_REQUIRED") ? "NON_ROOT_REQUIRED"
    : msg.includes("LINUX_REQUIRED") ? "LINUX_REQUIRED"
    : "CHROMIUM_RUNTIME_ERROR";
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  console.log(JSON.stringify(evidence));
}
