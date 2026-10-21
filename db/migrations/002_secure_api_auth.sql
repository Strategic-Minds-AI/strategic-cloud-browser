-- CloudBrowser staging: narrow, RLS-compatible API-key authentication.
-- Apply ONLY after 001_portable_core.sql on an isolated CloudBrowser database.
-- This migration is prepared in GitHub; it has NOT been applied to Supabase.
BEGIN;
-- Prevent silent collision with a pre-existing, unrelated public schema.
DO $guard$
BEGIN
  IF to_regclass('public.api_keys') IS NULL OR to_regclass('public.jobs') IS NULL
     OR to_regclass('public.session_owners') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudbrowser_api') THEN
    RAISE EXCEPTION 'CloudBrowser portable core migration 001 must be installed first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      AND c.relname NOT IN (
        'tenants','api_keys','jobs','job_attempts','artifacts',
        'audit_log','session_owners','browser_sessions'
      )
  ) THEN
    RAISE EXCEPTION 'Refusing CloudBrowser auth install on database with unrelated public tables';
  END IF;
END
$guard$;

CREATE SCHEMA IF NOT EXISTS cloudbrowser_private;
REVOKE ALL ON SCHEMA cloudbrowser_private FROM PUBLIC;
GRANT USAGE ON SCHEMA cloudbrowser_private TO cloudbrowser_api;

-- SQL query executes as the migration owner (must have BYPASSRLS).
-- Only the trusted backend database role receives EXECUTE, never anon/authenticated.
-- All identifiers fully qualified; the function uses no untrusted search_path.
CREATE OR REPLACE FUNCTION cloudbrowser_private.lookup_api_key(
  p_prefix TEXT, p_environment TEXT
)
RETURNS TABLE (
  id UUID, tenant_id UUID, key_hash TEXT,
  scopes TEXT[], expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $lookup$
  SELECT k.id, k.tenant_id, k.key_hash, k.scopes, k.expires_at, k.revoked_at
  FROM public.api_keys AS k
  WHERE k.prefix = p_prefix AND k.environment = p_environment
  LIMIT 1;
$lookup$;
REVOKE ALL ON FUNCTION cloudbrowser_private.lookup_api_key(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cloudbrowser_private.lookup_api_key(TEXT, TEXT) TO cloudbrowser_api;

-- Direct reads of stored HMAC digests are forbidden to the unprivileged API
-- connection. The narrowly scoped security-definer lookup is its only path.
REVOKE ALL ON TABLE public.api_keys FROM cloudbrowser_api;
COMMIT;
