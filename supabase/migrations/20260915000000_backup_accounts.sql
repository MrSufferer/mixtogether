-- Shroudly Backup Accounts store only client-encrypted private-state blobs.
-- Principal, eligibility, settlement, and private witnesses never live here.

create table if not exists public.backup_accounts (
  account_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  verified_email boolean not null default false,
  generation bigint not null default 0 check (generation >= 0),
  active_writer text,
  environment text not null check (environment in ('preprod', 'mainnet-test-build')),
  deployment_id text not null,
  encrypted_state text,
  encrypted_state_created_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint backup_accounts_email_format check (position('@' in email) > 1),
  constraint backup_accounts_deployment_id check (length(trim(deployment_id)) > 0),
  constraint backup_accounts_ciphertext_only check (
    encrypted_state is null or (
      length(encrypted_state) > 0 and
      encrypted_state !~* '(ownerSecret|seedPhrase|privateKey)'
    )
  )
);

create table if not exists public.sponsorship_usage (
  account_id uuid not null references auth.users(id) on delete cascade,
  bucket_start timestamptz not null,
  action_count integer not null default 0 check (action_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (account_id, bucket_start)
);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  deployment_id text not null,
  draw_id bigint not null check (draw_id >= 0),
  action text not null check (action in ('commit', 'reveal', 'checkpoint', 'finalize', 'health', 'evidence')),
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'paused')),
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.backup_accounts enable row level security;
alter table public.sponsorship_usage enable row level security;
alter table public.automation_jobs enable row level security;

drop policy if exists "backup account owner reads aal2" on public.backup_accounts;
create policy "backup account owner reads aal2" on public.backup_accounts
  for select to authenticated
  using (account_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "backup account owner creates" on public.backup_accounts;
create policy "backup account owner creates" on public.backup_accounts
  for insert to authenticated
  with check (
    account_id = (select auth.uid())
    and generation = 0
    and active_writer is null
    and verified_email = false
    and encrypted_state is null
    and encrypted_state_created_at is null
    and length(trim(deployment_id)) > 0
    and lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and coalesce((select auth.jwt() ->> 'email_confirmed_at'), '') <> ''
  );

drop policy if exists "backup account owner updates aal2" on public.backup_accounts;
drop policy if exists "backup account owner deletes aal2" on public.backup_accounts;

-- Quota and automation rows are service-role-only: no anon or user policy is
-- intentionally present. Backup ciphertext writes also have no direct UPDATE
-- or DELETE policy; they are only exposed through the authenticated CAS RPCs
-- below, which re-check AAL2 and the caller identity inside the function.

create or replace function public.mark_backup_email_verified()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or coalesce((select auth.jwt() ->> 'email_confirmed_at'), '') = '' then
    raise exception 'verified email claim required';
  end if;
  update public.backup_accounts
     set verified_email = true,
         updated_at = timezone('utc', now())
   where account_id = (select auth.uid())
     and lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
     and verified_email = false;
end;
$$;

revoke all on function public.mark_backup_email_verified() from public;
grant execute on function public.mark_backup_email_verified() to authenticated;

create or replace function public.write_backup_cas(
  p_expected_generation bigint,
  p_writer text,
  p_environment text,
  p_deployment_id text,
  p_encrypted_state text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_generation bigint;
begin
  if auth.uid() is null or (select auth.jwt() ->> 'aal') <> 'aal2' then
    raise exception 'AAL2 session required';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 then
    raise exception 'backup generation is invalid';
  end if;
  if p_writer is null or length(trim(p_writer)) = 0 then
    raise exception 'backup writer is required';
  end if;
  if p_environment not in ('preprod', 'mainnet-test-build') or p_deployment_id is null or length(trim(p_deployment_id)) = 0 then
    raise exception 'backup deployment binding is invalid';
  end if;
  if p_encrypted_state is not null and (length(trim(p_encrypted_state)) = 0 or p_encrypted_state ~* '(ownerSecret|seedPhrase|privateKey)') then
    raise exception 'backup must contain opaque encrypted state';
  end if;
  update public.backup_accounts
     set generation = generation + 1,
         active_writer = p_writer,
         environment = p_environment,
         deployment_id = p_deployment_id,
         encrypted_state = p_encrypted_state,
         encrypted_state_created_at = case when p_encrypted_state is null then null else timezone('utc', now()) end,
         updated_at = timezone('utc', now())
   where account_id = (select auth.uid())
     and generation = p_expected_generation
     and active_writer = p_writer
     and environment = p_environment
     and deployment_id = p_deployment_id
     and (select auth.jwt() ->> 'aal') = 'aal2'
  returning generation into next_generation;
  if next_generation is null then
    raise exception 'stale generation or writer handoff';
  end if;
  return next_generation;
end;
$$;

revoke all on function public.write_backup_cas(bigint, text, text, text, text) from public;
grant execute on function public.write_backup_cas(bigint, text, text, text, text) to authenticated;

create or replace function public.handoff_backup_cas(
  p_expected_generation bigint,
  p_writer text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_generation bigint;
begin
  if auth.uid() is null or (select auth.jwt() ->> 'aal') <> 'aal2' then
    raise exception 'AAL2 session required';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 or p_writer is null or length(trim(p_writer)) = 0 then
    raise exception 'backup handoff is invalid';
  end if;
  update public.backup_accounts
     set active_writer = p_writer,
         updated_at = timezone('utc', now())
   where account_id = (select auth.uid())
     and generation = p_expected_generation
  returning generation into current_generation;
  if current_generation is null then
    raise exception 'stale backup generation';
  end if;
  return current_generation;
end;
$$;

revoke all on function public.handoff_backup_cas(bigint, text) from public;
grant execute on function public.handoff_backup_cas(bigint, text) to authenticated;

create or replace function public.delete_backup_cas(
  p_expected_generation bigint,
  p_writer text
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_generation bigint;
begin
  if auth.uid() is null or (select auth.jwt() ->> 'aal') <> 'aal2' then
    raise exception 'AAL2 session required';
  end if;
  if p_expected_generation is null or p_expected_generation < 0 or p_writer is null or length(trim(p_writer)) = 0 then
    raise exception 'backup deletion is invalid';
  end if;
  update public.backup_accounts
     set generation = generation + 1,
         active_writer = p_writer,
         encrypted_state = null,
         encrypted_state_created_at = null,
         updated_at = timezone('utc', now())
   where account_id = (select auth.uid())
     and generation = p_expected_generation
     and active_writer = p_writer
  returning generation into next_generation;
  if next_generation is null then
    raise exception 'stale generation or writer handoff';
  end if;
  return next_generation;
end;
$$;

revoke all on function public.delete_backup_cas(bigint, text) from public;
grant execute on function public.delete_backup_cas(bigint, text) to authenticated;
