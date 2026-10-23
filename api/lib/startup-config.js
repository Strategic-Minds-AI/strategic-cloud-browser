// Fail-closed config guard for the deployable API process.
// Do not serve requests with the Postgres owner or BYPASSRLS worker role.
const RESTRICTED_LOGIN = "cloudbrowser_api_login";

export function assertApiStartupConfig(env = process.env) {
  const required = ["DATABASE_URL", "ENGINE_URL", "ENGINE_API_KEY", "API_KEY_PEPPER"];
  for (const name of required) {
    if (!env[name] || !String(env[name]).trim()) throw new Error(`API startup rejected: ${name} is required`);
  }

  let database;
  try { database = new URL(env.DATABASE_URL); }
  catch { throw new Error("API startup rejected: malformed DATABASE_URL"); }

  if (!["postgres:", "postgresql:"].includes(database.protocol)) {
    throw new Error("API startup rejected: PostgreSQL URL required");
  }
  if (decodeURIComponent(database.username) !== RESTRICTED_LOGIN) {
    throw new Error("API startup rejected: database must use dedicated RLS login, not a database owner");
  }
  if (!database.password || !database.hostname) {
    throw new Error("API startup rejected: database connection credentials are incomplete");
  }

  let engine;
  try { engine = new URL(env.ENGINE_URL); }
  catch { throw new Error("API startup rejected: malformed ENGINE_URL"); }
  if (!["http:", "https:"].includes(engine.protocol) ||
      engine.username || engine.password || !engine.hostname) {
    throw new Error("API startup rejected: invalid engine endpoint");
  }
  return { databaseRole: RESTRICTED_LOGIN, engineProtocol: engine.protocol };
}
