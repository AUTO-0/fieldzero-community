
-- FIELDZERO V25: request-to-order retail flow; stock is not sold until owner marks fulfilled.
CREATE TABLE public.fz_shop_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reference text NOT NULL UNIQUE DEFAULT ('FZ-SHOP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
 customer_name text NOT NULL CHECK(length(customer_name) between 2 and 100),
 mobile text NOT NULL CHECK(length(mobile) between 7 and 24),
 email text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 total_lkr numeric(14,2) NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK(status in ('pending','confirmed','cancelled','fulfilled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,processed_by uuid REFERENCES auth.users(id),
 privacy_consent boolean NOT NULL DEFAULT true
);
CREATE TABLE public.fz_shop_order_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.fz_shop_orders(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.fz_shop_products(id),
 title_snapshot text NOT NULL,
 unit_price_lkr numeric(12,2) NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 line_total_lkr numeric(14,2) NOT NULL
);
CREATE TABLE public.fz_shop_order_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.fz_shop_orders(id),
 old_status text NOT NULL,
 new_status text NOT NULL,
 actor uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fz_shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fz_shop_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fz_shop_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fz_shop_orders_owner_read ON public.fz_shop_orders FOR SELECT TO authenticated USING(public.is_fieldzero_admin());
CREATE POLICY fz_shop_order_items_owner_read ON public.fz_shop_order_items FOR SELECT TO authenticated
USING(public.is_fieldzero_admin());
CREATE POLICY fz_shop_order_events_owner_read ON public.fz_shop_order_events FOR SELECT TO authenticated USING(public.is_fieldzero_admin());
GRANT SELECT ON public.fz_shop_orders,public.fz_shop_order_items,public.fz_shop_order_events TO authenticated;

CREATE OR REPLACE FUNCTION public.fz_submit_shop_order(
 p_name text,p_mobile text,p_email text,p_notes text,p_items jsonb,p_consent boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_order uuid;v_ref text;item jsonb;pr public.fz_shop_products%rowtype;q integer;total numeric(14,2):=0;cnt integer;
BEGIN
 IF NOT p_consent THEN RAISE EXCEPTION 'Please accept the contact and booking privacy notice'; END IF;
 IF length(trim(coalesce(p_name,'')))<2 OR length(trim(coalesce(p_name,'')))>100
  OR length(trim(coalesce(p_mobile,'')))<7 OR length(trim(coalesce(p_mobile,'')))>24
  OR length(coalesce(p_email,''))>200 OR length(coalesce(p_notes,''))>500
 THEN RAISE EXCEPTION 'Check your contact details'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'Select between one and twelve different products'; END IF;
 -- Simple repeated-number guard; public orders are requests, not charged or fulfilled automatically.
 IF EXISTS(select 1 from public.fz_shop_orders where mobile=trim(p_mobile) AND created_at>now()-interval '2 minutes')
 THEN RAISE EXCEPTION 'A request was just received for this mobile. Try again in a few minutes.'; END IF;
 INSERT INTO public.fz_shop_orders(customer_name,mobile,email,notes,privacy_consent)
 VALUES(trim(p_name),trim(p_mobile),left(trim(coalesce(p_email,'')),200),left(trim(coalesce(p_notes,'')),500),true)
 RETURNING id,reference INTO v_order,v_ref;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  q:=nullif(item->>'quantity','')::integer;
  IF q IS NULL OR q NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid cart quantity'; END IF;
  SELECT * INTO pr FROM public.fz_shop_products WHERE id=nullif(item->>'product_id','')::uuid AND published=true AND stock_qty>=q;
  IF NOT FOUND THEN RAISE EXCEPTION 'A product is unavailable at the requested quantity. Refresh the shop.'; END IF;
  IF EXISTS(SELECT 1 FROM public.fz_shop_order_items WHERE order_id=v_order AND product_id=pr.id) THEN
   RAISE EXCEPTION 'Duplicate product in cart'; END IF;
  INSERT INTO public.fz_shop_order_items(order_id,product_id,title_snapshot,unit_price_lkr,quantity,line_total_lkr)
  VALUES(v_order,pr.id,pr.title,pr.price_lkr,q,round(pr.price_lkr*q,2));
  total:=total+round(pr.price_lkr*q,2);
 END LOOP;
 UPDATE public.fz_shop_orders SET total_lkr=total WHERE id=v_order;
 RETURN v_ref;
END;$$;
REVOKE ALL ON FUNCTION public.fz_submit_shop_order(text,text,text,text,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fz_submit_shop_order(text,text,text,text,jsonb,boolean) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.fz_owner_review_shop_order(p_order_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE ord public.fz_shop_orders%rowtype; entry record; pr public.fz_shop_products%rowtype;
BEGIN
 IF NOT public.is_fieldzero_admin() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF p_status NOT IN ('confirmed','cancelled','fulfilled') THEN RAISE EXCEPTION 'Invalid order action'; END IF;
 SELECT * INTO ord FROM public.fz_shop_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF ord.status IN ('cancelled','fulfilled') THEN RAISE EXCEPTION 'Order is already closed'; END IF;
 IF p_status='fulfilled' THEN
  IF ord.status<>'confirmed' THEN RAISE EXCEPTION 'Confirm the customer order and verify payment before marking fulfilled'; END IF;
  FOR entry IN SELECT * FROM public.fz_shop_order_items WHERE order_id=p_order_id ORDER BY product_id LOOP
   SELECT * INTO pr FROM public.fz_shop_products WHERE id=entry.product_id FOR UPDATE;
   IF pr.stock_qty<entry.quantity THEN RAISE EXCEPTION 'Not enough retail stock: %',pr.title; END IF;
   UPDATE public.fz_shop_products SET stock_qty=stock_qty-entry.quantity,updated_at=now() WHERE id=entry.product_id;
   INSERT INTO public.fz_shop_stock_events(product_id,change_qty,stock_after,note,created_by)
   VALUES(entry.product_id,-entry.quantity,pr.stock_qty-entry.quantity,'Fulfilled retail order '||ord.reference,auth.uid());
  END LOOP;
 END IF;
 UPDATE public.fz_shop_orders SET status=p_status,processed_at=now(),processed_by=auth.uid() WHERE id=p_order_id;
 INSERT INTO public.fz_shop_order_events(order_id,old_status,new_status,actor)
 VALUES(p_order_id,ord.status,p_status,auth.uid());
END;$$;
REVOKE ALL ON FUNCTION public.fz_owner_review_shop_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fz_owner_review_shop_order(uuid,text) TO authenticated;

-- A worker may not edit a fully-paid, closed booking invoice.
DO $$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.fz_staff_finalize_bill(uuid,jsonb,numeric,numeric)'::regprocedure) INTO d;
 IF position('SELECT * INTO inv FROM public.fz_invoices' in d)=0 THEN
   RAISE EXCEPTION 'Expected checkout definition not found';
 END IF;
 d:=replace(d,'IF NOT FOUND OR inv.status=''void'' THEN',
 'IF inv.status=''paid'' THEN RAISE EXCEPTION ''This invoice is fully paid and closed''; END IF;
  IF NOT FOUND OR inv.status=''void'' THEN');
 EXECUTE d;
END;$$;
