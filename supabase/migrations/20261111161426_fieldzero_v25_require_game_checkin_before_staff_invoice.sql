
DO $$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.fz_staff_create_arrival_invoice(uuid,numeric)'::regprocedure) INTO def;
 IF position('IF b.invoice_id IS NOT NULL THEN' IN def)=0 THEN RAISE EXCEPTION 'Invoice method source changed'; END IF;
 def:=replace(def,'IF b.invoice_id IS NOT NULL THEN',
 'IF NOT public.is_fieldzero_admin() AND NOT EXISTS
   (SELECT 1 FROM public.fz_game_sessions s WHERE s.booking_id=b.id) THEN
   RAISE EXCEPTION ''Check in the customer and record game equipment before creating the visit invoice'';
  END IF;
  IF b.invoice_id IS NOT NULL THEN');
 EXECUTE def;

 SELECT pg_get_functiondef('public.fz_staff_finalize_bill(uuid,jsonb,numeric,numeric)'::regprocedure) INTO def;
 IF position('IF b.invoice_id IS NULL THEN' IN def)=0 THEN RAISE EXCEPTION 'Checkout source changed'; END IF;
 def:=replace(def,'IF b.invoice_id IS NULL THEN',
 'IF NOT public.is_fieldzero_admin() AND NOT EXISTS
   (SELECT 1 FROM public.fz_game_sessions s WHERE s.booking_id=b.id) THEN
   RAISE EXCEPTION ''Check in the customer before finalizing the visit invoice'';
  END IF;
  IF b.invoice_id IS NULL THEN');
 EXECUTE def;
END;$$;
