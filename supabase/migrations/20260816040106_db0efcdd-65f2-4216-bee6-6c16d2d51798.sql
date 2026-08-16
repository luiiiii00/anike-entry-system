-- ===== Estados y planes =====
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('PENDING','APPROVED','REJECTED','SUSPENDED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_plan AS ENUM ('NONE','PRO','LIFETIME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== profiles: campos de autorizacion =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS plan public.access_plan NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS access_start timestamptz,
  ADD COLUMN IF NOT EXISTS access_expiration timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_plan public.access_plan NOT NULL DEFAULT 'PRO';

DROP TRIGGER IF EXISTS profiles_updated ON public.profiles;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== admin helpers =====
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- Autorizacion efectiva (aprobado + no vencido). Fuente de verdad para RLS.
CREATE OR REPLACE FUNCTION public.has_active_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.status = 'APPROVED'
      AND (p.plan = 'LIFETIME' OR p.access_expiration IS NULL OR p.access_expiration > now())
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_access(uuid) TO authenticated, service_role;

-- ===== Auditoria administrativa =====
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read audit log" ON public.admin_audit_log;
CREATE POLICY "admins read audit log" ON public.admin_audit_log
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON public.admin_audit_log(target_user_id, created_at DESC);

-- ===== Blindaje: el usuario no puede tocar campos de autorizacion =====
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) OR auth.uid() IS NULL THEN
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

DROP TRIGGER IF EXISTS profiles_protect_fields ON public.profiles;
CREATE TRIGGER profiles_protect_fields BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- El usuario no puede insertar/borrar filas de roles
DROP POLICY IF EXISTS "own roles read" ON public.user_roles;
CREATE POLICY "own roles read" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ===== Registro: nuevas cuentas quedan PENDING =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, full_name, email, status, plan)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name'),
    NEW.email,
    'PENDING',
    'NONE'
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  INSERT INTO public.settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- ===== Policies de perfiles =====
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles" ON public.profiles
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update profiles" ON public.profiles;
CREATE POLICY "admins update profiles" ON public.profiles
FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ===== Datos privados: requieren acceso activo =====
DROP POLICY IF EXISTS "own evaluations" ON public.evaluations;
CREATE POLICY "own evaluations" ON public.evaluations
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_active_access(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.has_active_access(auth.uid()));

DROP POLICY IF EXISTS "own weekly" ON public.weekly_reviews;
CREATE POLICY "own weekly" ON public.weekly_reviews
FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.has_active_access(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.has_active_access(auth.uid()));

DROP POLICY IF EXISTS "admins read evaluations" ON public.evaluations;
CREATE POLICY "admins read evaluations" ON public.evaluations
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins read weekly" ON public.weekly_reviews;
CREATE POLICY "admins read weekly" ON public.weekly_reviews
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ===== Vencimiento a nivel base de datos =====
CREATE OR REPLACE FUNCTION public.expire_overdue_accounts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.profiles
     SET status = 'EXPIRED'
   WHERE status = 'APPROVED'
     AND plan <> 'LIFETIME'
     AND access_expiration IS NOT NULL
     AND access_expiration <= now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.expire_overdue_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_overdue_accounts() TO authenticated, service_role;

-- ===== Acciones administrativas (con auditoria) =====
CREATE OR REPLACE FUNCTION public.admin_log(_target uuid, _action text, _details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (auth.uid(), _target, _action, COALESCE(_details, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.admin_log(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_user(_target uuid, _plan public.access_plan, _days integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exp timestamptz;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
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
  PERFORM public.admin_log(_target,'APPROVE_USER', jsonb_build_object('plan',_plan,'days',_days));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reject_user(_target uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.profiles
     SET status='REJECTED', plan='NONE', access_start=NULL, access_expiration=NULL,
         rejection_reason=NULLIF(btrim(COALESCE(_reason,'')),'')
   WHERE id=_target;
  PERFORM public.admin_log(_target,'REJECT_USER', jsonb_build_object('reason',_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(_target uuid, _reason text DEFAULT NULL, _revoke boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.profiles
     SET status='SUSPENDED', suspension_reason=NULLIF(btrim(COALESCE(_reason,'')),'')
   WHERE id=_target;
  PERFORM public.admin_log(_target, CASE WHEN _revoke THEN 'REVOKE_ACCESS' ELSE 'SUSPEND_USER' END,
                           jsonb_build_object('reason',_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reactivate_user(_target uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; final_status public.account_status;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=_target;
  IF p.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF p.plan <> 'LIFETIME' AND p.access_expiration IS NOT NULL AND p.access_expiration <= now() THEN
    final_status := 'EXPIRED';
  ELSE
    final_status := 'APPROVED';
  END IF;
  UPDATE public.profiles SET status=final_status, suspension_reason=NULL WHERE id=_target;
  PERFORM public.admin_log(_target,'REACTIVATE_USER', jsonb_build_object('result',final_status));
  RETURN final_status::text;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_renew_user(_target uuid, _days integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; base timestamptz; exp timestamptz;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
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
  PERFORM public.admin_log(_target,'RENEW_USER', jsonb_build_object('days',_days,'new_expiration',exp));
  RETURN exp;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_change_plan(_target uuid, _plan public.access_plan, _days integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exp timestamptz;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
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
  PERFORM public.admin_log(_target,'CHANGE_PLAN', jsonb_build_object('plan',_plan,'days',_days));
END; $$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_approve_user(uuid, public.access_plan, integer)',
    'admin_reject_user(uuid, text)',
    'admin_suspend_user(uuid, text, boolean)',
    'admin_reactivate_user(uuid)',
    'admin_renew_user(uuid, integer)',
    'admin_change_plan(uuid, public.access_plan, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- ===== Storage privado: el admin tambien puede auditar capturas =====
DROP POLICY IF EXISTS "admins read trade screenshots" ON storage.objects;
CREATE POLICY "admins read trade screenshots" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'trade-screenshots' AND public.is_admin(auth.uid()));