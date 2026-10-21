-- FIELDZERO schema for Supabase. Run in Supabase SQL Editor as project owner.
-- This script creates public-safe views and RLS policies. Never expose service_role keys.
create extension if not exists pgcrypto;

create table if not exists public.player_applications (
  id uuid primary key default gen_random_uuid(),
  real_name text not null check (char_length(trim(real_name)) between 2 and 100),
  callsign text not null check (char_length(trim(callsign)) between 2 and 24),
  mobile text not null check (char_length(trim(mobile)) between 7 and 24),
  primary_blaster text not null check (primary_blaster in ('Electric M4','Pistol','Other','Need a rental')),
  team_preference text not null check (team_preference in ('No team yet','Request existing team','Open to assignment')),
  play_style text not null check (play_style in ('Both','Casual','Competitive')),
  privacy_consent boolean not null default false check (privacy_consent = true),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
create unique index if not exists player_applications_callsign_lower_unique on public.player_applications (lower(callsign));

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references public.player_applications(id) on delete set null,
  callsign text not null unique,
  player_rank text not null default 'ROOKIE',
  player_points integer not null default 0 check (player_points >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 40),
  team_rank integer not null default 999 check (team_rank > 0),
  points integer not null default 0 check (points >= 0),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.teams alter column active set default false;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  unique(team_id, player_id)
);

update public.teams t set active = (select count(*) from public.team_members tm where tm.team_id = t.id and tm.active = true) = 8;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 100),
  event_type text not null default 'Session' check (event_type in ('Session','Tournament','Community day')),
  event_date date,
  location text not null default 'FIELDZERO FIELD',
  description text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.event_bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  booking_type text not null check (booking_type in ('Session','Tournament')),
  real_name text not null check (char_length(trim(real_name)) between 2 and 100),
  callsign text not null check (char_length(trim(callsign)) between 2 and 24),
  mobile text not null check (char_length(trim(mobile)) between 7 and 24),
  player_count integer not null default 1 check (player_count between 1 and 8),
  notes text not null default '' check (char_length(notes) <= 500),
  privacy_consent boolean not null default false check (privacy_consent = true),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  winning_team_id uuid references public.teams(id) on delete set null,
  notes text not null default '',
  points_awarded integer not null default 0 check (points_awarded >= 0),
  played_at timestamptz not null default now(),
  created_by uuid
);

-- Security-definer helper avoids recursive RLS policies on admin_users.
create or replace function public.is_fieldzero_admin()
returns boolean language sql stable security definer
set search_path = public, auth
as $$
  select exists(select 1 from public.admin_users a where a.user_id = auth.uid());
$$;
revoke all on function public.is_fieldzero_admin() from public;
grant execute on function public.is_fieldzero_admin() to authenticated;

alter table public.player_applications enable row level security;
alter table public.admin_users enable row level security;
alter table public.players enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.events enable row level security;
alter table public.event_bookings enable row level security;
alter table public.match_results enable row level security;

-- Public can submit applications, but cannot read applicant PII.
drop policy if exists "Anyone can submit application" on public.player_applications;
create policy "Anyone can submit application" on public.player_applications
for insert to anon, authenticated with check (privacy_consent = true and status = 'pending');
drop policy if exists "Admins read applications" on public.player_applications;
create policy "Admins read applications" on public.player_applications
for select to authenticated using (public.is_fieldzero_admin());
drop policy if exists "Admins update applications" on public.player_applications;
create policy "Admins update applications" on public.player_applications
for update to authenticated using (public.is_fieldzero_admin()) with check (public.is_fieldzero_admin());

drop policy if exists "Admins manage admin list" on public.admin_users;
create policy "Admins manage admin list" on public.admin_users
for select to authenticated using (public.is_fieldzero_admin());

drop policy if exists "Public read active players" on public.players;
create policy "Public read active players" on public.players
for select to anon, authenticated using (active = true);
drop policy if exists "Admins manage players" on public.players;
create policy "Admins manage players" on public.players
for all to authenticated using (public.is_fieldzero_admin()) with check (public.is_fieldzero_admin());

