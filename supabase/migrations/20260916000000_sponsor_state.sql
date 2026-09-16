-- Durable DUST Sponsor state. These tables are intentionally opaque to
-- browser clients: the Render Sponsor Service uses the service-role key and
-- all quota admission happens inside one serialized database function.

create table if not exists public.sponsor_idempotency (
  idempotency_id text primary key,
  account_id text not null,
  authorization_digest text not null check (authorization_digest ~ '^[0-9a-f]{64}$'),
  transaction jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sponsor_uncertain (
  idempotency_id text primary key,
  account_id text not null,
  authorization_digest text not null check (authorization_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sponsor_usage_events (
  idempotency_id text primary key,
  account_id text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists sponsor_usage_events_account_time_idx
  on public.sponsor_usage_events (account_id, occurred_at);
create index if not exists sponsor_usage_events_time_idx
  on public.sponsor_usage_events (occurred_at);

alter table public.sponsor_idempotency enable row level security;
alter table public.sponsor_uncertain enable row level security;
alter table public.sponsor_usage_events enable row level security;

revoke all on public.sponsor_idempotency from public, anon, authenticated;
revoke all on public.sponsor_uncertain from public, anon, authenticated;
revoke all on public.sponsor_usage_events from public, anon, authenticated;
grant select, insert, update, delete on public.sponsor_idempotency to service_role;
grant select, insert, update, delete on public.sponsor_uncertain to service_role;
grant select, insert, update, delete on public.sponsor_usage_events to service_role;

create or replace function public.reserve_sponsorship_quota(
  p_account_id text,
  p_idempotency_id text,
  p_occurred_at timestamptz,
  p_account_limit integer,
  p_global_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_account text;
  rolling_cutoff timestamptz;
  utc_day_start timestamptz;
  account_count integer;
  global_count integer;
begin
  if p_account_id is null or length(trim(p_account_id)) = 0
     or p_idempotency_id is null or length(trim(p_idempotency_id)) = 0
     or p_occurred_at is null
     or p_account_limit is null or p_account_limit <= 0
     or p_global_limit is null or p_global_limit <= 0 then
    raise exception 'sponsorship quota request is invalid';
  end if;

  -- A single transaction lock makes the account and global counters atomic
  -- across concurrent Render instances. A rejected request consumes nothing.
  perform pg_advisory_xact_lock(hashtextextended('shroudly:sponsor-quota:v1', 0));

  select account_id into existing_account
    from public.sponsor_usage_events
   where idempotency_id = p_idempotency_id
   for update;
  if existing_account is not null then
    return existing_account = p_account_id;
  end if;

  rolling_cutoff := p_occurred_at - interval '24 hours';
  utc_day_start := date_trunc('day', p_occurred_at at time zone 'utc') at time zone 'utc';

  select count(*)::integer into account_count
    from public.sponsor_usage_events
   where account_id = p_account_id
     and occurred_at > rolling_cutoff;
  select count(*)::integer into global_count
    from public.sponsor_usage_events
   where occurred_at >= utc_day_start
     and occurred_at < utc_day_start + interval '1 day';

  if account_count >= p_account_limit or global_count >= p_global_limit then
    return false;
  end if;

  insert into public.sponsor_usage_events (idempotency_id, account_id, occurred_at)
  values (p_idempotency_id, p_account_id, p_occurred_at);
  return true;
end;
$$;

revoke all on function public.reserve_sponsorship_quota(text, text, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_sponsorship_quota(text, text, timestamptz, integer, integer) to service_role;

create or replace function public.claim_sponsor_uncertain(
  p_idempotency_id text,
  p_account_id text,
  p_authorization_digest text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.sponsor_uncertain%rowtype;
begin
  if p_idempotency_id is null or length(trim(p_idempotency_id)) = 0
     or p_account_id is null or length(trim(p_account_id)) = 0
     or p_authorization_digest is null
     or p_authorization_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'sponsor submission claim is invalid';
  end if;

  -- This lock makes claim-and-submit single-writer across Render instances.
  -- An existing row is deliberately not expired automatically: a timed-out
  -- provider call may already have reached the network and requires operator
  -- reconciliation before another submission is permitted.
  perform pg_advisory_xact_lock(hashtextextended('shroudly:sponsor-submit:' || p_idempotency_id, 0));
  select * into existing
    from public.sponsor_uncertain
   where idempotency_id = p_idempotency_id;
  if found then
    return jsonb_build_object(
      'account_id', existing.account_id,
      'authorization_digest', existing.authorization_digest,
      'acquired', false
    );
  end if;

  insert into public.sponsor_uncertain (idempotency_id, account_id, authorization_digest)
  values (p_idempotency_id, p_account_id, p_authorization_digest);
  return jsonb_build_object(
    'account_id', p_account_id,
    'authorization_digest', p_authorization_digest,
    'acquired', true
  );
end;
$$;

revoke all on function public.claim_sponsor_uncertain(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_sponsor_uncertain(text, text, text) to service_role;
