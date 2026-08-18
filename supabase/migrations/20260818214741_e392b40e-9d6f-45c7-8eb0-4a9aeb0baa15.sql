-- ============ PLANES ============
CREATE TABLE public.payment_plans (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_pyg integer NOT NULL CHECK (price_pyg >= 0),
  duration_days integer,
  access_plan public.access_plan NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_promo boolean NOT NULL DEFAULT false,
  promo_limit integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.payment_plans TO authenticated;
GRANT ALL ON public.payment_plans TO service_role;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in reads plans" ON public.payment_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins update plans" ON public.payment_plans
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER payment_plans_updated BEFORE UPDATE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payment_plans (key, name, description, price_pyg, duration_days, access_plan, sort_order, is_promo, promo_limit) VALUES
  ('7D',     '7 días',   'Prueba ANIKE EJEPIKA durante 7 días.',   15000,  7,    'PRO',      1, false, NULL),
  ('30D',    '30 días',  'Acceso completo durante 30 días.',       50000,  30,   'PRO',      2, false, NULL),
  ('LIFETIME','Lifetime','Acceso de por vida a ANIKE EJEPIKA.',    420000, NULL, 'LIFETIME', 3, false, NULL),
  ('LAUNCH', 'Lanzamiento Lifetime', 'Acceso de por vida — precio de lanzamiento para los primeros 5 usuarios.', 50000, NULL, 'LIFETIME', 4, true, 5);

-- ============ DATOS BANCARIOS (config admin) ============
CREATE TABLE public.payment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  bank_name text NOT NULL DEFAULT '',
  holder_name text NOT NULL DEFAULT '',
  alias text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in reads payment settings" ON public.payment_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins update payment settings" ON public.payment_settings
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE TRIGGER payment_settings_updated BEFORE UPDATE ON public.payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.payment_settings (id) VALUES (true);

-- ============ SOLICITUDES DE PAGO ============
CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES public.payment_plans(key),
  plan_name text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'PYG',
  payment_method text NOT NULL DEFAULT 'BANK_TRANSFER',
  duration_days integer,
  access_plan public.access_plan NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  receipt_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text
);

CREATE INDEX payment_requests_user_idx ON public.payment_requests (user_id, created_at DESC);
CREATE INDEX payment_requests_status_idx ON public.payment_requests (status, created_at DESC);

GRANT SELECT ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own payment requests read" ON public.payment_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read payment requests" ON public.payment_requests
  FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

-- ============ CUPOS PROMOCIONALES (reales) ============
CREATE OR REPLACE FUNCTION public.launch_promo_status()
RETURNS TABLE (taken integer, total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::int FROM public.payment_requests
      WHERE plan_key = 'LAUNCH' AND status = 'APPROVED'),
    COALESCE((SELECT promo_limit FROM public.payment_plans WHERE key = 'LAUNCH'), 0)
$$;

REVOKE ALL ON FUNCTION public.launch_promo_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.launch_promo_status() TO authenticated, service_role;

