
-- FIELDZERO V25: one-step visit check-in plus sale catalog and partner leads.
-- Additive: no bookings or stock are removed.

CREATE OR REPLACE FUNCTION public.fz_staff_checkin_bundle(
 p_booking_id uuid,p_actual_players integer,p_issue_lines jsonb,p_notes text default '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $$
DECLARE b public.arena_bookings%rowtype; s_id uuid; entry jsonb; n integer; item uuid; qty numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to operate this visit'; END IF;
 SELECT * INTO b FROM public.arena_bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR NOT public.fz_staff_can_process_field(b.field_id) THEN RAISE EXCEPTION 'Booking not found or access denied'; END IF;
 IF b.status <> 'approved' THEN RAISE EXCEPTION 'Confirm the booking before checking in'; END IF;
 IF p_actual_players NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter 1 to 100 players'; END IF;
 IF p_issue_lines IS NULL OR jsonb_typeof(p_issue_lines)<>'array' OR jsonb_array_length(p_issue_lines)>40 THEN
   RAISE EXCEPTION 'Enter a valid equipment list (up to 40 lines)';
 END IF;
 SELECT id INTO s_id FROM public.fz_game_sessions WHERE booking_id=p_booking_id FOR UPDATE;
 IF s_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.fz_inventory_issues WHERE session_id=s_id) THEN
   RAISE EXCEPTION 'This booking has already been checked in. Open the existing game record to issue additional equipment.';
 END IF;
 IF s_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.fz_game_sessions WHERE id=s_id AND status='completed') THEN
   RAISE EXCEPTION 'This booking game was already completed';
 END IF;
 s_id:=public.fz_staff_open_game(p_booking_id,p_actual_players,LEFT(COALESCE(p_notes,''),1000));
 UPDATE public.fz_game_sessions SET player_count=p_actual_players WHERE id=s_id AND status='open';
 FOR entry IN SELECT value FROM jsonb_array_elements(p_issue_lines) LOOP
   IF jsonb_typeof(entry)<>'object' THEN RAISE EXCEPTION 'Invalid equipment line'; END IF;
   item:=nullif(entry->>'item_id','')::uuid;
   qty:=nullif(entry->>'quantity','')::numeric;
   IF item IS NULL OR qty IS NULL OR qty<=0 THEN RAISE EXCEPTION 'Invalid issue quantity or item'; END IF;
   IF EXISTS (SELECT 1 FROM public.fz_inventory_issues WHERE session_id=s_id AND item_id=item) THEN
     RAISE EXCEPTION 'Duplicate item in this visit: %', item;
   END IF;
   PERFORM public.fz_staff_issue_item(s_id,item,qty,'Visit check-in');
 END LOOP;
 RETURN s_id;
END;$$;

