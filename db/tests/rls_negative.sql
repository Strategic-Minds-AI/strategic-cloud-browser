-- SQL integration test. ONLY run against newly provisioned isolated CloudBrowser
-- staging database after db/migrations/001_portable_core.sql and
-- db/migrations/002_secure_api_auth.sql. Fixture changes are rolled back.
-- Connection must be the database migration/admin role, never production.
BEGIN;

INSERT INTO public.tenants(id, slug, display_name)
VALUES
 ('00000000-0000-4000-8000-0000000000a1', 'cb-test-tenant-a', 'QA A'),
 ('00000000-0000-4000-8000-0000000000b2', 'cb-test-tenant-b', 'QA B');

INSERT INTO public.jobs(id,tenant_id,type,payload)
VALUES
 ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1','engine.health','{}'::jsonb),
 ('10000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b2','engine.health','{}'::jsonb);

INSERT INTO public.api_keys(tenant_id,label,environment,prefix,key_hash)
VALUES ('00000000-0000-4000-8000-0000000000a1','fixture','cb_test','qa00abcd',repeat('a',64));

-- No role with BYPASSRLS may serve the public API.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cloudbrowser_api' AND rolbypassrls) THEN
   RAISE EXCEPTION 'cloudbrowser_api unexpectedly bypasses RLS';
 END IF;
 IF has_table_privilege('cloudbrowser_api','public.api_keys','SELECT') THEN
   RAISE EXCEPTION 'API key digest table is directly readable';
 END IF;
 IF NOT has_function_privilege('cloudbrowser_api','cloudbrowser_private.lookup_api_key(text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'private API-key lookup not executable by API role';
 END IF;
END $$;

SET ROLE cloudbrowser_api;
SELECT pg_catalog.set_config('app.tenant_id','',true);

DO $$
BEGIN
 IF (SELECT count(*) FROM public.jobs) <> 0 THEN
   RAISE EXCEPTION 'unset tenant allowed jobs';
 END IF;
 IF (SELECT count(*) FROM public.tenants) <> 0 THEN
   RAISE EXCEPTION 'unset tenant allowed tenants metadata';
 END IF;
 IF (SELECT count(*) FROM cloudbrowser_private.lookup_api_key('qa00abcd','cb_test')) <> 1 THEN
   RAISE EXCEPTION 'scoped API-key lookup failed before tenant is known';
 END IF;
END $$;

SELECT pg_catalog.set_config('app.tenant_id','00000000-0000-4000-8000-0000000000a1',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.jobs) <> 1 OR
    (SELECT count(*) FROM public.tenants) <> 1 THEN
   RAISE EXCEPTION 'tenant A cannot see exactly its records';
 END IF;
 -- Same-key cross-tenant insert must be rejected by WITH CHECK.
 BEGIN
   INSERT INTO public.jobs(tenant_id,type)
   VALUES ('00000000-0000-4000-8000-0000000000b2','engine.health');
   RAISE EXCEPTION 'cross-tenant INSERT incorrectly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

SELECT pg_catalog.set_config('app.tenant_id','00000000-0000-4000-8000-0000000000b2',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.jobs) <> 1 OR
    (SELECT count(*) FROM public.tenants) <> 1 THEN
   RAISE EXCEPTION 'tenant B visibility mismatch';
 END IF;
 IF EXISTS (SELECT 1 FROM public.jobs WHERE id='10000000-0000-4000-8000-0000000000a1') THEN
   RAISE EXCEPTION 'tenant B can read tenant A job';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
