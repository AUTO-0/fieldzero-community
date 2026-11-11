
do $$
declare v_def text;
begin
 select pg_get_functiondef('public.fz_staff_finalize_bill(uuid,jsonb,numeric,numeric)'::regprocedure) into v_def;
 if position('v_balance NUMERIC(14,2);' in v_def)=0 or position('IF v_discount<0 OR v_tax_rate<0' in v_def)=0 then
  raise exception 'Staff checkout function source has changed; do not patch automatically';
 end if;
 v_def:=replace(v_def,'v_balance NUMERIC(14,2);','v_balance NUMERIC(14,2); v_config_price NUMERIC(14,2); v_price_note TEXT; v_min_charge NUMERIC(14,2);');
 v_def:=replace(v_def,'IF v_discount<0 OR v_tax_rate<0',
 'IF NOT public.is_fieldzero_admin() THEN
    IF v_discount<>0 OR v_tax_rate<>0 THEN RAISE EXCEPTION ''Workers cannot change discounts or tax settings''; END IF;
    SELECT sp.price_amount,sp.price_note INTO v_config_price,v_price_note
    FROM public.session_prices sp WHERE sp.package_name=b.experience AND sp.active AND sp.requestable LIMIT 1;
    IF FOUND AND v_config_price IS NOT NULL THEN
      v_min_charge:=v_config_price * CASE WHEN lower(coalesce(v_price_note,''''))
        LIKE ''%per player%'' THEN b.player_count ELSE 1 END;
      IF COALESCE((p_items->0->>''unit_price'')::numeric,0) < v_min_charge THEN
        RAISE EXCEPTION ''The session charge is lower than the owner-set package price (LKR %)'',v_min_charge;
      END IF;
    END IF;
  END IF;
  IF v_discount<0 OR v_tax_rate<0');
 execute v_def;
end;$$;
