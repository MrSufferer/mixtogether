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
  using (account_id = auth.uid() and (auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists "backup account owner creates" on public.backup_accounts;
create policy "backup account owner creates" on public.backup_accounts
  for insert to authenticated
  with check (account_id = auth.uid());

drop policy if exists "backup account owner updates aal2" on public.backup_accounts;
create policy "backup account owner updates aal2" on public.backup_accounts
  for update to authenticated
  using (account_id = auth.uid() and (auth.jwt() ->> 'aal') = 'aal2')
  with check (account_id = auth.uid());

drop policy if exists "backup account owner deletes aal2" on public.backup_accounts;
create policy "backup account owner deletes aal2" on public.backup_accounts
  for delete to authenticated
  using (account_id = auth.uid() and (auth.jwt() ->> 'aal') = 'aal2');

-- Quota and automation rows are service-role-only: no anon or user policy is
-- intentionally present. Service role access is kept in the server runtime.

create or replace function public.write_backup_cas(
  p_expected_generation bigint,
  p_writer text,
  p_environment text,
  p_deployment_id text,
  p_encrypted_state text
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_generation bigint;
begin
  if p_writer is null or length(trim(p_writer)) = 0 then
    raise exception 'backup writer is required';
  end if;
  update public.backup_accounts
     set generation = generation + 1,
         active_writer = p_writer,
         environment = p_environment,
         deployment_id = p_deployment_id,
         encrypted_state = p_encrypted_state,
         encrypted_state_created_at = timezone('utc', now()),
         updated_at = timezone('utc', now())
   where account_id = auth.uid()
     and generation = p_expected_generation
     and active_writer = p_writer
     and (auth.jwt() ->> 'aal') = 'aal2'
  returning generation into next_generation;
  if next_generation is null then
    raise exception 'stale generation or writer handoff';
  end if;
  return next_generation;
end;
$$;

revoke all on function public.write_backup_cas(bigint, text, text, text, text) from public;
grant execute on function public.write_backup_cas(bigint, text, text, text, text) to authenticated;
