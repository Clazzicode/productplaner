-- PostgREST requires schema USAGE in addition to table privileges. Keep this
-- limited to Supabase's trusted server role; anon/authenticated remain denied.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public."AuthUsername" to service_role;
