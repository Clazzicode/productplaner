alter table public."User"
  add column if not exists "username" text,
  add column if not exists "usernameNormalized" text;

update public."User"
set
  "username" = case
    when lower("email") = 'avery@local.invalid' then 'Avery'
    else split_part("email", '@', 1)
  end,
  "usernameNormalized" = lower(split_part("email", '@', 1))
where "authUserId" is not null
  and "email" like '%@local.invalid'
  and "usernameNormalized" is null;

create unique index if not exists "User_usernameNormalized_key"
  on public."User" ("usernameNormalized");

create table if not exists public."AuthUsername" (
  "id" text primary key,
  "authUserId" uuid not null unique references auth.users(id) on delete cascade,
  "username" text not null,
  "normalized" text not null unique,
  "createdAt" timestamp(3) without time zone not null default current_timestamp,
  "updatedAt" timestamp(3) without time zone not null default current_timestamp
);

insert into public."AuthUsername" ("id", "authUserId", "username", "normalized")
select
  'auth-username-' || "authUserId"::text,
  "authUserId",
  "username",
  "usernameNormalized"
from public."User"
where "authUserId" is not null
  and "username" is not null
  and "usernameNormalized" is not null
on conflict do nothing;

alter table public."AuthUsername" enable row level security;
revoke all on table public."AuthUsername" from anon, authenticated;
grant select, insert, update, delete on table public."AuthUsername" to service_role;

drop policy if exists "deny direct username registry access" on public."AuthUsername";
create policy "deny direct username registry access"
  on public."AuthUsername"
  for all
  to anon, authenticated
  using (false)
  with check (false);
