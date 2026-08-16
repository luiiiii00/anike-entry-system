CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION private.has_active_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.status = 'APPROVED'
      AND (p.plan = 'LIFETIME' OR p.access_expiration IS NULL OR p.access_expiration > now())
  );
$$;

REVOKE ALL ON FUNCTION private.is_admin(uuid), private.has_active_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid), private.has_active_access(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "admins read audit log" ON public.admin_audit_log;
CREATE POLICY "admins read audit log" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins insert audit log" ON public.admin_audit_log;
CREATE POLICY "admins insert audit log" ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) AND admin_user_id = auth.uid());

DROP POLICY IF EXISTS "own roles read" ON public.user_roles;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update profiles" ON public.profiles;
CREATE POLICY "admins update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins read evaluations" ON public.evaluations;
CREATE POLICY "admins read evaluations" ON public.evaluations FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins read weekly" ON public.weekly_reviews;
CREATE POLICY "admins read weekly" ON public.weekly_reviews FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins read email outbox" ON public.email_outbox;
CREATE POLICY "admins read email outbox" ON public.email_outbox FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "own evaluations" ON public.evaluations;
CREATE POLICY "own evaluations" ON public.evaluations FOR ALL TO authenticated
  USING (auth.uid() = user_id AND private.has_active_access(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND private.has_active_access(auth.uid()));

DROP POLICY IF EXISTS "own weekly" ON public.weekly_reviews;
CREATE POLICY "own weekly" ON public.weekly_reviews FOR ALL TO authenticated
  USING (auth.uid() = user_id AND private.has_active_access(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND private.has_active_access(auth.uid()));

DROP POLICY IF EXISTS "admins read trade screenshots" ON storage.objects;
CREATE POLICY "admins read trade screenshots" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trade-screenshots' AND private.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.status := OLD.status;
  NEW.plan := OLD.plan;
  NEW.requested_plan := OLD.requested_plan;
  NEW.access_start := OLD.access_start;
  NEW.access_expiration := OLD.access_expiration;
  NEW.approved_at := OLD.approved_at;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.suspension_reason := OLD.suspension_reason;
  RETURN NEW;
END; $$;

DROP FUNCTION IF EXISTS public.admin_approve_user(uuid, access_plan, integer);
DROP FUNCTION IF EXISTS public.admin_reject_user(uuid, text);
DROP FUNCTION IF EXISTS public.admin_suspend_user(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.admin_reactivate_user(uuid);
DROP FUNCTION IF EXISTS public.admin_renew_user(uuid, integer);
DROP FUNCTION IF EXISTS public.admin_change_plan(uuid, access_plan, integer);
DROP FUNCTION IF EXISTS public.admin_log(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION private.admin_log(_admin uuid, _target uuid, _action text, _details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (_admin, _target, _action, COALESCE(_details, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION private.admin_log(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_user(_admin uuid, _target uuid, _plan access_plan, _days integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exp timestamptz;
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _plan NOT IN ('PRO','LIFETIME') THEN RAISE EXCEPTION 'invalid_plan'; END IF;
  IF _plan = 'PRO' THEN
    IF _days IS NULL OR _days <= 0 OR _days > 3650 THEN RAISE EXCEPTION 'invalid_duration'; END IF;
    exp := now() + make_interval(days => _days);
  ELSE
    exp := NULL;
  END IF;
  UPDATE public.profiles
     SET status='APPROVED', plan=_plan, access_start=now(), access_expiration=exp,
         approved_at=now(), rejection_reason=NULL, suspension_reason=NULL
   WHERE id=_target;
  PERFORM private.admin_log(_admin,_target,'APPROVE_USER', jsonb_build_object('plan',_plan,'days',_days));
  PERFORM public.enqueue_email(_target,'ACCESS_APPROVED', jsonb_build_object('plan',_plan,'expiration',exp));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reject_user(_admin uuid, _target uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.profiles
     SET status='REJECTED', plan='NONE', access_start=NULL, access_expiration=NULL,
         rejection_reason=NULLIF(btrim(COALESCE(_reason,'')),'')
   WHERE id=_target;
  PERFORM private.admin_log(_admin,_target,'REJECT_USER', jsonb_build_object('reason',_reason));
  PERFORM public.enqueue_email(_target,'ACCESS_REJECTED', jsonb_build_object('reason',_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(_admin uuid, _target uuid, _reason text DEFAULT NULL, _revoke boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.profiles
     SET status='SUSPENDED', suspension_reason=NULLIF(btrim(COALESCE(_reason,'')),'')
   WHERE id=_target;
  PERFORM private.admin_log(_admin,_target, CASE WHEN _revoke THEN 'REVOKE_ACCESS' ELSE 'SUSPEND_USER' END,
                            jsonb_build_object('reason',_reason));
  PERFORM public.enqueue_email(_target,'ACCESS_SUSPENDED', jsonb_build_object('reason',_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_user(_admin uuid, _target uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; final_status public.account_status;
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=_target;
  IF p.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF p.plan <> 'LIFETIME' AND p.access_expiration IS NOT NULL AND p.access_expiration <= now() THEN
    final_status := 'EXPIRED';
  ELSE
    final_status := 'APPROVED';
  END IF;
  UPDATE public.profiles SET status=final_status, suspension_reason=NULL WHERE id=_target;
  PERFORM private.admin_log(_admin,_target,'REACTIVATE_USER', jsonb_build_object('result',final_status));
  RETURN final_status::text;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_renew_user(_admin uuid, _target uuid, _days integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; base timestamptz; exp timestamptz;
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _days IS NULL OR _days <= 0 OR _days > 3650 THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=_target;
  IF p.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF p.plan = 'LIFETIME' THEN RAISE EXCEPTION 'lifetime_no_expiration'; END IF;
  base := GREATEST(COALESCE(p.access_expiration, now()), now());
  exp := base + make_interval(days => _days);
  UPDATE public.profiles
     SET plan='PRO', status='APPROVED', access_expiration=exp,
         access_start=COALESCE(access_start, now()), suspension_reason=NULL
   WHERE id=_target;
  PERFORM private.admin_log(_admin,_target,'RENEW_USER', jsonb_build_object('days',_days,'new_expiration',exp));
  RETURN exp;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_change_plan(_admin uuid, _target uuid, _plan access_plan, _days integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exp timestamptz;
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _plan NOT IN ('PRO','LIFETIME') THEN RAISE EXCEPTION 'invalid_plan'; END IF;
  IF _plan = 'LIFETIME' THEN
    UPDATE public.profiles SET plan='LIFETIME', access_expiration=NULL,
      access_start=COALESCE(access_start, now()) WHERE id=_target;
  ELSE
    IF _days IS NULL OR _days <= 0 OR _days > 3650 THEN RAISE EXCEPTION 'invalid_duration'; END IF;
    exp := now() + make_interval(days => _days);
    UPDATE public.profiles SET plan='PRO', access_expiration=exp,
      access_start=COALESCE(access_start, now()) WHERE id=_target;
  END IF;
  PERFORM private.admin_log(_admin,_target,'CHANGE_PLAN', jsonb_build_object('plan',_plan,'days',_days));
END; $$;

REVOKE ALL ON FUNCTION
  public.admin_approve_user(uuid, uuid, access_plan, integer),
  public.admin_reject_user(uuid, uuid, text),
  public.admin_suspend_user(uuid, uuid, text, boolean),
  public.admin_reactivate_user(uuid, uuid),
  public.admin_renew_user(uuid, uuid, integer),
  public.admin_change_plan(uuid, uuid, access_plan, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.admin_approve_user(uuid, uuid, access_plan, integer),
  public.admin_reject_user(uuid, uuid, text),
  public.admin_suspend_user(uuid, uuid, text, boolean),
  public.admin_reactivate_user(uuid, uuid),
  public.admin_renew_user(uuid, uuid, integer),
  public.admin_change_plan(uuid, uuid, access_plan, integer)
TO service_role;

DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.has_active_access(uuid);
