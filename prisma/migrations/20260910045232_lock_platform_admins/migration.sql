-- Corrective: platform_admins was created (in rls_foundation) AFTER
-- `ALTER DEFAULT PRIVILEGES ... GRANT ... TO app_rw` ran, so app_rw (and this
-- Supabase project's own default authenticated/anon grants) unexpectedly
-- inherited full table-level access to it — defeating the intended design
-- ("no grants to any app role at all, the only sanctioned read path is
-- is_platform_admin()"). Fix: revoke the table itself from every role except
-- the bypass-RLS service connections, and enable RLS with zero policies as a
-- second, independent barrier (belt-and-suspenders — even if a future
-- migration accidentally re-grants table access, an app role still can't
-- read a row without a policy that doesn't exist).

REVOKE ALL ON public.platform_admins FROM app_rw, authenticated, anon;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
