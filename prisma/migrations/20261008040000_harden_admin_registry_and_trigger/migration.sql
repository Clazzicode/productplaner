-- Make the intentionally private platform-administrator registry explicit to
-- database tooling. Application roles already have all table privileges
-- revoked; this restrictive policy preserves deny-by-default behavior.
DROP POLICY IF EXISTS platform_admins_deny_all ON public.platform_admins;
CREATE POLICY platform_admins_deny_all
  ON public.platform_admins
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Prevent objects in a caller-controlled schema from shadowing relations used
-- by the capability-owner membership trigger.
ALTER FUNCTION public.validate_capability_owner_membership()
  SET search_path TO pg_catalog, public;
