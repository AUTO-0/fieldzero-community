-- FIELDZERO V22: Seasonal competition, secure public standings and admin controls.
-- Safe to re-run: existing seasons and player records are preserved.

create table if not exists public.fz_competition_seasons (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.arena_fields(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  season_code text not null check (char_length(btrim(season_code)) between 2 and 40),
  description text not null default '',
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fz_competition_seasons_date_order check (ends_on >= starts_on),
  constraint fz_competition_seasons_field_code_unique unique (field_id, season_code)
);
create index if not exists fz_competition_seasons_public_idx
  on public.fz_competition_seasons (active, starts_on desc, ends_on desc);
alter table public.fz_competition_seasons enable row level security;

drop policy if exists "fz_seasons_public_read_active" on public.fz_competition_seasons;
drop policy if exists "fz_seasons_authenticated_read" on public.fz_competition_seasons;
drop policy if exists "fz_seasons_field_admin_insert" on public.fz_competition_seasons;
drop policy if exists "fz_seasons_field_admin_update" on public.fz_competition_seasons;

create policy "fz_seasons_public_read_active"
  on public.fz_competition_seasons for select to anon
  using (active = true);
create policy "fz_seasons_authenticated_read"
  on public.fz_competition_seasons for select to authenticated
  using (active = true or public.fz_can_manage_field(field_id));
create policy "fz_seasons_field_admin_insert"
  on public.fz_competition_seasons for insert to authenticated
  with check (public.fz_can_manage_field(field_id));
create policy "fz_seasons_field_admin_update"
  on public.fz_competition_seasons for update to authenticated
  using (public.fz_can_manage_field(field_id))
  with check (public.fz_can_manage_field(field_id));

revoke all on table public.fz_competition_seasons from public, anon, authenticated;
grant select (id,title,season_code,description,starts_on,ends_on,field_id,active)
  on public.fz_competition_seasons to anon, authenticated;
grant insert (field_id,title,season_code,description,starts_on,ends_on,active,created_by)
  on public.fz_competition_seasons to authenticated;
grant update (active,updated_at)
  on public.fz_competition_seasons to authenticated;

create table if not exists public.fz_season_points_cache (
  season_id uuid not null references public.fz_competition_seasons(id) on delete cascade,
  field_id uuid not null references public.arena_fields(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete cascade,
  callsign text not null,
  season_points bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season_id,player_id)
);
create index if not exists fz_season_points_cache_field_player_idx
  on public.fz_season_points_cache (field_id,player_id);
alter table public.fz_season_points_cache enable row level security;
drop policy if exists "fz_season_cache_public_read_active" on public.fz_season_points_cache;
create policy "fz_season_cache_public_read_active"
  on public.fz_season_points_cache for select to anon, authenticated
  using (exists (
    select 1 from public.fz_competition_seasons s
    where s.id = season_id and s.active = true
  ));
revoke all on table public.fz_season_points_cache from public, anon, authenticated;
grant select (season_id,callsign,season_points)
  on public.fz_season_points_cache to anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.fz_refresh_season_points_cache(p_player_id uuid,p_field_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog,public,private
as $$
begin
  if p_player_id is null or p_field_id is null then return; end if;
  delete from public.fz_season_points_cache
   where player_id=p_player_id and field_id=p_field_id;
  insert into public.fz_season_points_cache
    (season_id,field_id,player_id,callsign,season_points,updated_at)
  select s.id,s.field_id,p.id,p.callsign,coalesce(sum(l.points),0)::bigint,now()
  from public.fz_competition_seasons s
  join public.players p on p.id=p_player_id and p.active=true
  left join public.fz_point_ledger l
    on l.player_id=p.id and l.field_id=s.field_id
   and l.created_at >= (s.starts_on::timestamp at time zone 'Asia/Colombo')
   and l.created_at < ((s.ends_on+1)::timestamp at time zone 'Asia/Colombo')
  where s.field_id=p_field_id
  group by s.id,s.field_id,p.id,p.callsign
  on conflict (season_id,player_id) do update
    set callsign=excluded.callsign,season_points=excluded.season_points,updated_at=now();
end;
$$;

create or replace function private.fz_refresh_cache_from_point_ledger()
returns trigger language plpgsql security definer
set search_path = pg_catalog,public,private
as $$
begin
  if tg_op='DELETE' then
    perform private.fz_refresh_season_points_cache(old.player_id,old.field_id);
    return old;
  end if;
  if tg_op='UPDATE' then
    perform private.fz_refresh_season_points_cache(old.player_id,old.field_id);
  end if;
  perform private.fz_refresh_season_points_cache(new.player_id,new.field_id);
  return new;
end;
$$;

create or replace function private.fz_refresh_cache_from_season()
returns trigger language plpgsql security definer
set search_path = pg_catalog,public,private
as $$
declare r record;
begin
  if tg_op='UPDATE' and old.field_id is distinct from new.field_id then
    delete from public.fz_season_points_cache where season_id=new.id;
  end if;
  for r in
    select distinct player_id from public.fz_point_ledger
    where field_id=new.field_id and player_id is not null
  loop
    perform private.fz_refresh_season_points_cache(r.player_id,new.field_id);
  end loop;
  return new;
end;
$$;

create or replace function private.fz_refresh_cache_from_player()
returns trigger language plpgsql security definer
set search_path = pg_catalog,public,private
as $$
declare r record;
begin
  delete from public.fz_season_points_cache where player_id=new.id;
  if new.active=true then
    for r in
      select distinct field_id from public.fz_point_ledger
      where player_id=new.id and field_id is not null
    loop
      perform private.fz_refresh_season_points_cache(new.id,r.field_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.fz_refresh_season_points_cache(uuid,uuid) from public,anon,authenticated;
revoke all on function private.fz_refresh_cache_from_point_ledger() from public,anon,authenticated;
revoke all on function private.fz_refresh_cache_from_season() from public,anon,authenticated;
revoke all on function private.fz_refresh_cache_from_player() from public,anon,authenticated;

drop trigger if exists fz_point_ledger_refresh_season_cache on public.fz_point_ledger;
create trigger fz_point_ledger_refresh_season_cache
  after insert or update or delete on public.fz_point_ledger
  for each row execute function private.fz_refresh_cache_from_point_ledger();
drop trigger if exists fz_season_refresh_points_cache on public.fz_competition_seasons;
create trigger fz_season_refresh_points_cache
  after insert or update of field_id,starts_on,ends_on on public.fz_competition_seasons
  for each row execute function private.fz_refresh_cache_from_season();
drop trigger if exists fz_player_refresh_season_cache on public.players;
create trigger fz_player_refresh_season_cache
  after update of callsign,active on public.players
  for each row execute function private.fz_refresh_cache_from_player();

do $$
declare r record;
begin
  for r in
    select distinct player_id,field_id from public.fz_point_ledger
    where player_id is not null and field_id is not null
  loop
    perform private.fz_refresh_season_points_cache(r.player_id,r.field_id);
  end loop;
end;
$$;

drop view if exists public.public_fz_season_leaderboard;
create view public.public_fz_season_leaderboard
with (security_invoker=true)
as
select s.id as season_id,s.title as season_title,s.season_code,
       s.description as season_description,s.starts_on,s.ends_on,
       c.callsign,c.season_points,
       dense_rank() over(partition by s.id order by c.season_points desc) as season_rank
from public.fz_competition_seasons s
join public.fz_season_points_cache c on c.season_id=s.id
where s.active=true;
grant select on public.public_fz_season_leaderboard to anon,authenticated;
