-- FIELDZERO V23: referral attribution, operator rewards and Hall of Fame card types
-- Safe additive migration. Existing bookings, players, payments and XP rows are retained.

create table if not exists public.fz_referral_codes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  field_id uuid not null references public.arena_fields(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'),
  reward_points integer not null default 20 check (reward_points between 1 and 60),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint fz_referral_player_field_unique unique (player_id, field_id)
);
create index if not exists fz_referral_codes_active_idx on public.fz_referral_codes(field_id,active);
alter table public.fz_referral_codes enable row level security;
drop policy if exists fz_referral_codes_public_read on public.fz_referral_codes;
create policy fz_referral_codes_public_read on public.fz_referral_codes for select to anon using (active = true);
drop policy if exists fz_referral_codes_field_manage on public.fz_referral_codes;
create policy fz_referral_codes_field_manage on public.fz_referral_codes for all to authenticated using (public.fz_can_manage_field(field_id)) with check (public.fz_can_manage_field(field_id));
grant select(code,reward_points) on public.fz_referral_codes to anon;
grant select,insert,update,delete on public.fz_referral_codes to authenticated;
create or replace view public.public_fz_referral_codes with (security_invoker = true) as
select code,reward_points from public.fz_referral_codes where active = true;
grant select on public.public_fz_referral_codes to anon,authenticated;

alter table public.arena_bookings add column if not exists referral_code text;
alter table public.arena_bookings add column if not exists referral_reward_status text not null default 'none';
do $$
begin
  if not exists (select 1 from pg_constraint where conname='arena_bookings_referral_code_fkey' and conrelid='public.arena_bookings'::regclass) then
    alter table public.arena_bookings add constraint arena_bookings_referral_code_fkey foreign key (referral_code) references public.fz_referral_codes(code) on update cascade on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname='arena_bookings_referral_reward_status_check' and conrelid='public.arena_bookings'::regclass) then
    alter table public.arena_bookings add constraint arena_bookings_referral_reward_status_check check (referral_reward_status in ('none','pending','rewarded'));
  end if;
end $$;
create index if not exists arena_bookings_referral_idx on public.arena_bookings(referral_code,referral_reward_status);

alter table public.fz_point_ledger drop constraint if exists fz_point_ledger_category_check;
alter table public.fz_point_ledger add constraint fz_point_ledger_category_check
check (category = any (array['attendance','objective','teamwork','sportsmanship','mentoring','event_participation','correction','referral']));

alter table public.fz_spotlight_cards drop constraint if exists fz_spotlight_cards_card_type_check;
alter table public.fz_spotlight_cards add constraint fz_spotlight_cards_card_type_check
check (card_type = any (array['top_player','season_mvp','special_occasion','announcement','hall_of_fame']));

create or replace function public.fz_submit_arena_booking(p_booking jsonb)
returns table(id uuid, booking_reference text, status text, booking_start timestamptz, booking_end timestamptz)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id uuid;
  v_ref text;
  v_status text;
  v_start timestamptz;
  v_end timestamptz;
  v_special boolean;
  v_field uuid;
  v_deposit_percent numeric(5,2);
  v_hold_expires timestamptz;
  v_referral_code text;
  v_referrer_callsign text;
  v_referral_field uuid;
