import test from "node:test";
import assert from "node:assert/strict";
import { assertApiStartupConfig } from "../api/lib/startup-config.js";

const required = () => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://cloudbrowser_api_login:synthetic-ci-password@cb-ci-db:5432/cloudbrowser_qa",
  ENGINE_URL: "http://cloudbrowser-engine.railway.internal:8080",
  ENGINE_API_KEY: "synthetic-ci-engine-auth-not-a-secret",
  API_KEY_PEPPER: "synthetic-ci-hmac-pepper-not-a-secret",
});

test("API startup accepts dedicated, restricted staging role", () => {
  const result = assertApiStartupConfig(required());
  assert.equal(result.databaseRole, "cloudbrowser_api_login");
});

for (const forbidden of ["postgres", "cloudbrowser_worker", "cloudbrowser_api", "root", "supabase_admin"]) {
  test(`API startup rejects unprivileged or privileged wrong DB role: ${forbidden}`, () => {
    const env = required();
    env.DATABASE_URL = env.DATABASE_URL.replace("cloudbrowser_api_login:", `${forbidden}:`);
    assert.throws(() => assertApiStartupConfig(env), /dedicated RLS login/);
  });
}

for (const missing of ["DATABASE_URL", "ENGINE_URL", "ENGINE_API_KEY", "API_KEY_PEPPER"]) {
  test(`API startup rejects missing ${missing}`, () => {
    const env = required();
    delete env[missing];
    assert.throws(() => assertApiStartupConfig(env), new RegExp(missing + " is required"));
  });
}

test("API rejects URLs without database authentication", () => {
  const env = required();
  env.DATABASE_URL = "postgresql://cloudbrowser_api_login@cb-ci-db:5432/cloudbrowser_qa";
  assert.throws(() => assertApiStartupConfig(env), /credentials are incomplete/);
});

test("API startup rejects non-postgres DB URL", () => {
  const env = required();
  env.DATABASE_URL = "https://cloudbrowser_api_login:password@db.example.com";
  assert.throws(() => assertApiStartupConfig(env), /PostgreSQL URL required/);
});

test("API startup rejects credential-bearing engine URL", () => {
  const env = required();
  env.ENGINE_URL = "http://user:password@cloudbrowser-engine.railway.internal:8080";
  assert.throws(() => assertApiStartupConfig(env), /invalid engine endpoint/);
});
