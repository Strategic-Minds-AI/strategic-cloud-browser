import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const docker=readFileSync(new URL("../Dockerfile",import.meta.url),"utf8");
const server=readFileSync(new URL("../server.js",import.meta.url),"utf8");
// Source policy checks only. They DO NOT prove sandbox support on Railway.
test("browser container runs as non-root and owns writable paths",()=>{
 assert.match(docker,/^USER node$/m);
 assert.match(docker,/PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
 assert.match(docker,/chown -R node:node \/app \/ms-playwright \/tmp\/videos/);
});
test("all four browser launch paths explicitly request Chromium sandbox",()=>{
 const launches=server.match(/chromium\.launch(?:PersistentContext)?\(/g)||[];
 const enabled=server.match(/chromiumSandbox:\s*true/g)||[];
 assert.equal(launches.length,4,"New launches require an updated review");
 assert.equal(enabled.length,4,"Every launch path must enable the sandbox");
});
test("no explicit Chromium no-sandbox switches remain",()=>{
 assert.doesNotMatch(server,/--no-sandbox|--disable-setuid-sandbox/);
});
test("engine retains outbound guards and authentication",()=>{
 assert.match(server,/ENGINE_API_KEY/);
 assert.match(server,/installOutboundGuard/);
});
