// Ephemeral, disposable-container E2E: run only against the CI API server.
// All API keys are synthetic and valid only for a thrown-away test database.
import assert from "node:assert/strict";

const origin = process.env.CB_E2E_BASE_URL;
const keyA = process.env.CB_E2E_API_KEY_A;
const keyB = process.env.CB_E2E_API_KEY_B;
if (!origin?.startsWith("http://127.0.0.1:") || !keyA || !keyB)
  throw new Error("Refusing E2E: loopback target and two synthetic keys are required");

async function request(path, { key, method = "GET", data } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(key ? { "x-api-key": key } : {}),
      ...(data === undefined ? {} : { "content-type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(100_000),
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text.slice(0, 1000) }; }
  return { status: response.status, body };
}

assert.equal((await request("/health")).status, 200);
assert.equal((await request("/v1/sessions")).status, 401);

for (const blockedUrl of [
  "https://169.254.169.254/latest/meta-data",
  "https://127.0.0.1/",
  "https://[::ffff:127.0.0.1]/",
  "https://192.168.1.1/"
]) {
  const denied = await request("/v1/sessions", {
    key: keyA, method: "POST", data: { url: blockedUrl }
  });
  assert.ok(denied.status >= 400, "private/metadata navigation unexpectedly accepted: " + blockedUrl);
}

// Real disposable PostgreSQL tenant isolation and queue idempotency.
const jobInput = {
  type: "engine.health",
  payload: { synthetic: true },
  idempotency_key: "cloudbrowser-ci-isolation-job-01"
};
const queuedA = await request("/v1/jobs", { key: keyA, method: "POST", data: jobInput });
assert.equal(queuedA.status, 202, "tenant A job enqueue: " + JSON.stringify(queuedA.body));
const jobIdA = queuedA.body.job?.id;
assert.ok(jobIdA, "tenant A job ID missing");
assert.equal(queuedA.body.job.status, "queued");
const duplicateA = await request("/v1/jobs", { key: keyA, method: "POST", data: jobInput });
assert.equal(duplicateA.status, 202, "same-tenant idempotent replay rejected");
assert.equal(duplicateA.body.job?.id, jobIdA, "same tenant created duplicate job");
const deniedOtherTenant = await request("/v1/jobs/" + encodeURIComponent(jobIdA), { key: keyB });
assert.equal(deniedOtherTenant.status, 404, "tenant B can read tenant A job");
const queuedB = await request("/v1/jobs", { key: keyB, method: "POST", data: jobInput });
assert.equal(queuedB.status, 202, "tenant B job enqueue failed");
assert.notEqual(queuedB.body.job?.id, jobIdA, "cross-tenant idempotency collision");
for (const [key, id] of [[keyA, jobIdA], [keyB, queuedB.body.job.id]]) {
  const canceled = await request("/v1/jobs/" + encodeURIComponent(id) + "/cancel", {
    key, method: "POST"
  });
  assert.equal(canceled.status, 200, "cancel own pending job");
  assert.equal(canceled.body.job?.status, "cancelled", "job cancellation not persisted");
}
console.log("PASS: disposable PostgreSQL durable job idempotency, cross-tenant denial and cancellation");

let sessionId;
try {
  const created = await request("/v1/sessions", {
    key: keyA, method: "POST", data: { url: "https://example.com/" }
  });
  assert.equal(created.status, 201, "create session: " + JSON.stringify(created.body));
  sessionId = created.body.id;
  assert.ok(sessionId && typeof sessionId === "string");

  const foreign = await request("/v1/sessions/" + encodeURIComponent(sessionId), { key: keyB });
  assert.equal(foreign.status, 403, "tenant B accessed tenant A session");

  const visible = await request("/v1/sessions/" + encodeURIComponent(sessionId), { key: keyA });
  assert.equal(visible.status, 200, "tenant A cannot view session");

  const screenshot = await request("/v1/sessions/" + encodeURIComponent(sessionId) + "/execute", {
    key: keyA, method: "POST", data: { action_type: "screenshot", options: { fullPage: false } }
  });
  assert.equal(screenshot.status, 200, "screenshot execution: " + JSON.stringify(screenshot.body).slice(0, 600));
  assert.equal(screenshot.body.mimeType, "image/png");
  assert.ok(screenshot.body.size > 500);
  assert.ok(typeof screenshot.body.base64 === "string" && screenshot.body.base64.length > 1000);

  // Regression for live engine defect: no-selector extraction must work.
  // Both actions use the real Playwright page after navigation.
  const plainText = await request("/v1/sessions/" + encodeURIComponent(sessionId) + "/execute", {
    key: keyA, method: "POST", data: { action_type: "extract_text" }
  });
  assert.equal(plainText.status, 200, "selector-free text: " + JSON.stringify(plainText.body).slice(0, 500));
  assert.ok(typeof plainText.body.data === "string" && plainText.body.data.length > 0,
    "selector-free text should produce non-empty body text");

  const fullHtml = await request("/v1/sessions/" + encodeURIComponent(sessionId) + "/execute", {
    key: keyA, method: "POST", data: { action_type: "extract_html" }
  });
  assert.equal(fullHtml.status, 200, "selector-free HTML: " + JSON.stringify(fullHtml.body).slice(0, 500));
  assert.ok(typeof fullHtml.body.data === "string" && fullHtml.body.data.toLowerCase().includes("<html"),
    "selector-free HTML should produce a full HTML document");

  const unsafe = await request("/v1/sessions/" + encodeURIComponent(sessionId) + "/execute", {
    key: keyA, method: "POST", data: { action_type: "evaluate", value: "document.cookie" }
  });
  assert.equal(unsafe.status, 400, "arbitrary JS evaluation exposed by public gateway");

  console.log("PASS: temporary API engine auth, tenant isolation, session navigation, screenshot and selector-free extraction");
} finally {
  if (sessionId) {
    const closed = await request("/v1/sessions/" + encodeURIComponent(sessionId), {
      key: keyA, method: "DELETE"
    });
    assert.equal(closed.status, 204, "session cleanup");
  }
}
