import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, validateTargetUrl, validateOutboundTarget, installOutboundGuard } from "../network-policy.js";

test("rejects loopback, RFC1918, link local, CGNAT, mapped IPv6 and alternative IPv4 encodings", () => {
  for (const host of [
    "127.0.0.1", "127.1", "2130706433", "0x7f000001", "0177.0.0.1",
    "10.1.2.3", "172.16.1.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "198.18.0.1", "[::1]", "[fe80::1]",
    "[fc00::1]", "[::ffff:127.0.0.1]", "[::ffff:10.0.0.1]",
    "[2002:7f00:0001::1]", "[2001:db8::1]"
  ]) {
    assert.equal(validateTargetUrl(`http://${host}/`).ok, false, host);
  }
});

test("rejects reserved domains, credentials, unsafe schemes and protocol downgrade", () => {
  for (const url of [
    "http://localhost/", "http://foo.local/", "http://metadata.google.internal/",
    "http://foo.internal/", "http://localhost.evil.test/",
    "http://service/", "http://example.com@127.0.0.1/",
    "http://user:secret@example.com/", "file:///etc/passwd", "javascript:alert(1)"
  ]) assert.equal(validateTargetUrl(url).ok, false, url);
  assert.equal(validateTargetUrl("http://example.com/", { enforceHttps: true }).ok, false);
  assert.equal(validateTargetUrl("https://example.com/", { enforceHttps: true }).ok, true);
});

test("accepts public IPv4 and IPv6 literals, rejects non-public IPs", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("1.1.1.1"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
  assert.equal(isPublicIp("::ffff:8.8.8.8"), true);
  assert.equal(isPublicIp("::ffff:127.0.0.1"), false);
  assert.equal(validateTargetUrl("https://[2606:4700:4700::1111]/").ok, true);
});

test("rejects hostname when any DNS A or AAAA answer is non-public", async () => {
  const resolve = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "::ffff:127.0.0.1", family: 6 }
  ];
  assert.equal((await validateOutboundTarget("https://example.com/", { resolve })).ok, false);
  assert.equal((await validateOutboundTarget("https://example.com/", {
    resolve: async () => [{ address: "8.8.4.4", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }]
  })).ok, true);
  assert.equal((await validateOutboundTarget("https://example.com/", { resolve: async () => [] })).ok, false);
  assert.equal((await validateOutboundTarget("https://example.com/", { resolve: async () => { throw new Error("down"); } })).ok, false);
});

test("revalidates each redirected request and rejects DNS rebinding preflight", async () => {
  let handler;
  let wsHandler;
  const ctx = {
    async route(_matcher, cb) { handler = cb; },
    async routeWebSocket(_matcher, cb) { wsHandler = cb; }
  };
  let count = 0;
  await installOutboundGuard(ctx, {
    resolve: async () => [{ address: ++count === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }]
  });
  async function request(url) {
    let result;
    await handler({
      request: () => ({ url: () => url }),
      fallback: async () => { result = "delegated"; },
      abort: async () => { result = "aborted"; }
    });
    return result;
  }
  assert.equal(await request("https://example.com/first"), "delegated");
  assert.equal(await request("https://example.com/redirect"), "aborted");
  assert.equal(await request("http://169.254.169.254/latest/meta-data"), "aborted");
  let closed;
  wsHandler({ close: async (options) => { closed = options; } });
  assert.equal(closed?.code, 1008);
});

test("fails closed when runtime cannot intercept WebSockets", async () => {
  await assert.rejects(() => installOutboundGuard({ route: async () => {} }), /WebSocket egress guard unavailable/);
});
