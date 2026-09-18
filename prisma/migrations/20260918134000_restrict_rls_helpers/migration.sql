-- These helpers are implementation details for policies evaluated by the
-- server-side app_rw role. Keeping EXECUTE on authenticated would also expose
-- them as PostgREST RPC endpoints even though direct table access is revoked.
REVOKE EXECUTE ON FUNCTION public.current_app_user_id() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO app_rw;
GRANT EXECUTE ON FUNCTION public.is_org_member(text) TO app_rw;
GRANT EXECUTE ON FUNCTION public.is_org_admin(text) TO app_rw;
GRANT EXECUTE ON FUNCTION public.is_org_owner(text) TO app_rw;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO app_rw;
