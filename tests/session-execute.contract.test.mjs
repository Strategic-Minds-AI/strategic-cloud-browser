import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = readFileSync(path.join(root, "api/routes/sessions.js"), "utf8");
const engine = readFileSync(path.join(root, "browser-engine/server.js"), "utf8");

test("public session URL maps into engine startup target_url", () => {
  assert.match(routes, /const targetUrl = body\.target_url \?\? body\.url;/);
  assert.match(routes, /engineBody\.target_url = targetUrl/);
  assert.match(engine, /if \(opts\.target_url\)/);
  assert.match(engine, /await page\.goto\(opts\.target_url/);
});

test("session execute endpoint proves ownership and action scope before engine invocation", () => {
  const start = routes.indexOf('router.post("/:id/execute"');
  const end = routes.indexOf('// GET /v1/sessions/:id', start);
  assert.ok(start > 0 && end > start);
  const handler = routes.slice(start, end);
  assert.match(handler, /requireScopes\(req\.auth, \["sessions:write"\]\)/);
  assert.match(handler, /await assertOwned\(req\.auth\.tenantId, req\.params\.id\)/);
  assert.match(handler, /ALLOWED_SESSION_ACTIONS\.has\(action\.action_type\)/);
  assert.match(handler, /encodeURIComponent\(req\.params\.id\)\}\/execute/);
  assert.match(handler, /res\.json\(payload\)/);
});

test("public browser commands cannot execute arbitrary scripts or read cookies", () => {
  const actionList = routes.match(/const ALLOWED_SESSION_ACTIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || "";
  for (const disabled of ['"evaluate"', '"extract_json"', '"export_cookies"', '"set_headers"', '"upload_file"', '"download"', '"mock_response"', '"crawl"']) {
    assert.equal(actionList.includes(disabled), false, disabled);
  }
  assert.ok(actionList.includes('"screenshot"'));
});
