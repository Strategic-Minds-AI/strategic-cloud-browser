import test from "node:test";
import assert from "node:assert/strict";
import { assertBrowserEngineReady } from "../api/lib/engine-attestation.js";

const secure = {
  status: 200,
  payload: {
    ok: true,
    browser_launch: "verified",
    security: { sandbox: "required", non_root: true, uid: 1000 }
  },
};

test("only sandbox-enforced nonroot Chromium readiness permits sessions", () => {
  assert.equal(assertBrowserEngineReady(secure), true);
});

test("historical no-sandbox engine is explicitly rejected", () => {
  const oldEngine = { status: 200, payload: { ok: true, browser_launch: "verified" } };
  assert.throws(() => assertBrowserEngineReady(oldEngine), /secure browser engine readiness not verified/);
});

test("readiness rejects sandbox bypass, root, false positive and unavailable engines", () => {
  for (const reply of [
    { ...secure, status: 503 },
    { ...secure, payload: { ...secure.payload, ok: false } },
    { ...secure, payload: { ...secure.payload, browser_launch: "unknown" } },
    { ...secure, payload: { ...secure.payload, security: { ...secure.payload.security, sandbox: "disabled" } } },
    { ...secure, payload: { ...secure.payload, security: { ...secure.payload.security, uid: 0 } } },
    { ...secure, payload: { ...secure.payload, security: { ...secure.payload.security, non_root: false } } },
    { ...secure, payload: { ...secure.payload, security: { ...secure.payload.security, uid: "1000" } } },
    null, undefined,
  ]) {
    assert.throws(() => assertBrowserEngineReady(reply), /secure browser engine readiness not verified/);
  }
});
