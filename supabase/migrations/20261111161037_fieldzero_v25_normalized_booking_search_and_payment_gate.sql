
CREATE OR REPLACE FUNCTION public.fz_staff_search_bookings(p_field_id uuid,p_query text)
RETURNS SETOF public.arena_bookings
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $$
DECLARE term text;digits text;last9 text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.fz_staff_can_process_field(p_field_id) THEN
  RAISE EXCEPTION 'Field access denied';
 END IF;
 term:=left(trim(coalesce(p_query,'')),90);
 digits:=regexp_replace(term,'[^0-9]','','g');
 IF length(term)<3 THEN RETURN; END IF;
 last9:=CASE WHEN length(digits)>=9 THEN right(digits,9) ELSE digits END;
 RETURN QUERY
 SELECT b.* FROM public.arena_bookings b
 WHERE b.field_id=p_field_id
 AND (
  b.booking_reference ILIKE '%'||term||'%'
  OR b.callsign ILIKE '%'||term||'%'
  OR b.real_name ILIKE '%'||term||'%'
  OR (length(digits)>=3 AND (
    regexp_replace(coalesce(b.mobile,''),'[^0-9]','','g') LIKE '%'||last9||'%'
   ))
 )
 ORDER BY b.booking_start DESC LIMIT 100;
END;$$;

REVOKE ALL ON FUNCTION public.fz_staff_search_bookings(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fz_staff_search_bookings(uuid,text) TO authenticated;

DO $$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.fz_staff_record_payment(uuid,numeric,date,text,uuid,text,text,uuid)'::regprocedure) INTO v_def;
 IF position('if p_amount is null or p_amount<=0 then' IN v_def)=0 THEN RAISE EXCEPTION 'Payment RPC changed unexpectedly'; END IF;
 v_def:=replace(v_def,
 'if p_amount is null or p_amount<=0 then',
 'if exists (
    select 1 from public.arena_bookings b
    where b.invoice_id=p_invoice_id and b.status=''approved'' and b.checkout_finalized_at is null
   ) then raise exception ''Finalize the customer bill before recording final payment''; end if;
   if p_amount is null or p_amount<=0 then');
 EXECUTE v_def;
END;$$;