drop policy if exists "Public read active teams" on public.teams;
create policy "Public read active teams" on public.teams
for select to anon, authenticated using (active = true);
drop policy if exists "Admins manage teams" on public.teams;
create policy "Admins manage teams" on public.teams
for all to authenticated using (public.is_fieldzero_admin()) with check (public.is_fieldzero_admin());

drop policy if exists "Public read team memberships" on public.team_members;
create policy "Public read team memberships" on public.team_members
for select to anon, authenticated using (active = true);
drop policy if exists "Admins manage memberships" on public.team_members;
create policy "Admins manage memberships" on public.team_members
for all to authenticated using (public.is_fieldzero_admin()) with check (public.is_fieldzero_admin());

drop policy if exists "Public read published events" on public.events;
create policy "Public read published events" on public.events
for select to anon, authenticated using (published = true);
drop policy if exists "Admins manage events" on public.events;
create policy "Admins manage events" on public.events
for all to authenticated using (public.is_fieldzero_admin()) with check (public.is_fieldzero_admin());

drop policy if exists "Public read match results" on public.match_results;
create policy "Public read match results" on public.match_results
for select to anon, authenticated using (true);
drop policy if exists "Anyone can request event booking" on public.event_bookings;
create policy "Anyone can request event booking" on public.event_bookings
for insert to anon, authenticated with check (privacy_consent = true and status = 'pending');
drop policy if exists "Admins read event bookings" on public.event_bookings;
create policy "Admins read event bookings" on public.event_bookings
for select to authenticated using (public.is_fieldzero_admin());
drop policy if exists "Admins update event bookings" on public.event_bookings;
create policy "Admins update event bookings" on public.event_bookings
for update to authenticated using (public.is_fieldzero_admin()) with check (public.is_fieldzero_admin());

drop policy if exists "Admins manage results" on public.match_results;
create policy "Admins manage results" on public.match_results
for all to authenticated using (public.is_fieldzero_admin()) with check (public.is_fieldzero_admin());

-- Public-safe views: never include real names, mobile numbers, or application IDs.
create or replace view public.public_roster as
select p.callsign, p.player_rank, t.name as team_name
from public.players p
left join public.team_members tm on tm.player_id = p.id and tm.active = true
left join public.teams t on t.id = tm.team_id and t.active = true
where p.active = true;

create or replace view public.public_teams as
select t.id, t.name, t.team_rank, t.points,
       count(tm.player_id)::integer as member_count
from public.teams t
left join public.team_members tm on tm.team_id = t.id and tm.active = true
left join public.players p on p.id = tm.player_id and p.active = true
where t.active = true
group by t.id, t.name, t.team_rank, t.points;

create or replace view public.public_team_roster as
select tm.team_id, p.callsign
from public.team_members tm
join public.players p on p.id = tm.player_id and p.active = true
join public.teams t on t.id = tm.team_id and t.active = true
where tm.active = true;

create or replace view public.public_events as
select id, title, event_type, event_date, description, location
from public.events where published = true;

grant select on public.public_roster, public.public_teams, public.public_team_roster, public.public_events to anon, authenticated;
grant insert on public.player_applications to anon, authenticated;
grant insert on public.event_bookings to anon, authenticated;
grant select, update on public.event_bookings to authenticated;
revoke all on public.player_applications, public.players, public.teams, public.team_members, public.events, public.event_bookings, public.match_results from anon;
grant insert on public.player_applications, public.event_bookings to anon, authenticated;
grant select, update on public.player_applications to authenticated;
grant select, insert, update, delete on public.players, public.teams, public.team_members, public.events, public.match_results to authenticated;
grant select on public.player_applications to authenticated;
grant insert, update, delete on public.players, public.teams, public.team_members, public.events, public.match_results to authenticated;