-- ============ CREAR SOLICITUD (precio oficial del servidor) ============
CREATE OR REPLACE FUNCTION public.create_payment_request(_plan_key text, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; pl public.payment_plans; taken int; new_id uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO pl FROM public.payment_plans WHERE key = _plan_key AND is_active;
  IF pl.key IS NULL THEN RAISE EXCEPTION 'invalid_plan'; END IF;

  IF pl.is_promo THEN
    PERFORM pg_advisory_xact_lock(hashtext('anike_launch_promo'));
    SELECT count(*) INTO taken FROM public.payment_requests
      WHERE plan_key = pl.key AND status = 'APPROVED';
    IF taken >= COALESCE(pl.promo_limit, 0) THEN RAISE EXCEPTION 'promo_sold_out'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.payment_requests WHERE user_id = uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'payment_pending_exists';
  END IF;

  INSERT INTO public.payment_requests
    (user_id, plan_key, plan_name, amount, currency, payment_method, duration_days, access_plan, notes)
  VALUES (uid, pl.key, pl.name, pl.price_pyg, 'PYG', 'BANK_TRANSFER', pl.duration_days, pl.access_plan,
          NULLIF(btrim(COALESCE(_notes,'')),''))
  RETURNING id INTO new_id;

  RETURN new_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_payment_request(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_request(text, text) TO authenticated, service_role;

-- ============ ADJUNTAR COMPROBANTE ============
CREATE OR REPLACE FUNCTION public.attach_payment_receipt(_request uuid, _path text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _path IS NULL OR _path NOT LIKE (uid::text || '/%') THEN RAISE EXCEPTION 'invalid_receipt_path'; END IF;
  UPDATE public.payment_requests
     SET receipt_path = _path
   WHERE id = _request AND user_id = uid AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_editable'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.attach_payment_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_payment_receipt(uuid, text) TO authenticated, service_role;

-- ============ CANCELAR SOLICITUD PROPIA PENDIENTE ============
CREATE OR REPLACE FUNCTION public.cancel_my_payment_request(_request uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.payment_requests WHERE id = _request AND user_id = uid AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_editable'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.cancel_my_payment_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_payment_request(uuid) TO authenticated, service_role;

-- ============ APROBAR PAGO (solo servidor / admin) ============
CREATE OR REPLACE FUNCTION public.admin_approve_payment(_admin uuid, _request uuid)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payment_requests; pl public.payment_plans; taken int; base timestamptz; exp timestamptz; p public.profiles;
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO r FROM public.payment_requests WHERE id = _request FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF r.status <> 'PENDING' THEN RAISE EXCEPTION 'request_already_reviewed'; END IF;

  SELECT * INTO pl FROM public.payment_plans WHERE key = r.plan_key;

  IF COALESCE(pl.is_promo, false) THEN
    PERFORM pg_advisory_xact_lock(hashtext('anike_launch_promo'));
    SELECT count(*) INTO taken FROM public.payment_requests
      WHERE plan_key = r.plan_key AND status = 'APPROVED';
    IF taken >= COALESCE(pl.promo_limit, 0) THEN RAISE EXCEPTION 'promo_sold_out'; END IF;
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = r.user_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF r.access_plan = 'LIFETIME' THEN
    exp := NULL;
    UPDATE public.profiles
       SET status='APPROVED', plan='LIFETIME', access_start=COALESCE(access_start, now()),
           access_expiration=NULL, approved_at=COALESCE(approved_at, now()),
           rejection_reason=NULL, suspension_reason=NULL
     WHERE id = r.user_id;
  ELSE
    base := GREATEST(COALESCE(p.access_expiration, now()), now());
    exp := base + make_interval(days => COALESCE(r.duration_days, 0));
    UPDATE public.profiles
       SET status='APPROVED', plan='PRO', access_start=COALESCE(access_start, now()),
           access_expiration=exp, approved_at=COALESCE(approved_at, now()),
           rejection_reason=NULL, suspension_reason=NULL
     WHERE id = r.user_id;
  END IF;

  UPDATE public.payment_requests
     SET status='APPROVED', reviewed_at=now(), reviewed_by=_admin, rejection_reason=NULL
   WHERE id = r.id;

  PERFORM private.admin_log(_admin, r.user_id, 'PAYMENT_APPROVED',
    jsonb_build_object('payment_id', r.id, 'plan_key', r.plan_key, 'plan', r.access_plan,
                       'amount', r.amount, 'currency', r.currency, 'days', r.duration_days,
                       'new_expiration', exp));
  PERFORM private.admin_log(_admin, r.user_id, 'ACCESS_GRANTED',
    jsonb_build_object('payment_id', r.id, 'plan', r.access_plan, 'new_expiration', exp));
  PERFORM public.enqueue_email(r.user_id, 'ACCESS_APPROVED',
    jsonb_build_object('plan', r.access_plan, 'expiration', exp));

  RETURN exp;
END; $$;

REVOKE ALL ON FUNCTION public.admin_approve_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment(uuid, uuid) TO service_role;

-- ============ RECHAZAR PAGO ============
CREATE OR REPLACE FUNCTION public.admin_reject_payment(_admin uuid, _request uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payment_requests;
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO r FROM public.payment_requests WHERE id = _request FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF r.status <> 'PENDING' THEN RAISE EXCEPTION 'request_already_reviewed'; END IF;

  UPDATE public.payment_requests
     SET status='REJECTED', reviewed_at=now(), reviewed_by=_admin,
         rejection_reason=NULLIF(btrim(COALESCE(_reason,'')),'')
   WHERE id = r.id;

  PERFORM private.admin_log(_admin, r.user_id, 'PAYMENT_REJECTED',
    jsonb_build_object('payment_id', r.id, 'plan_key', r.plan_key, 'amount', r.amount, 'reason', _reason));
  PERFORM public.enqueue_email(r.user_id, 'PAYMENT_REJECTED', jsonb_build_object('reason', _reason));
END; $$;

REVOKE ALL ON FUNCTION public.admin_reject_payment(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment(uuid, uuid, text) TO service_role;

-- ============ COMPROBANTES (bucket privado) ============
CREATE POLICY "own receipts insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own receipts read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "admins read receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND private.is_admin(auth.uid()));

-- Realtime para que el admin vea los pagos al instante
ALTER TABLE public.payment_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_requests;