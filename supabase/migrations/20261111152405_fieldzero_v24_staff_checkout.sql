
do $$
declare v_old text; v_new text; v_def text;
begin
 for v_old,v_new in select * from (values
  ('fz_admin_create_invoice','fz_staff_invoice_internal'),
  ('fz_admin_record_invoice_payment','fz_staff_record_payment'),
  ('fz_admin_record_booking_advance','fz_staff_record_advance'),
  ('fz_admin_create_no_deposit_booking_invoice','fz_staff_create_arrival_invoice'),
  ('fz_admin_update_booking_final_bill','fz_staff_finalize_bill'),
  ('fz_admin_review_special_booking','fz_staff_review_special_booking'),
  ('review_player_application','fz_staff_review_operator')
 ) as t(old_name,new_name) loop
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=v_old order by p.oid limit 1;
  if v_def is null then raise exception 'Required billing function % is missing',v_old; end if;
  v_def:=replace(v_def,'FUNCTION public.'||v_old||'(', 'FUNCTION public.'||v_new||'(');
  v_def:=replace(v_def,'public.fz_can_manage_field(', 'public.fz_staff_can_process_field(');
  v_def:=replace(v_def,'public.fz_admin_create_invoice(', 'public.fz_staff_invoice_internal(');
  v_def:=replace(v_def,'public.fz_admin_record_invoice_payment(', 'public.fz_staff_record_payment(');
  if v_old='review_player_application' then
    v_def:=replace(v_def,'public.is_fieldzero_admin()', 'public.fz_staff_can_review_operators()');
  end if;
  if v_old='fz_admin_record_invoice_payment' then
    v_def:=replace(v_def,'if p_amount is null or p_amount<=0 then',
     'if not exists (select 1 from public.arena_bookings b where b.invoice_id=p_invoice_id and b.field_id=v_invoice.field_id and b.status=''approved'') then raise exception ''Staff can take payments only for approved bookings''; end if;
      if p_amount is null or p_amount<=0 then');
  end if;
  execute v_def;
 end loop;
end $$;

create table public.fz_booking_confirmations(
 booking_id uuid primary key references public.arena_bookings(id) on delete cascade,
 marked_sent_at timestamptz not null default now(),
 marked_by uuid not null references auth.users(id),
 delivery_method text not null default 'whatsapp_manual'
);
alter table public.fz_booking_confirmations enable row level security;
create policy fz_confirmations_staff_read on public.fz_booking_confirmations for select to authenticated
using(exists(select 1 from public.arena_bookings b where b.id=booking_id and public.fz_staff_can_process_field(b.field_id)));
grant select on public.fz_booking_confirmations to authenticated;
create or replace function public.fz_staff_mark_confirmation(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare b public.arena_bookings%rowtype;
begin
 select * into b from public.arena_bookings where id=p_booking_id;
 if not found or not public.fz_staff_can_process_field(b.field_id) then raise exception 'Booking unavailable'; end if;
 if b.status<>'approved' then raise exception 'Only approved reservations can be marked sent'; end if;
 insert into public.fz_booking_confirmations(booking_id,marked_by) values(p_booking_id,auth.uid())
 on conflict(booking_id) do update set marked_sent_at=now(),marked_by=auth.uid();
end;$$;
revoke all on function public.fz_staff_invoice_internal(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.fz_staff_record_payment(uuid,numeric,date,text,uuid,text,text,uuid),
 public.fz_staff_record_advance(uuid,text,uuid,text,date,text),
 public.fz_staff_create_arrival_invoice(uuid,numeric),
 public.fz_staff_finalize_bill(uuid,jsonb,numeric,numeric),
 public.fz_staff_review_special_booking(uuid,text,text),
 public.fz_staff_review_operator(uuid,text),
 public.fz_staff_mark_confirmation(uuid) from public,anon;
grant execute on function public.fz_staff_record_payment(uuid,numeric,date,text,uuid,text,text,uuid),
 public.fz_staff_record_advance(uuid,text,uuid,text,date,text),
 public.fz_staff_create_arrival_invoice(uuid,numeric),
 public.fz_staff_finalize_bill(uuid,jsonb,numeric,numeric),
 public.fz_staff_review_special_booking(uuid,text,text),
 public.fz_staff_review_operator(uuid,text),
 public.fz_staff_mark_confirmation(uuid) to authenticated;
