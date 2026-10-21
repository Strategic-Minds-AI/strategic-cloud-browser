// X1 CloudBrowser: fail-closed URL and DNS preflight. An infrastructure egress
// firewall is also required: application-level DNS checks cannot eliminate
// DNS rebinding between validation and the browser's TCP connection.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const DENIED_NAMES = new Set(["localhost", "metadata.google.internal", "metadata", "instance-data"]);
const DENIED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".onion", ".test", ".invalid", ".example"];

function ipv4Bytes(host) {
  if (isIP(host) !== 4) return null;
  return host.split(".").map(Number);
}

function ipv6Bytes(input) {
  const host = input.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (isIP(host) !== 6) return null;
  let parts = host.split("::");
  if (parts.length > 2) return null;
  function unpack(s) {
    if (!s) return [];
    const chunks = s.split(":");
    const last = chunks[chunks.length - 1];
    if (last.includes(".")) {
      const v4 = ipv4Bytes(last);
      if (!v4) return null;
      chunks.splice(chunks.length - 1, 1,
        ((v4[0] << 8) | v4[1]).toString(16),
        ((v4[2] << 8) | v4[3]).toString(16));
    }
    return chunks.map((n) => parseInt(n, 16));
  }
  const left = unpack(parts[0]), right = unpack(parts[1] || "");
  if (!left || !right) return null;
  const omitted = 8 - left.length - right.length;
  if (parts.length === 1 && omitted !== 0) return null;
  if (parts.length === 2 && omitted < 1) return null;
  const words = [...left, ...Array(Math.max(0, omitted)).fill(0), ...right];
  if (words.length !== 8) return null;
  return words.flatMap((w) => [w >> 8, w & 255]);
}

export function isPublicIp(address) {
  if (typeof address !== "string") return false;
  const clean = address.replace(/^\[/, "").replace(/\]$/, "");
  const v4 = ipv4Bytes(clean);
  if (v4) {
    const [a, b, c] = v4;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  const v6 = ipv6Bytes(clean);
  if (!v6) return false;
  // IPv4-mapped IPv6 is a particularly important bypass vector.
  if (v6.slice(0, 10).every((n) => n === 0) && v6[10] === 255 && v6[11] === 255)
    return isPublicIp(v6.slice(12).join("."));
  // Globally routable unicast only. Deny 6to4 tunneling, documentation
  // addresses, and special-purpose 2001::/23 (conservative).
  if ((v6[0] & 0xe0) !== 0x20) return false;
  if (v6[0] === 0x20 && v6[1] === 0x02) return false;
  if (v6[0] === 0x20 && v6[1] === 0x01 && v6[2] <= 0x01) return false;
  if (v6[0] === 0x20 && v6[1] === 0x01 && v6[2] === 0x0d && v6[3] === 0xb8) return false;
  return true;
}

export function validateTargetUrl(urlStr, { enforceHttps = false } = {}) {
  if (typeof urlStr !== "string" || !urlStr.trim()) return { ok: false, error: "URL required" };
  let parsed;
  try { parsed = new URL(urlStr); }
  catch { return { ok: false, error: "Invalid URL" }; }
  if (!["http:", "https:"].includes(parsed.protocol)) return { ok: false, error: "Only HTTP/HTTPS allowed" };
  if (enforceHttps && parsed.protocol !== "https:") return { ok: false, error: "HTTPS required by policy" };
  if (parsed.username || parsed.password) return { ok: false, error: "URL credentials not allowed" };
  const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.length > 253) return { ok: false, error: "Invalid hostname" };
  if (DENIED_NAMES.has(hostname) || DENIED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { ok: false, error: "Local or reserved hostname denied" };
  }
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) return { ok: false, error: "Non-public address denied" };
  } else if (!hostname.includes(".") || !/^[a-z0-9.-]+$/.test(hostname) || hostname.split(".").some((p) => !p || p.startsWith("-") || p.endsWith("-"))) {
    return { ok: false, error: "Non-public or invalid DNS name" };
  }
  return { ok: true, parsed };
}

export async function validateOutboundTarget(urlStr, { enforceHttps = false, resolve = dnsLookup } = {}) {
  const check = validateTargetUrl(urlStr, { enforceHttps });
  if (!check.ok) return check;
  const hostname = check.parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(hostname)) return check;
  try {
    // Check every A/AAAA answer; even one non-public answer must fail closed.
    const records = await resolve(hostname, { all: true, verbatim: true });
    if (!Array.isArray(records) || !records.length || records.some((r) => !r || !isPublicIp(r.address)))
      return { ok: false, error: "DNS did not resolve exclusively to public addresses" };
    return check;
  } catch {
    return { ok: false, error: "DNS resolution failed" };
  }
}

export async function installOutboundGuard(context, options = {}) {
  // This must be registered after other context routes. Playwright routes use
  // reverse registration order; this guard must run before mock/block handlers.
  await context.route("**/*", async (route) => {
    const check = await validateOutboundTarget(route.request().url(), options);
    if (!check.ok) return route.abort("blockedbyclient");
    return route.continue();
  });
}
