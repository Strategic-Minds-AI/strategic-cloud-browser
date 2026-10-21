import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = readFileSync(path.resolve(here, "../server.js"), "utf8");
const dockerfile = readFileSync(path.resolve(here, "../Dockerfile"), "utf8");

test("manual verification is required for challenge-solving API action", () => {
  assert.match(server, /case "solve_captcha": \{/);
  assert.match(server, /manual_verification_required/);
  assert.match(server, /solved: false, manual_required: true/);
});

test("no third-party challenge token/solver logic is bundled into the engine", () => {
  assert.doesNotMatch(server, /solveCaptchaSelf|https:\/\/2captcha\.com|https:\/\/api\.anti-captcha\.com|https:\/\/api\.capmonster\.cloud/);
  assert.doesNotMatch(dockerfile, /COPY\s+browser-engine\/(captcha-self-solver\.js|self-solvers\/|stt-whisper\.js)/);
});

test("browser engine still reports manual-verification requirement", () => {
  assert.match(server, /async function autoSolveCaptcha\(\)/);
  assert.match(server, /manual_required: true, reason: "manual_verification_required"/);
});
