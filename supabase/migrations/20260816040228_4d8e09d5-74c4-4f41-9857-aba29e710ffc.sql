-- Blindaje: la funcion de trigger no debe ser invocable por clientes
REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;

-- ===== Bandeja de salida de emails transaccionales (integracion pendiente) =====
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  to_email text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'QUEUED',
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read email outbox" ON public.email_outbox;
CREATE POLICY "admins read email outbox" ON public.email_outbox
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON public.email_outbox(status, created_at);

CREATE OR REPLACE FUNCTION public.enqueue_email(_user_id uuid, _template text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE addr text;
BEGIN
  SELECT email INTO addr FROM public.profiles WHERE id = _user_id;
  IF addr IS NULL THEN RETURN; END IF;
  INSERT INTO public.email_outbox (user_id, to_email, template, payload)
  VALUES (_user_id, addr, _template, COALESCE(_payload,'{}'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_email(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Encolar "Solicitud recibida" al registrarse
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
  PERFORM public.enqueue_email(NEW.id, 'REQUEST_RECEIVED', '{}'::jsonb);
  RETURN NEW;
END; $$;

-- Encolar emails en cada accion administrativa
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
  PERFORM public.enqueue_email(_target,'ACCESS_APPROVED', jsonb_build_object('plan',_plan,'expiration',exp));
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
  PERFORM public.enqueue_email(_target,'ACCESS_REJECTED', jsonb_build_object('reason',_reason));
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
  PERFORM public.enqueue_email(_target,'ACCESS_SUSPENDED', jsonb_build_object('reason',_reason));
END; $$;

CREATE OR REPLACE FUNCTION public.expire_overdue_accounts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer; r record;
BEGIN
  affected := 0;
  FOR r IN
    UPDATE public.profiles
       SET status = 'EXPIRED'
     WHERE status = 'APPROVED'
       AND plan <> 'LIFETIME'
       AND access_expiration IS NOT NULL
       AND access_expiration <= now()
    RETURNING id
  LOOP
    affected := affected + 1;
    PERFORM public.enqueue_email(r.id, 'ACCESS_EXPIRED', '{}'::jsonb);
  END LOOP;
  RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.expire_overdue_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_overdue_accounts() TO authenticated, service_role;