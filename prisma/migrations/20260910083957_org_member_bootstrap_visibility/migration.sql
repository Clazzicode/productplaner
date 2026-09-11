-- Same root cause as org_bootstrap_visibility, one table later in the same
-- transaction: OrganizationMember's self-insert (the solo-signup bootstrap
-- row) failed INSERT ... RETURNING's RLS visibility check with "new row
-- violates row-level security policy for table OrganizationMember" — caught
-- live via an actual provisioning-transaction test against app_rw.
--
-- Root cause here is more specific than Organization's: it's not just that
-- no row existed yet — org_member_select's is_org_member(organizationId)
-- queries OrganizationMember *itself*. Postgres's per-command visibility
-- (CID) rules mean a row an INSERT command just wrote is not visible to a
-- nested subquery issued by that *same* command's own RETURNING/RLS check
-- (only to later commands in the same transaction) — regardless of
-- SECURITY DEFINER, which changes the executing role, not MVCC snapshot
-- visibility. A self-referencing "does a matching row exist in this table"
-- subquery can never satisfy INSERT...RETURNING for the first row of its
-- kind. The fix is the same shape as User's already-correct policy
-- (authUserId = auth.uid() OR ...): compare the row's own column directly —
-- Postgres binds that against the new row itself, no subquery/scan needed.

DROP POLICY IF EXISTS org_member_select ON "OrganizationMember";

CREATE POLICY org_member_select ON "OrganizationMember" FOR SELECT TO app_rw, authenticated
  USING ("authUserId" = auth.uid() OR is_org_member("organizationId"));