begin
  if p_booking is null or jsonb_typeof(p_booking) <> 'object' then
    raise exception 'Booking details are required';
  end if;
  if coalesce(trim(p_booking->>'real_name'), '') = ''
     or coalesce(trim(p_booking->>'callsign'), '') = ''
     or coalesce(trim(p_booking->>'mobile'), '') = '' then
    raise exception 'Name, callsign and mobile are required';
  end if;
  v_start := (p_booking->>'booking_start')::timestamptz;
  v_end := (p_booking->>'booking_end')::timestamptz;
  if v_end <= v_start then raise exception 'Invalid booking duration'; end if;
  if coalesce((p_booking->>'privacy_consent')::boolean, false) is not true then
    raise exception 'Privacy consent is required';
  end if;
  v_special := coalesce((p_booking->>'special_request')::boolean, false);
  v_field := nullif(p_booking->>'field_id', '')::uuid;
  select f.booking_deposit_percent into v_deposit_percent
  from public.arena_fields f
  where f.id = v_field and f.active = true and f.network_status = 'active';
  if not found then raise exception 'Please choose an active FIELDZERO location'; end if;

  v_referral_code := nullif(upper(trim(coalesce(p_booking->>'referral_code',''))),'');
  if v_referral_code is not null then
    select p.callsign,rc.field_id into v_referrer_callsign,v_referral_field
    from public.fz_referral_codes rc
    join public.players p on p.id=rc.player_id and p.active=true
    where rc.code=v_referral_code and rc.active=true;
    if not found then raise exception 'That referral code is not valid or is no longer active'; end if;
    if v_referral_field <> v_field then raise exception 'That referral code belongs to a different FIELDZERO location'; end if;
    if lower(trim(v_referrer_callsign)) = lower(trim(p_booking->>'callsign')) then
      raise exception 'You cannot use your own referral code';
    end if;
  end if;

  if not v_special and exists (
    select 1 from public.arena_bookings b
    where b.field_id = v_field
      and (b.status = 'approved' or (b.status = 'pending_payment' and b.booking_hold_expires_at > now()))
      and tstzrange(b.booking_start,b.booking_end,'[)') && tstzrange(v_start,v_end,'[)')
  ) then raise exception 'That time is already held or confirmed. Choose another available slot.'; end if;

  v_status := case when v_special then 'pending' else 'pending_payment' end;
  v_hold_expires := case when v_special then null else now() + interval '12 hours' end;
  v_ref := 'FZ-BK-' || to_char(v_start at time zone 'Asia/Colombo','YYMM') || '-' || lpad(nextval('public.fz_booking_reference_seq')::text,6,'0');

  insert into public.arena_bookings (
    field_id,real_name,callsign,mobile,customer_email,experience,
    booking_start,booking_end,player_count,special_request,booking_kind,
    quoted_amount,notes,status,privacy_consent,booking_reference,
    referral_code,referral_reward_status,
    deposit_percent,deposit_required_amount,payment_status,booking_hold_expires_at
  ) values (
    v_field,trim(p_booking->>'real_name'),trim(p_booking->>'callsign'),
    trim(p_booking->>'mobile'),coalesce(trim(p_booking->>'customer_email'), ''),
    coalesce(trim(p_booking->>'experience'),''),v_start,v_end,
    greatest(1,least(16,coalesce((p_booking->>'player_count')::integer,1))),
    v_special,case when v_special then 'special' else 'standard' end,
    0,left(coalesce(p_booking->>'notes',''),700),v_status,true,v_ref,
    v_referral_code,case when v_referral_code is null then 'none' else 'pending' end,
    coalesce(v_deposit_percent,30),500,
    case when v_special then 'not_invoiced' else 'awaiting_deposit' end,
    v_hold_expires
  ) returning arena_bookings.id into v_id;

  return query select b.id,b.booking_reference,b.status,b.booking_start,b.booking_end
  from public.arena_bookings b where b.id=v_id;
end;
$function$;

create or replace function public.fz_admin_reward_referral(p_booking_id uuid)
returns integer
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_player_id uuid;
  v_field_id uuid;
  v_points integer;
  v_booking_reference text;
begin
  if auth.uid() is null then raise exception 'Admin authentication is required'; end if;
  select rc.player_id,rc.field_id,rc.reward_points,b.booking_reference
  into v_player_id,v_field_id,v_points,v_booking_reference
  from public.arena_bookings b
  join public.fz_referral_codes rc on rc.code=b.referral_code
  where b.id=p_booking_id and b.referral_reward_status='pending'
  for update of b;
  if not found then raise exception 'This booking has no pending referral reward'; end if;
  if not public.fz_can_manage_field(v_field_id) then raise exception 'You are not authorised to manage this field'; end if;
  update public.arena_bookings set referral_reward_status='rewarded' where id=p_booking_id and referral_reward_status='pending';
  if not found then raise exception 'Referral reward was already processed'; end if;
  insert into public.fz_point_ledger(player_id,category,points,reason,created_by,field_id)
  values (v_player_id,'referral',v_points,'Verified referral reward for booking '||coalesce(v_booking_reference,p_booking_id::text),auth.uid(),v_field_id);
  return v_points;
end;
$function$;
revoke all on function public.fz_admin_reward_referral(uuid) from public,anon;
grant execute on function public.fz_admin_reward_referral(uuid) to authenticated;

notify pgrst, 'reload schema';
