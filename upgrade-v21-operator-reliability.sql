-- FIELDZERO V21 — OPERATOR REGISTRATION, APPROVAL AND DOSSIER FIXES
-- Run AFTER V18 and V19 have already been applied. Safe to re-run.
-- Does not delete test data, reset accounts, or modify bookings/finance.
BEGIN;

-- Ensure the signup trigger reliably creates the private application record.
CREATE OR REPLACE FUNCTION public.fz_on_member_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp AS $$
DECLARE m JSONB; v_callsign TEXT; v_mobile TEXT; v_player_id UUID;
BEGIN
  m := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  IF COALESCE(m->>'fz_member_signup','') <> 'true' THEN RETURN NEW; END IF;
  v_callsign := regexp_replace(trim(COALESCE(m->>'callsign','')), '\s+', ' ', 'g');
  v_mobile := trim(COALESCE(m->>'mobile',''));
  IF char_length(trim(COALESCE(m->>'real_name',''))) < 2
     OR char_length(v_callsign) NOT BETWEEN 3 AND 24
     OR v_callsign !~ '^[A-Za-z0-9_-]+$'
     OR v_mobile !~ '^[+0-9 ()-]{7,24}$' THEN
    RAISE EXCEPTION 'Please provide a valid operator name, username/callsign and mobile number';
  END IF;

  SELECT id INTO v_player_id FROM public.players
   WHERE lower(callsign)=lower(v_callsign) AND active=TRUE LIMIT 1;
  IF v_player_id IS NOT NULL THEN
    INSERT INTO public.fz_member_link_requests(user_id,callsign,mobile)
    VALUES(NEW.id,v_callsign,v_mobile)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.player_applications(
      real_name,callsign,mobile,primary_blaster,team_preference,play_style,
      privacy_consent,status,account_user_id,contact_email
    ) VALUES (
      trim(m->>'real_name'),v_callsign,v_mobile,
      CASE WHEN m->>'primary_blaster' IN ('Electric M4','Pistol','Other','Need a rental') THEN m->>'primary_blaster' ELSE 'Need a rental' END,
      CASE WHEN m->>'team_preference' IN ('No team yet','Request existing team','Open to assignment') THEN m->>'team_preference' ELSE 'No team yet' END,
      CASE WHEN m->>'play_style' IN ('Both','Casual','Competitive') THEN m->>'play_style' ELSE 'Both' END,
      TRUE,'pending',NEW.id,COALESCE(NEW.email,'')
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS fz_member_signup_trigger ON auth.users;
CREATE TRIGGER fz_member_signup_trigger AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.fz_on_member_signup();

-- Backfill only genuinely missing application rows for FIELDZERO Auth accounts.
-- Existing records are never overwritten or deleted.
INSERT INTO public.player_applications(
  real_name,callsign,mobile,primary_blaster,team_preference,play_style,
  privacy_consent,status,account_user_id,contact_email
)
SELECT
  trim(u.raw_user_meta_data->>'real_name'),
  trim(u.raw_user_meta_data->>'callsign'),
  trim(u.raw_user_meta_data->>'mobile'),
  CASE WHEN u.raw_user_meta_data->>'primary_blaster' IN ('Electric M4','Pistol','Other','Need a rental') THEN u.raw_user_meta_data->>'primary_blaster' ELSE 'Need a rental' END,
  CASE WHEN u.raw_user_meta_data->>'team_preference' IN ('No team yet','Request existing team','Open to assignment') THEN u.raw_user_meta_data->>'team_preference' ELSE 'No team yet' END,
  CASE WHEN u.raw_user_meta_data->>'play_style' IN ('Both','Casual','Competitive') THEN u.raw_user_meta_data->>'play_style' ELSE 'Both' END,
  TRUE,'pending',u.id,COALESCE(u.email,'')
FROM auth.users u
WHERE u.raw_user_meta_data->>'fz_member_signup'='true'
  AND char_length(trim(COALESCE(u.raw_user_meta_data->>'real_name',''))) >= 2
  AND trim(COALESCE(u.raw_user_meta_data->>'callsign','')) ~ '^[A-Za-z0-9_-]{3,24}$'
  AND trim(COALESCE(u.raw_user_meta_data->>'mobile','')) ~ '^[+0-9 ()-]{7,24}$'
  AND NOT EXISTS (SELECT 1 FROM public.player_applications pa WHERE pa.account_user_id=u.id)
  AND NOT EXISTS (SELECT 1 FROM public.players p WHERE lower(p.callsign)=lower(u.raw_user_meta_data->>'callsign') AND p.active=TRUE)
  AND NOT EXISTS (SELECT 1 FROM public.player_applications pa WHERE lower(pa.callsign)=lower(u.raw_user_meta_data->>'callsign'));

-- Make the approval RPC deterministic and ensure it creates the linked operator account.
CREATE OR REPLACE FUNCTION public.review_player_application(application_id UUID, decision TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE app public.player_applications%ROWTYPE; v_player UUID;
BEGIN
  IF NOT public.is_fieldzero_admin() THEN RAISE EXCEPTION 'Admin access required: this login is not listed in public.admin_users'; END IF;
  IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision. Use approve or reject'; END IF;
  SELECT * INTO app FROM public.player_applications WHERE id=application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found. Refresh the admin page'; END IF;
  IF app.status <> 'pending' THEN RAISE EXCEPTION 'Application already reviewed (current status: %)',app.status; END IF;
  IF decision='approve' THEN
    INSERT INTO public.players(application_id,callsign) VALUES(app.id,app.callsign)
      ON CONFLICT(application_id) DO UPDATE SET active=TRUE
      RETURNING id INTO v_player;
    IF app.account_user_id IS NOT NULL THEN
      INSERT INTO public.fz_member_accounts(user_id,player_id,display_name,active)
      VALUES(app.account_user_id,v_player,app.real_name,TRUE)
      ON CONFLICT(user_id) DO UPDATE SET player_id=EXCLUDED.player_id,active=TRUE,
        display_name=CASE WHEN public.fz_member_accounts.display_name='' THEN EXCLUDED.display_name ELSE public.fz_member_accounts.display_name END,
        updated_at=NOW();
    END IF;
  END IF;
  UPDATE public.player_applications
    SET status=CASE WHEN decision='approve' THEN 'approved' ELSE 'rejected' END, reviewed_at=NOW(), reviewed_by=auth.uid()
    WHERE id=application_id;
END; $$;
REVOKE ALL ON FUNCTION public.review_player_application(UUID,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_player_application(UUID,TEXT) TO authenticated;

-- Return the signed-in operator's own private application details to their dossier.
CREATE OR REPLACE FUNCTION public.fz_member_get_context()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE a public.fz_member_accounts%ROWTYPE; p public.players%ROWTYPE;
        t JSONB; pending JSONB; app public.player_applications%ROWTYPE;
BEGIN
  SELECT * INTO app FROM public.player_applications WHERE account_user_id=auth.uid()
    ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO a FROM public.fz_member_accounts WHERE user_id=auth.uid();
  IF NOT FOUND THEN
    IF app.id IS NOT NULL AND app.status='pending' THEN
      RETURN jsonb_build_object('state','pending','operator',jsonb_build_object(
        'real_name',app.real_name,'callsign',app.callsign,'mobile',app.mobile,
        'contact_email',app.contact_email,'primary_blaster',app.primary_blaster,
        'team_preference',app.team_preference,'play_style',app.play_style,
        'application_status',app.status,'applied_at',app.created_at));
    ELSIF app.id IS NOT NULL AND app.status='rejected' THEN
      RETURN jsonb_build_object('state','rejected','operator',jsonb_build_object(
        'real_name',app.real_name,'callsign',app.callsign,'application_status',app.status));
    END IF;
    RETURN jsonb_build_object('state','not_linked');
  END IF;
  IF a.active=FALSE THEN RETURN jsonb_build_object('state','inactive'); END IF;
  SELECT * INTO p FROM public.players WHERE id=a.player_id AND active=TRUE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','inactive'); END IF;
  IF app.id IS NULL THEN SELECT * INTO app FROM public.player_applications WHERE id=p.application_id; END IF;
  SELECT jsonb_build_object('id',tm.team_id,'name',teams.name,'is_leader',p.team_leader,
      'member_count',(SELECT count(*) FROM public.team_members x JOIN public.players xp ON xp.id=x.player_id WHERE x.team_id=tm.team_id AND x.active AND xp.active))
    INTO t FROM public.team_members tm JOIN public.teams ON teams.id=tm.team_id AND teams.active
    WHERE tm.player_id=p.id AND tm.active LIMIT 1;
  SELECT to_jsonb(r) || jsonb_build_object('team_name',t->>'name') INTO pending
    FROM public.fz_team_join_requests r JOIN public.teams tt ON tt.id=r.team_id
    WHERE r.player_id=p.id AND r.status='pending' ORDER BY r.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('state','active','account',to_jsonb(a),'player',to_jsonb(p),
    'operator',jsonb_build_object('real_name',COALESCE(app.real_name,a.display_name,p.callsign),
      'mobile',COALESCE(app.mobile,''),'contact_email',COALESCE(app.contact_email,''),
      'primary_blaster',COALESCE(app.primary_blaster,''),'team_preference',COALESCE(app.team_preference,''),
      'play_style',COALESCE(app.play_style,''),'application_status',COALESCE(app.status,'approved')),
    'team',t,'pending_join',pending);
END; $$;
REVOKE ALL ON FUNCTION public.fz_member_get_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fz_member_get_context() TO authenticated;

COMMIT;