-- Approval RPC: only admins can approve/reject. Approval creates the public player row.
create or replace function public.review_player_application(application_id uuid, decision text)
returns void language plpgsql security definer
set search_path = public, auth
as $$
declare app public.player_applications%rowtype;
begin
  if not public.is_fieldzero_admin() then raise exception 'Admin access required'; end if;
  if decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  select * into app from public.player_applications where id = application_id for update;
  if not found then raise exception 'Application not found'; end if;
  if app.status <> 'pending' then raise exception 'Application already reviewed'; end if;
  update public.player_applications
    set status = case when decision='approve' then 'approved' else 'rejected' end,
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = application_id;
  if decision='approve' then
    insert into public.players(application_id,callsign)
      values(app.id, app.callsign)
      on conflict (application_id) do nothing;
  end if;
end;
$$;
revoke all on function public.review_player_application(uuid,text) from public;
grant execute on function public.review_player_application(uuid,text) to authenticated;


create or replace function public.review_event_booking(booking_id uuid, decision text)
returns void language plpgsql security definer
set search_path = public, auth
as $$
begin
  if not public.is_fieldzero_admin() then raise exception 'Admin access required'; end if;
  if decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  update public.event_bookings
    set status = case when decision='approve' then 'approved' else 'rejected' end,
        reviewed_at = now(), reviewed_by = auth.uid()
    where id = booking_id and status = 'pending';
  if not found then raise exception 'Pending booking not found'; end if;
end;
$$;
revoke all on function public.review_event_booking(uuid,text) from public;
grant execute on function public.review_event_booking(uuid,text) to authenticated;

-- Hard-enforce no more than eight active players in each squad, including concurrent changes.
create or replace function public.enforce_eight_player_team()
returns trigger language plpgsql security definer set search_path = public
as $$
declare current_count integer;
begin
  if new.active then
    perform pg_advisory_xact_lock(hashtext(new.team_id::text));
    select count(*) into current_count from public.team_members
      where team_id = new.team_id and active = true
      and (tg_op = 'INSERT' or id <> new.id);
    if current_count >= 8 then raise exception 'A team can have no more than eight active players'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists team_members_max_eight on public.team_members;
create trigger team_members_max_eight before insert or update of team_id, active on public.team_members
for each row execute function public.enforce_eight_player_team();

-- A player may only be active on one team at a time.
create unique index if not exists one_active_team_per_player
on public.team_members(player_id) where active = true;

-- Only complete eight-player squads are public. Draft teams stay private until slot 8 is filled.
create or replace function public.sync_team_full_status()
returns trigger language plpgsql security definer set search_path = public
as $$
declare old_team uuid; new_team uuid;
begin
  if tg_op <> 'INSERT' then old_team := old.team_id; end if;
  if tg_op <> 'DELETE' then new_team := new.team_id; end if;
  if old_team is not null then
    update public.teams t set active = (
      select count(*) from public.team_members tm where tm.team_id = old_team and tm.active = true
    ) = 8 where t.id = old_team;
  end if;
  if new_team is not null and new_team is distinct from old_team then
    update public.teams t set active = (
      select count(*) from public.team_members tm where tm.team_id = new_team and tm.active = true
    ) = 8 where t.id = new_team;
  elsif new_team is not null then
    update public.teams t set active = (
      select count(*) from public.team_members tm where tm.team_id = new_team and tm.active = true
    ) = 8 where t.id = new_team;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists team_members_sync_full_status on public.team_members;
create trigger team_members_sync_full_status after insert or update of team_id, active or delete on public.team_members
for each row execute function public.sync_team_full_status();

create or replace function public.prevent_incomplete_public_team()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.active and (select count(*) from public.team_members tm where tm.team_id = new.id and tm.active = true) <> 8 then
    raise exception 'A team becomes public only when it has exactly eight active players';
  end if;
  return new;
end;
$$;
drop trigger if exists teams_require_eight_players on public.teams;
create trigger teams_require_eight_players before insert or update of active on public.teams
for each row execute function public.prevent_incomplete_public_team();

-- Important initial setup:
-- 1. Create your admin user in Supabase Authentication > Users.
-- 2. Copy that user's UUID and run:
-- insert into public.admin_users(user_id) values ('YOUR-AUTH-USER-UUID');
-- Do not expose the UUID as a secret; only admins listed in this table gain admin rights.
