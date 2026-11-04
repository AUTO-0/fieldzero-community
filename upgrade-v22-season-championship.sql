-- FIELDZERO V22: seasonal competition and public player standings
create table public.fz_competition_seasons (
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
create index fz_competition_seasons_public_idx on public.fz_competition_seasons (active, starts_on desc, ends_on desc);
alter table public.fz_competition_seasons enable row level security;
create policy "fz_seasons_public_read_active" on public.fz_competition_seasons for select to anon using (active = true);
create policy "fz_seasons_authenticated_read" on public.fz_competition_seasons for select to authenticated using (active = true or public.fz_can_manage_field(field_id));
create policy "fz_seasons_field_admin_insert" on public.fz_competition_seasons for insert to authenticated with check (public.fz_can_manage_field(field_id));
create policy "fz_seasons_field_admin_update" on public.fz_competition_seasons for update to authenticated using (public.fz_can_manage_field(field_id)) with check (public.fz_can_manage_field(field_id));
grant select on public.fz_competition_seasons to anon, authenticated;
grant insert, update on public.fz_competition_seasons to authenticated;
create or replace view public.public_fz_season_leaderboard with (security_barrier = true, security_invoker = false) as
with season_totals as (
 select s.id as season_id,s.title as season_title,s.season_code,s.description as season_description,s.starts_on,s.ends_on,s.field_id,f.name as field_name,p.id as player_id,p.callsign,coalesce(sum(l.points),0)::bigint as season_points
 from public.fz_competition_seasons s
 join public.arena_fields f on f.id=s.field_id
 join public.fz_point_ledger l on l.field_id=s.field_id and l.created_at >= (s.starts_on::timestamp at time zone 'Asia/Colombo') and l.created_at < ((s.ends_on+1)::timestamp at time zone 'Asia/Colombo')
 join public.players p on p.id=l.player_id and p.active=true
 where s.active=true
 group by s.id,s.title,s.season_code,s.description,s.starts_on,s.ends_on,s.field_id,f.name,p.id,p.callsign
)
select season_id,season_title,season_code,season_description,starts_on,ends_on,field_id,field_name,player_id,callsign,season_points,dense_rank() over(partition by season_id order by season_points desc) as season_rank from season_totals;
grant select on public.public_fz_season_leaderboard to anon, authenticated;
