-- ============================================================
-- FIELDZERO V19 — USERNAME LOGIN
-- Run AFTER V18. Does not alter bookings, finance or franchise data.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.fz_member_login_names (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fz_member_login_username_format CHECK (username ~ '^[a-z0-9_-]{3,24}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS fz_member_login_username_uidx
  ON public.fz_member_login_names (lower(username));
ALTER TABLE public.fz_member_login_names ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fz_member_login_names FROM anon, authenticated;

-- Seed already-created V18 accounts from approved player records and pending applications.
INSERT INTO public.fz_member_login_names(user_id,username)
SELECT a.user_id, lower(regexp_replace(p.callsign,'[^A-Za-z0-9_-]','','g'))
FROM public.fz_member_accounts a JOIN public.players p ON p.id=a.player_id
WHERE a.active AND p.active
  AND regexp_replace(p.callsign,'[^A-Za-z0-9_-]','','g') ~ '^[A-Za-z0-9_-]{3,24}$'
ON CONFLICT(user_id) DO NOTHING;
INSERT INTO public.fz_member_login_names(user_id,username)
SELECT pa.account_user_id, lower(regexp_replace(pa.callsign,'[^A-Za-z0-9_-]','','g'))
FROM public.player_applications pa
WHERE pa.account_user_id IS NOT NULL
  AND regexp_replace(pa.callsign,'[^A-Za-z0-9_-]','','g') ~ '^[A-Za-z0-9_-]{3,24}$'
ON CONFLICT(user_id) DO NOTHING;

-- Reserve a unique username at signup. A duplicate username causes Auth signup to fail safely.
CREATE OR REPLACE FUNCTION public.fz_reserve_member_username()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,auth,pg_temp AS $$
DECLARE v_username TEXT;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'fz_member_signup','') <> 'true' THEN RETURN NEW; END IF;
  v_username := lower(trim(COALESCE(NEW.raw_user_meta_data->>'username',NEW.raw_user_meta_data->>'callsign','')));
  IF v_username !~ '^[a-z0-9_-]{3,24}$' THEN
    RAISE EXCEPTION 'Username must contain 3–24 letters, numbers or underscores';
  END IF;
  INSERT INTO public.fz_member_login_names(user_id,username) VALUES(NEW.id,v_username);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS fz_reserve_member_username_trigger ON auth.users;
CREATE TRIGGER fz_reserve_member_username_trigger
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fz_reserve_member_username();

-- Keep username reservation in sync whenever a member changes their public callsign.
CREATE OR REPLACE FUNCTION public.fz_member_update_profile(p_callsign TEXT,p_display_name TEXT,p_avatar_url TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE a public.fz_member_accounts%ROWTYPE; v_username TEXT;
BEGIN
  SELECT * INTO a FROM public.fz_member_accounts WHERE user_id=auth.uid() AND active=TRUE FOR UPDATE;
  IF NOT FOUND OR a.player_id IS NULL THEN RAISE EXCEPTION 'Active player account not found'; END IF;
  v_username := lower(trim(p_callsign));
  IF v_username !~ '^[a-z0-9_-]{3,24}$' THEN RAISE EXCEPTION 'Username must contain 3–24 letters, numbers or underscores'; END IF;
  IF char_length(trim(COALESCE(p_display_name,''))) > 40 THEN RAISE EXCEPTION 'Display name is too long'; END IF;
  IF COALESCE(p_avatar_url,'') <> '' AND p_avatar_url !~ '^https://' THEN RAISE EXCEPTION 'Avatar URL must be HTTPS'; END IF;
  IF EXISTS(SELECT 1 FROM public.players WHERE lower(callsign)=v_username AND id<>a.player_id AND active=TRUE) THEN RAISE EXCEPTION 'That username is already in use'; END IF;
  UPDATE public.players SET callsign=v_username WHERE id=a.player_id;
  UPDATE public.player_applications SET callsign=v_username WHERE account_user_id=auth.uid();
  INSERT INTO public.fz_member_login_names(user_id,username) VALUES(auth.uid(),v_username)
    ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username;
  UPDATE public.fz_member_accounts SET display_name=trim(COALESCE(p_display_name,'')),avatar_url=COALESCE(p_avatar_url,''),updated_at=NOW() WHERE user_id=auth.uid();
END; $$;
REVOKE ALL ON FUNCTION public.fz_member_update_profile(TEXT,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fz_member_update_profile(TEXT,TEXT,TEXT) TO authenticated;

COMMIT;
-- Deploy the member-login Edge Function included in this package after running this migration.
