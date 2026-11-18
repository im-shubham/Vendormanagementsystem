-- =====================================================================
-- LOCAL DEVELOPMENT ONLY — do NOT run on Supabase.
--
-- Recreates the small part of Supabase that the schema relies on, so the
-- whole system can run against a plain PostgreSQL instance:
--   * roles anon / authenticated
--   * auth.users table (used by the "local" auth provider)
--   * auth.uid() reading the JWT claims exactly like Supabase does
-- The migration runner applies this automatically when AUTH_PROVIDER=local
-- and the auth schema does not exist.
-- =====================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,
  encrypted_password  text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
revoke all on auth.users from anon, authenticated;
