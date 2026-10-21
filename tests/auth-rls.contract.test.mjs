import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

test("API authentication uses a private lookup instead of tenantless table read", () => {
  const auth = read("api/lib/auth.js");
  assert.match(auth, /FROM cloudbrowser_private\.lookup_api_key\(\$1, \$2\)/);
  assert.doesNotMatch(auth, /FROM api_keys\s+WHERE prefix/);
  assert.match(auth, /safeEqualHex\(key\.key_hash, hashApiKey/);
});

test("private lookup remains restricted to backend role and guarded search path", () => {
  const migration = read("db/migrations/002_secure_api_auth.sql");
  for (const required of [
    "SECURITY DEFINER",
    "SET search_path = ''",
    "REVOKE ALL ON SCHEMA cloudbrowser_private FROM PUBLIC",
    "REVOKE ALL ON FUNCTION cloudbrowser_private.lookup_api_key(TEXT, TEXT) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION cloudbrowser_private.lookup_api_key(TEXT, TEXT) TO cloudbrowser_api",
    "REVOKE ALL ON TABLE public.api_keys FROM cloudbrowser_api",
    "ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY",
    "CREATE POLICY tenants_tenant_isolation",
    "Refusing CloudBrowser auth install on database with unrelated public tables"
  ]) assert.ok(migration.includes(required), required);
  assert.doesNotMatch(migration, /GRANT EXECUTE[^;]+TO (?:PUBLIC|anon|authenticated)/i);
});

test("live negative integration test checks cross-tenant read and write", () => {
  const sql = read("db/tests/rls_negative.sql");
  assert.match(sql, /SET ROLE cloudbrowser_api/);
  assert.match(sql, /cross-tenant INSERT incorrectly succeeded/);
  assert.match(sql, /tenant B can read tenant A job/);
  assert.match(sql, /unset tenant allowed jobs/);
  assert.match(sql, /API key digest table is directly readable/);
  assert.match(sql, /ROLLBACK;/);
});