CREATE OR REPLACE FUNCTION public.fz_staff_finish_visit(
 p_session_id uuid,p_returns_verified boolean,p_notes text default '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $$
DECLARE s public.fz_game_sessions%rowtype; issue record;
BEGIN
 SELECT * INTO s FROM public.fz_game_sessions WHERE id=p_session_id FOR UPDATE;
 IF NOT FOUND OR NOT public.fz_staff_can_process_field(s.field_id) THEN RAISE EXCEPTION 'Game unavailable'; END IF;
 IF s.status='completed' THEN RAISE EXCEPTION 'Game already completed'; END IF;
 FOR issue IN SELECT x.id,x.quantity-x.returned_qty AS outstanding
 FROM public.fz_inventory_issues x
 JOIN public.fz_inventory_items i ON i.id=x.item_id
 WHERE x.session_id=p_session_id AND i.kind='reusable' AND x.quantity>x.returned_qty
 LOOP
   IF NOT COALESCE(p_returns_verified,false) THEN
    RAISE EXCEPTION 'Please physically count and confirm all reusable equipment before completing the game';
   END IF;
   PERFORM public.fz_staff_return_item(issue.id,issue.outstanding);
 END LOOP;
 PERFORM public.fz_staff_complete_game(p_session_id,NULL,
 LEFT(CONCAT_WS(' / ',NULLIF(p_notes,''),CASE WHEN p_returns_verified THEN
 'Reusable equipment physically counted and returned by staff' END),1000));
END;$$;

REVOKE ALL ON FUNCTION public.fz_staff_checkin_bundle(uuid,integer,jsonb,text),
 public.fz_staff_finish_visit(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fz_staff_checkin_bundle(uuid,integer,jsonb,text),
 public.fz_staff_finish_visit(uuid,boolean,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.fz_shop_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sku text NOT NULL UNIQUE,
 title text NOT NULL,
 category text NOT NULL,
 short_description text NOT NULL DEFAULT '',
 details text NOT NULL DEFAULT '',
 price_lkr numeric(12,2) NOT NULL DEFAULT 0 CHECK(price_lkr>=0),
 stock_qty integer NOT NULL DEFAULT 0 CHECK(stock_qty>=0),
 image_url text NOT NULL DEFAULT '',
 featured boolean NOT NULL DEFAULT false,
 published boolean NOT NULL DEFAULT false,
 status_label text NOT NULL DEFAULT 'IN STOCK',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fz_shop_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY fz_shop_products_public_view ON public.fz_shop_products FOR SELECT TO anon,authenticated
USING(published OR public.is_fieldzero_admin());
GRANT SELECT ON public.fz_shop_products TO anon,authenticated;

CREATE TABLE IF NOT EXISTS public.fz_shop_stock_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES public.fz_shop_products(id),
 change_qty integer NOT NULL,
 stock_after integer NOT NULL,
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.fz_shop_stock_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fz_shop_owner_event_read ON public.fz_shop_stock_events FOR SELECT TO authenticated
USING(public.is_fieldzero_admin());
GRANT SELECT ON public.fz_shop_stock_events TO authenticated;

CREATE OR REPLACE FUNCTION public.fz_owner_upsert_shop_product(p_product jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE v_id uuid; v_old public.fz_shop_products%rowtype; v_sku text; v_title text;
 v_price numeric(12,2); v_stock integer; v_image text; v_category text;
BEGIN
 IF NOT public.is_fieldzero_admin() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF p_product IS NULL OR jsonb_typeof(p_product)<>'object' THEN RAISE EXCEPTION 'Product details are required'; END IF;
 v_id:=nullif(p_product->>'id','')::uuid;
 v_sku:=upper(trim(p_product->>'sku'));v_title:=trim(p_product->>'title');
 v_category:=trim(p_product->>'category');v_image:=trim(coalesce(p_product->>'image_url',''));
 v_price:=nullif(p_product->>'price_lkr','')::numeric;
 v_stock:=nullif(p_product->>'stock_qty','')::integer;
 IF length(v_sku)<2 OR length(v_sku)>40 OR length(v_title)<3 OR length(v_title)>120 OR
 length(v_category)<3 OR length(v_category)>60 OR v_price IS NULL OR v_price<0 OR v_stock IS NULL OR v_stock<0
 THEN RAISE EXCEPTION 'Check SKU, title, category, price and stock'; END IF;
 IF v_image<>'' AND (length(v_image)>1200 OR v_image !~* '^https://') THEN RAISE EXCEPTION 'Use a valid HTTPS image URL'; END IF;
 IF v_id IS NULL THEN
  INSERT INTO public.fz_shop_products(sku,title,category,short_description,details,price_lkr,stock_qty,image_url,featured,published,status_label)
  VALUES (v_sku,v_title,v_category,left(coalesce(p_product->>'short_description',''),240),
  left(coalesce(p_product->>'details',''),2000),v_price,v_stock,v_image,
  coalesce((p_product->>'featured')::boolean,false),coalesce((p_product->>'published')::boolean,false),
  left(coalesce(nullif(p_product->>'status_label',''),'IN STOCK'),40))
  RETURNING id INTO v_id;
  INSERT INTO public.fz_shop_stock_events(product_id,change_qty,stock_after,note,created_by)
  VALUES(v_id,v_stock,v_stock,'Initial listed stock',auth.uid());
 ELSE
  SELECT * INTO v_old FROM public.fz_shop_products WHERE id=v_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  UPDATE public.fz_shop_products SET sku=v_sku,title=v_title,category=v_category,
  short_description=left(coalesce(p_product->>'short_description',''),240),
  details=left(coalesce(p_product->>'details',''),2000),price_lkr=v_price,
  stock_qty=v_stock,image_url=v_image,featured=coalesce((p_product->>'featured')::boolean,false),
  published=coalesce((p_product->>'published')::boolean,false),
  status_label=left(coalesce(nullif(p_product->>'status_label',''),'IN STOCK'),40),
  updated_at=now() WHERE id=v_id;
  IF v_stock<>v_old.stock_qty THEN
   INSERT INTO public.fz_shop_stock_events(product_id,change_qty,stock_after,note,created_by)
   VALUES(v_id,v_stock-v_old.stock_qty,v_stock,'Owner stock adjustment',auth.uid());
  END IF;
 END IF;
 RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.fz_owner_upsert_shop_product(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fz_owner_upsert_shop_product(jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.fz_partner_leads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 inquiry_type text NOT NULL CHECK(inquiry_type IN ('sponsor','brand_partner','field_partner')),
 organization text NOT NULL CHECK(length(organization) BETWEEN 2 AND 120),
 contact_name text NOT NULL CHECK(length(contact_name) BETWEEN 2 AND 100),
 email text NOT NULL CHECK(length(email) BETWEEN 5 AND 200),
 mobile text NOT NULL DEFAULT '',
 message text NOT NULL CHECK(length(message) BETWEEN 15 AND 1500),
 consent boolean NOT NULL DEFAULT false CHECK(consent=true),
 status text NOT NULL DEFAULT 'new',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fz_partner_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY fz_partner_leads_public_insert ON public.fz_partner_leads FOR INSERT TO anon,authenticated
WITH CHECK(status='new' AND consent=true);
CREATE POLICY fz_partner_leads_admin_select ON public.fz_partner_leads FOR SELECT TO authenticated
USING(public.is_fieldzero_admin());
GRANT INSERT ON public.fz_partner_leads TO anon,authenticated;
GRANT SELECT ON public.fz_partner_leads TO authenticated;
