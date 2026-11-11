
-- FIELDZERO V24: field staff and session inventory.
-- Additive migration: preserves existing bookings, invoices, players and admin settings.
create table if not exists public.fz_workers (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 field_id uuid not null references public.arena_fields(id),
 email text not null, display_name text not null,
 active boolean not null default true,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(field_id,email)
);
create index if not exists fz_workers_field_active_idx on public.fz_workers(field_id,active);
alter table public.fz_workers enable row level security;

create or replace function public.fz_staff_can_process_field(p_field_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
 select public.fz_can_manage_field(p_field_id)
 or exists(select 1 from public.fz_workers w join public.arena_fields f on f.id=w.field_id
 where w.user_id=auth.uid() and w.field_id=p_field_id and w.active=true and f.active=true and f.network_status='active');
$$;
create or replace function public.fz_staff_can_review_operators()
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
 select public.is_fieldzero_admin()
 or exists(select 1 from public.fz_workers w join public.arena_fields f on f.id=w.field_id
 where w.user_id=auth.uid() and w.active and f.is_main and f.active and f.network_status='active');
$$;
revoke all on function public.fz_staff_can_process_field(uuid), public.fz_staff_can_review_operators() from public,anon;
grant execute on function public.fz_staff_can_process_field(uuid), public.fz_staff_can_review_operators() to authenticated;

create policy fz_workers_self_or_owner_read on public.fz_workers for select to authenticated
using(user_id=auth.uid() or public.is_fieldzero_admin());
grant select on public.fz_workers to authenticated;

create policy fz_staff_booking_read on public.arena_bookings for select to authenticated
using(public.fz_staff_can_process_field(field_id));
create policy fz_staff_operator_requests_read on public.player_applications for select to authenticated
using(public.fz_staff_can_review_operators());
create policy fz_staff_invoices_for_bookings on public.fz_invoices for select to authenticated
using(public.fz_staff_can_process_field(field_id) and exists(select 1 from public.arena_bookings b
 where b.invoice_id=fz_invoices.id and b.field_id=fz_invoices.field_id));
create policy fz_staff_invoice_lines_for_bookings on public.fz_invoice_items for select to authenticated
using(exists(select 1 from public.fz_invoices i join public.arena_bookings b on b.invoice_id=i.id
 where i.id=fz_invoice_items.invoice_id and public.fz_staff_can_process_field(b.field_id)));
create policy fz_staff_payments_for_bookings on public.fz_invoice_payments for select to authenticated
using(exists(select 1 from public.fz_invoices i join public.arena_bookings b on b.invoice_id=i.id
 where i.id=fz_invoice_payments.invoice_id and public.fz_staff_can_process_field(b.field_id)));
create policy fz_staff_financial_account_choices on public.fz_financial_accounts for select to authenticated
using(public.fz_staff_can_process_field(field_id));
grant select on public.arena_bookings,public.player_applications,public.fz_invoices,
 public.fz_invoice_items,public.fz_invoice_payments,public.fz_financial_accounts to authenticated;

create table public.fz_inventory_items(
 id uuid primary key default gen_random_uuid(),
 field_id uuid not null references public.arena_fields(id),
 sku text not null,
 name text not null,
 category text not null default 'Equipment',
 kind text not null check(kind in ('reusable','consumable')),
 unit text not null default 'pcs',
 stock_on_hand numeric(14,2) not null default 0 check(stock_on_hand>=0),
 reorder_point numeric(14,2) not null default 0 check(reorder_point>=0),
 active boolean not null default true,
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(field_id,sku)
);
create table public.fz_game_sessions(
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.arena_bookings(id) on delete restrict,
 field_id uuid not null references public.arena_fields(id),
 game_mode text not null,
 player_count integer not null check(player_count between 1 and 100),
 status text not null default 'open' check(status in ('open','completed')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 notes text not null default '',
 created_by uuid not null references auth.users(id),
 completed_by uuid references auth.users(id)
);
create index fz_game_sessions_field_idx on public.fz_game_sessions(field_id,started_at desc);
create table public.fz_inventory_issues (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.fz_game_sessions(id) on delete restrict,
 item_id uuid not null references public.fz_inventory_items(id) on delete restrict,
 quantity numeric(14,2) not null check(quantity>0),
 returned_qty numeric(14,2) not null default 0 check(returned_qty>=0 and returned_qty<=quantity),
 issued_at timestamptz not null default now(),
 issued_by uuid not null references auth.users(id),
 returned_at timestamptz,
 returned_by uuid references auth.users(id),
 notes text not null default ''
);
create index fz_inventory_issues_item_idx on public.fz_inventory_issues(item_id,issued_at desc);
create index fz_inventory_issues_session_idx on public.fz_inventory_issues(session_id);
create table public.fz_inventory_movements(
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.fz_inventory_items(id),
 session_id uuid references public.fz_game_sessions(id),
 movement text not null check(movement in ('setup','stock_adjustment','issue','return')),
 quantity numeric(14,2) not null,
 stock_after numeric(14,2),
 reason text not null default '',
 actor uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index fz_inventory_moves_item_idx on public.fz_inventory_movements(item_id,created_at desc);
alter table public.fz_inventory_items enable row level security;
alter table public.fz_game_sessions enable row level security;
alter table public.fz_inventory_issues enable row level security;
alter table public.fz_inventory_movements enable row level security;
create policy fz_inventory_read on public.fz_inventory_items for select to authenticated
using(public.fz_staff_can_process_field(field_id));
create policy fz_game_sessions_read on public.fz_game_sessions for select to authenticated
using(public.fz_staff_can_process_field(field_id));
create policy fz_inventory_issues_read on public.fz_inventory_issues for select to authenticated
using(exists(select 1 from public.fz_game_sessions s where s.id=session_id and public.fz_staff_can_process_field(s.field_id)));
create policy fz_inventory_movements_read on public.fz_inventory_movements for select to authenticated
using(exists(select 1 from public.fz_inventory_items i where i.id=item_id and public.fz_staff_can_process_field(i.field_id)));
grant select on public.fz_inventory_items, public.fz_game_sessions, public.fz_inventory_issues, public.fz_inventory_movements to authenticated;

-- Only the owner can add items, set quantities or archive equipment.
create or replace function public.fz_owner_save_stock(
 p_field_id uuid,p_sku text,p_name text,p_category text,p_kind text,p_unit text,
 p_stock numeric,p_reorder numeric,p_notes text default '',p_id uuid default null,p_active boolean default true)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_old public.fz_inventory_items%rowtype; v_change numeric;
begin
 if not public.is_fieldzero_admin() then raise exception 'Only the FIELDZERO owner can change inventory stock'; end if;
 if not exists(select 1 from public.arena_fields where id=p_field_id) then raise exception 'Invalid field'; end if;
 if length(trim(coalesce(p_sku,'')))<2 or length(trim(coalesce(p_name,'')))<2 then raise exception 'SKU and item name are required'; end if;
 if p_kind not in ('reusable','consumable') or p_stock is null or p_stock<0 or p_reorder<0 then raise exception 'Invalid type or stock quantity'; end if;
 if p_kind='reusable' and p_stock<>trunc(p_stock) then raise exception 'Reusable item quantity must be a whole number'; end if;
 if p_id is null then
  insert into public.fz_inventory_items(field_id,sku,name,category,kind,unit,stock_on_hand,reorder_point,notes,active)
  values(p_field_id,upper(left(trim(p_sku),40)),left(trim(p_name),100),left(trim(coalesce(p_category,'Equipment')),60),
    p_kind,left(trim(coalesce(p_unit,'pcs')),15),p_stock,p_reorder,left(coalesce(p_notes,''),1000),p_active)
  returning id into v_id;
  v_change:=p_stock;
  insert into public.fz_inventory_movements(item_id,movement,quantity,stock_after,reason,actor)
  values(v_id,'setup',v_change,p_stock,'Initial stock',auth.uid());
 else
  select * into v_old from public.fz_inventory_items where id=p_id and field_id=p_field_id for update;
  if not found then raise exception 'Item does not belong to this field'; end if;
  if p_kind<>v_old.kind and exists(select 1 from public.fz_inventory_issues where item_id=p_id) then raise exception 'Cannot change the type of an item with usage history'; end if;
  if p_kind='reusable' and p_stock < (select coalesce(sum(x.quantity-x.returned_qty),0)
    from public.fz_inventory_issues x where x.item_id=p_id) then raise exception 'Stock cannot be less than outstanding reusable issues'; end if;
  update public.fz_inventory_items
  set sku=upper(left(trim(p_sku),40)),name=left(trim(p_name),100),category=left(trim(coalesce(p_category,'Equipment')),60),
  kind=p_kind,unit=left(trim(coalesce(p_unit,'pcs')),15),stock_on_hand=p_stock,reorder_point=p_reorder,
  notes=left(coalesce(p_notes,''),1000),active=p_active,updated_at=now()
  where id=p_id;
  v_id:=p_id;v_change:=p_stock-v_old.stock_on_hand;
  if v_change<>0 then
   insert into public.fz_inventory_movements(item_id,movement,quantity,stock_after,reason,actor)
   values(v_id,'stock_adjustment',v_change,p_stock,'Owner stock correction',auth.uid());
  end if;
 end if;
 return v_id;
end;$$;

create or replace function public.fz_staff_open_game(p_booking_id uuid,p_players integer default null,p_notes text default '')
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare b public.arena_bookings%rowtype; v_id uuid; v_count integer;
begin
 select * into b from public.arena_bookings where id=p_booking_id for update;
 if not found or not public.fz_staff_can_process_field(b.field_id) then raise exception 'Booking unavailable'; end if;
 if b.status<>'approved' then raise exception 'Only approved bookings can start a game'; end if;
 v_count:=coalesce(p_players,b.player_count);
 if v_count<1 or v_count>100 then raise exception 'Invalid player count'; end if;
 insert into public.fz_game_sessions(booking_id,field_id,game_mode,player_count,notes,created_by)
 values(b.id,b.field_id,coalesce(nullif(b.experience,''),'Field game'),v_count,left(p_notes,1000),auth.uid())
 on conflict(booking_id) do nothing returning id into v_id;
 if v_id is null then select id into v_id from public.fz_game_sessions where booking_id=b.id; end if;
 return v_id;
end;$$;

create or replace function public.fz_staff_issue_item(p_session_id uuid,p_item_id uuid,p_quantity numeric,p_notes text default '')
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare s public.fz_game_sessions%rowtype; i public.fz_inventory_items%rowtype; v_out numeric; v_id uuid;
begin
 select * into s from public.fz_game_sessions where id=p_session_id;
 if not found or s.status<>'open' or not public.fz_staff_can_process_field(s.field_id) then raise exception 'Session is closed or access denied'; end if;
 select * into i from public.fz_inventory_items where id=p_item_id and field_id=s.field_id and active for update;
 if not found then raise exception 'Inventory item not found for the session field'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>1000000 then raise exception 'Quantity must be greater than zero'; end if;
 if i.kind='reusable' then
  if p_quantity<>trunc(p_quantity) then raise exception 'Reusable equipment must be issued in whole units'; end if;
  select coalesce(sum(quantity-returned_qty),0) into v_out from public.fz_inventory_issues where item_id=i.id;
  if p_quantity>i.stock_on_hand-v_out then raise exception 'Not enough reusable equipment available'; end if;
 else
  if p_quantity>i.stock_on_hand then raise exception 'Not enough consumable stock available'; end if;
  update public.fz_inventory_items set stock_on_hand=stock_on_hand-p_quantity,updated_at=now() where id=i.id;
 end if;
 insert into public.fz_inventory_issues(session_id,item_id,quantity,notes,issued_by)
 values(s.id,i.id,p_quantity,left(coalesce(p_notes,''),600),auth.uid()) returning id into v_id;
 insert into public.fz_inventory_movements(item_id,session_id,movement,quantity,stock_after,reason,actor)
 values(i.id,s.id,'issue',-p_quantity,case when i.kind='consumable' then i.stock_on_hand-p_quantity else i.stock_on_hand end,
   'Session issue',auth.uid());
 return v_id;
end;$$;

create or replace function public.fz_staff_return_item(p_issue_id uuid,p_quantity numeric)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare u public.fz_inventory_issues%rowtype; i public.fz_inventory_items%rowtype; s public.fz_game_sessions%rowtype;
begin
 select * into u from public.fz_inventory_issues where id=p_issue_id for update;
 if not found then raise exception 'Issue not found'; end if;
 select * into s from public.fz_game_sessions where id=u.session_id;
 if not public.fz_staff_can_process_field(s.field_id) then raise exception 'Field access denied'; end if;
 select * into i from public.fz_inventory_items where id=u.item_id for update;
 if i.kind<>'reusable' then raise exception 'Consumables cannot be returned to stock'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) or p_quantity>u.quantity-u.returned_qty then
   raise exception 'Return quantity exceeds outstanding equipment'; end if;
 update public.fz_inventory_issues set returned_qty=returned_qty+p_quantity,returned_at=now(),returned_by=auth.uid() where id=u.id;
 insert into public.fz_inventory_movements(item_id,session_id,movement,quantity,stock_after,reason,actor)
 values(i.id,s.id,'return',p_quantity,i.stock_on_hand,'Reusable item returned',auth.uid());
end;$$;

create or replace function public.fz_staff_complete_game(p_session_id uuid,p_players integer default null,p_notes text default '')
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare s public.fz_game_sessions%rowtype; v_out numeric;
begin
 select * into s from public.fz_game_sessions where id=p_session_id for update;
 if not found or not public.fz_staff_can_process_field(s.field_id) then raise exception 'Session unavailable'; end if;
 if s.status='completed' then raise exception 'Game was already completed'; end if;
 select coalesce(sum(u.quantity-u.returned_qty),0) into v_out from public.fz_inventory_issues u join public.fz_inventory_items i on i.id=u.item_id
 where u.session_id=p_session_id and i.kind='reusable';
 if v_out>0 then raise exception 'Return reusable items before closing the game (% outstanding)',v_out; end if;
 if coalesce(p_players,s.player_count)<1 or coalesce(p_players,s.player_count)>100 then raise exception 'Invalid player count'; end if;
 update public.fz_game_sessions set status='completed',finished_at=now(),completed_by=auth.uid(),
 player_count=coalesce(p_players,player_count),notes=left(concat_ws(E'\n',nullif(notes,''),nullif(p_notes,'')),1000) where id=p_session_id;
end;$$;

-- Stats sourced from real usage; no prediction is shown before historical consumption exists.
create view public.fz_inventory_forecast with (security_invoker=true) as
select i.id,i.field_id,i.name,i.sku,i.category,i.kind,i.unit,i.stock_on_hand,i.reorder_point,i.active,
 coalesce((select sum(x.quantity-x.returned_qty) from public.fz_inventory_issues x where x.item_id=i.id),0) as outstanding_reusable,
 coalesce((select sum(x.quantity) from public.fz_inventory_issues x where x.item_id=i.id and x.issued_at>=now()-interval '7 days'),0) as issued_7d,
 coalesce((select sum(x.quantity) from public.fz_inventory_issues x where x.item_id=i.id and x.issued_at>=now()-interval '30 days'),0) as issued_30d,
 (select count(distinct x.session_id) from public.fz_inventory_issues x where x.item_id=i.id and x.issued_at>=now()-interval '30 days') as used_sessions_30d,
 (select count(*) from public.arena_bookings b where b.field_id=i.field_id and b.status='approved'
   and b.booking_start>=now() and b.booking_start<now()+interval '30 days') as booked_next_30d
from public.fz_inventory_items i;
grant select on public.fz_inventory_forecast to authenticated;
-- Default EXECUTE on new SECURITY DEFINER functions is intentionally removed from anon.
revoke all on function public.fz_owner_save_stock(uuid,text,text,text,text,text,numeric,numeric,text,uuid,boolean),
 public.fz_staff_open_game(uuid,integer,text),public.fz_staff_issue_item(uuid,uuid,numeric,text),
 public.fz_staff_return_item(uuid,numeric),public.fz_staff_complete_game(uuid,integer,text) from public,anon;
grant execute on function public.fz_owner_save_stock(uuid,text,text,text,text,text,numeric,numeric,text,uuid,boolean),
 public.fz_staff_open_game(uuid,integer,text),public.fz_staff_issue_item(uuid,uuid,numeric,text),
 public.fz_staff_return_item(uuid,numeric),public.fz_staff_complete_game(uuid,integer,text) to authenticated;
