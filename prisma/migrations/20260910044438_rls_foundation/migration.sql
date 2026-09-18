-- Multi-tenant RLS foundation (docs/V2-MULTI-TENANT-AUTH.md).
-- Hand-written, not Prisma-generated — same precedent as InitiativeAccess's
-- hand-added CHECK constraint (see prisma/schema.prisma). This migration is
-- purely additive/preparatory: it creates the role, tables, and functions RLS
-- needs, but does NOT enable row_security on any existing table yet. That
-- happens in a follow-up migration once these are verified independently, and
-- the app's DATABASE_URL only switches to the new role after that.
--
-- Run once as a role with CREATEROLE/DDL rights (this project's migrations
-- always run over DIRECT_URL as `postgres`).

-- ---------- 1. Non-bypassing application role ----------
-- Both `postgres` and `service_role` have BYPASSRLS — neither can be the
-- app's connection role once RLS is meant to bite. `app_rw` is a plain LOGIN
-- role with no such bypass. Password is set separately (never committed to a
-- migration file) via `ALTER ROLE app_rw PASSWORD '...'`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw;

-- auth.uid() is what every helper function below reads its identity from.
GRANT USAGE ON SCHEMA auth TO app_rw;
GRANT EXECUTE ON FUNCTION auth.uid() TO app_rw;

-- ---------- 2. Platform admin ----------
-- Deliberately NOT a Prisma model and NOT granted to app_rw/authenticated/anon
-- at all — the only sanctioned read path is the SECURITY DEFINER function
-- below, which returns a boolean without ever exposing the table itself to a
-- request-scoped connection. Rows are only ever written via the direct/
-- service connection (never through anything the request path touches).
CREATE TABLE IF NOT EXISTS public.platform_admins (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO app_rw, authenticated;

-- ---------- 3. Membership helper functions ----------
-- SECURITY DEFINER + owned by `postgres` (a bypass-RLS role, since this
-- migration runs as `postgres`) is what breaks the classic recursive-RLS trap:
-- a policy ON "OrganizationMember" that queried "OrganizationMember" again
-- inline would re-trigger its own policies. Calling it through a
-- SECURITY DEFINER function instead runs the inner SELECT as the function's
-- (bypass-RLS) owner, so it never re-enters RLS at all.

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM "User" WHERE "authUserId" = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "OrganizationMember"
    WHERE "organizationId" = org_id AND "authUserId" = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "OrganizationMember"
    WHERE "organizationId" = org_id AND "authUserId" = auth.uid() AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(org_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "OrganizationMember"
    WHERE "organizationId" = org_id AND "authUserId" = auth.uid() AND status = 'active'
      AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO app_rw, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(text) TO app_rw, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(text) TO app_rw, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_owner(text) TO app_rw, authenticated;
