import test from "node:test";
import assert from "node:assert/strict";
import { buildSafeBrowserAction, ALLOWED_SESSION_ACTIONS } from "../api/lib/browser-action-policy.js";

test("safe X1 browser actions include parity-critical interactions", () => {
  for (const a of ["hover", "type", "press", "select_option", "scroll", "extract_table", "wait_for_load_state"])
    assert.ok(ALLOWED_SESSION_ACTIONS.includes(a), a);
  const type = buildSafeBrowserAction({ action_type: "type", selector: "#q", value: "sample", options: { delay: 25 } });
  assert.deepEqual(type, { action_type: "type", selector: "#q", value: "sample", options: { delay: 25 } });
  assert.equal(buildSafeBrowserAction({ action_type: "extract_text" }).action_type, "extract_text");
  assert.equal(buildSafeBrowserAction({ action_type: "screenshot", options: { fullPage: false } }).action_type, "screenshot");
  assert.equal(buildSafeBrowserAction({ action_type: "scroll", value: 500 }).value, "500");
});

test("public API never accepts dangerous internal engine actions", () => {
  for (const action_type of [
    "evaluate", "mock_response", "restore_state", "set_cookies",
    "export_cookies", "upload_file", "download", "crawl",
    "pdf", "set_headers", "frame_switch", "solve_captcha"
  ]) assert.throws(() => buildSafeBrowserAction({ action_type }), /Unsupported session action/);
});

test("rejects unsupported options, oversized input, unbounded timeouts and malicious shapes", () => {
  for (const unsafe of [
    { action_type: "click", selector: "a", options: { evaluateFn: "() => 1" } },
    { action_type: "goto", value: "https://example.com", options: { timeout: 900000 } },
    { action_type: "hover" },
    { action_type: "extract_table", selector: "" },
    { action_type: "type", selector: "#q", value: "x".repeat(25001) },
    { action_type: "screenshot", options: { fullPage: "yes" } },
    { action_type: "press", value: "" },
    { action_type: "goto", value: "https://example.com", api_key: "unsafe" },
    { action_type: "scroll", value: 3000 },
    { action_type: "select_option", selector: "select", value: ["a", null] },
    null, undefined, []
  ]) assert.throws(() => buildSafeBrowserAction(unsafe), Error);
});
