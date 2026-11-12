
-- FIELDZERO Customer App V28: server-verified ownership of booking records.
-- No customer or staff records are erased or rewritten.
CREATE TABLE IF NOT EXISTS public.fz_app_booking_owners (
 booking_id uuid PRIMARY KEY REFERENCES public.arena_bookings(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 linked_at timestamptz NOT NULL DEFAULT now(),
 link_method text NOT NULL CHECK(link_method IN ('in_app','verified_claim'))
);
CREATE INDEX IF NOT EXISTS fz_app_booking_owners_user_idx
 ON public.fz_app_booking_owners(user_id,linked_at DESC);
ALTER TABLE public.fz_app_booking_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fz_app_booking_owners FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fz_app_create_booking(p_booking jsonb)
RETURNS TABLE(id uuid, booking_reference text, status text, booking_start timestamptz, booking_end timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $function$
DECLARE v_user uuid:=auth.uid();v_email text;v_b record;v_input jsonb;v_name text;v_callsign text;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in before booking in the app'; END IF;
 SELECT lower(email) INTO v_email FROM auth.users WHERE id=v_user AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verify your account email before booking'; END IF;
 IF p_booking IS NULL OR jsonb_typeof(p_booking)<>'object' THEN RAISE EXCEPTION 'Booking details missing'; END IF;
 v_name:=trim(coalesce(p_booking->>'real_name',''));
 v_callsign:=trim(coalesce(p_booking->>'callsign',''));
 IF char_length(v_name)<2 OR char_length(v_name)>100 OR char_length(v_callsign)<2 OR char_length(v_callsign)>40
 THEN RAISE EXCEPTION 'Provide your name and callsign'; END IF;
 -- Existing field booking RPC retains all price, date, capacity, availability and safety validation.
 v_input:=p_booking || jsonb_build_object('customer_email',v_email,'marketing_source','other');
 SELECT * INTO v_b FROM public.fz_submit_arena_booking(v_input);
 IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking reference not returned'; END IF;
 INSERT INTO public.fz_app_booking_owners(booking_id,user_id,link_method)
 VALUES(v_b.id,v_user,'in_app');
 RETURN QUERY SELECT v_b.id,v_b.booking_reference,v_b.status,v_b.booking_start,v_b.booking_end;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fz_app_my_bookings()
RETURNS TABLE (
 id uuid, booking_reference text, field_id uuid, real_name text, callsign text,
 experience text, booking_start timestamptz, booking_end timestamptz, player_count integer,
 special_request boolean, status text, payment_status text, deposit_required_amount numeric,
 quoted_amount numeric, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth,pg_temp AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to see your bookings'; END IF;
 RETURN QUERY SELECT
 b.id,b.booking_reference,b.field_id,b.real_name,b.callsign,
 b.experience,b.booking_start,b.booking_end,b.player_count,
 b.special_request,b.status,b.payment_status,b.deposit_required_amount,
 b.quoted_amount,b.created_at
 FROM public.fz_app_booking_owners owned
 JOIN public.arena_bookings b ON b.id=owned.booking_id
 WHERE owned.user_id=auth.uid()
 ORDER BY b.booking_start DESC LIMIT 150;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fz_app_claim_booking(p_reference text,p_mobile text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $function$
DECLARE v_user uuid:=auth.uid();v_email text;v_ref text;v_mobile text;v_booking public.arena_bookings%rowtype;v_owner uuid;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in to claim a booking'; END IF;
 SELECT lower(email) INTO v_email FROM auth.users WHERE id=v_user AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Verify your account email to link an older booking'; END IF;
 v_ref:=upper(trim(coalesce(p_reference,'')));
 v_mobile:=regexp_replace(coalesce(p_mobile,''),'[^0-9]','','g');
 IF length(v_ref)<6 OR length(v_ref)>80 OR length(v_mobile)<9 THEN
   RAISE EXCEPTION 'Enter the booking confirmation reference and booking mobile number';
 END IF;
 SELECT * INTO v_booking FROM public.arena_bookings
 WHERE upper(booking_reference)=v_ref
 AND lower(trim(coalesce(customer_email,'')))=v_email
 AND right(regexp_replace(coalesce(mobile,''),'[^0-9]','','g'),9)=right(v_mobile,9)
 LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'No matching booking. Confirm the original email, reference and mobile; contact FIELDZERO if needed'; END IF;
 SELECT user_id INTO v_owner FROM public.fz_app_booking_owners
 WHERE booking_id=v_booking.id FOR UPDATE;
 IF v_owner IS NOT NULL AND v_owner<>v_user THEN
   RAISE EXCEPTION 'This booking is already linked to a customer account. Contact FIELDZERO';
 END IF;
 INSERT INTO public.fz_app_booking_owners(booking_id,user_id,link_method)
 VALUES(v_booking.id,v_user,'verified_claim')
 ON CONFLICT(booking_id) DO NOTHING;
 RETURN v_booking.booking_reference;
END;
$function$;
REVOKE ALL ON FUNCTION public.fz_app_create_booking(jsonb),
 public.fz_app_my_bookings(),public.fz_app_claim_booking(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fz_app_create_booking(jsonb),
 public.fz_app_my_bookings(),public.fz_app_claim_booking(text,text) TO authenticated;
