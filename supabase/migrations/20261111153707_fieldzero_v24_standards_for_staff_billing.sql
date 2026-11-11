
do $$
declare v_def text;
begin
 select pg_get_functiondef('public.fz_staff_finalize_bill(uuid,jsonb,numeric,numeric)'::regprocedure) into v_def;
 if position('COALESCE((p_items->0->>''unit_price'')::numeric,0) < v_min_charge' in v_def)=0 then
  raise exception 'Worker price guard changed unexpectedly';end if;
 v_def:=replace(v_def,
  'COALESCE((p_items->0->>''unit_price'')::numeric,0) < v_min_charge',
  '(COALESCE((p_items->0->>''unit_price'')::numeric,0) * COALESCE((p_items->0->>''quantity'')::numeric,1)) < v_min_charge');
 execute v_def;
 select pg_get_functiondef('public.fz_staff_create_arrival_invoice(uuid,numeric)'::regprocedure) into v_def;
 if position('v_field_name text;' in lower(v_def))=0 then raise exception 'Unexpected invoice signature'; end if;
 v_def:=replace(v_def,'v_field_name text;','v_field_name text; v_list_price numeric; v_price_note text; v_min_charge numeric;');
 if position('SELECT name INTO v_field_name' in v_def)=0 then raise exception 'Invoice pricing insertion point missing';end if;
 v_def:=replace(v_def,'SELECT name INTO v_field_name',
 'IF NOT public.is_fieldzero_admin() THEN
    SELECT sp.price_amount,sp.price_note INTO v_list_price,v_price_note
    FROM public.session_prices sp WHERE sp.package_name=b.experience and sp.active AND sp.requestable LIMIT 1;
    IF v_list_price IS NULL THEN
      IF b.quoted_amount IS NULL OR b.quoted_amount<=0 THEN
        RAISE EXCEPTION ''Ask the owner to approve a quote for this custom booking'';
      END IF;
      v_min_charge:=b.quoted_amount;
    ELSE
      v_min_charge:=v_list_price * CASE WHEN lower(coalesce(v_price_note,''''))
        LIKE ''%per player%'' THEN b.player_count ELSE 1 END;
    END IF;
    IF v_total<v_min_charge THEN RAISE EXCEPTION ''Amount is below the owner-set session price (LKR %)'',v_min_charge; END IF;
  END IF;
  SELECT name INTO v_field_name');
 execute v_def;
end $$;
