-- 1) Nuevas versiones con el usuario recibido del servidor (validado por bearer token)
DROP FUNCTION IF EXISTS public.create_payment_request(text, text);
DROP FUNCTION IF EXISTS public.attach_payment_receipt(uuid, text);
DROP FUNCTION IF EXISTS public.cancel_my_payment_request(uuid);

CREATE OR REPLACE FUNCTION public.create_payment_request(_user uuid, _plan_key text, _notes text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE pl public.payment_plans; taken int; new_id uuid;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO pl FROM public.payment_plans WHERE key = _plan_key AND is_active;
  IF pl.key IS NULL THEN RAISE EXCEPTION 'invalid_plan'; END IF;

  IF pl.is_promo THEN
    PERFORM pg_advisory_xact_lock(hashtext('anike_launch_promo'));
    SELECT count(*) INTO taken FROM public.payment_requests
      WHERE plan_key = pl.key AND status = 'APPROVED';
    IF taken >= COALESCE(pl.promo_limit, 0) THEN RAISE EXCEPTION 'promo_sold_out'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.payment_requests WHERE user_id = _user AND status = 'PENDING') THEN
    RAISE EXCEPTION 'payment_pending_exists';
  END IF;

  INSERT INTO public.payment_requests
    (user_id, plan_key, plan_name, amount, currency, payment_method, duration_days, access_plan, notes)
  VALUES (_user, pl.key, pl.name, pl.price_pyg, 'PYG', 'BANK_TRANSFER', pl.duration_days, pl.access_plan,
          NULLIF(btrim(COALESCE(_notes,'')),''))
  RETURNING id INTO new_id;

  RETURN new_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.attach_payment_receipt(_user uuid, _request uuid, _path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _path IS NULL OR _path NOT LIKE (_user::text || '/%') THEN RAISE EXCEPTION 'invalid_receipt_path'; END IF;
  UPDATE public.payment_requests
     SET receipt_path = _path
   WHERE id = _request AND user_id = _user AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_editable'; END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.cancel_my_payment_request(_user uuid, _request uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  DELETE FROM public.payment_requests WHERE id = _request AND user_id = _user AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_editable'; END IF;
END; $function$;

-- 2) Solo el servidor (service_role) puede ejecutarlas
REVOKE ALL ON FUNCTION public.create_payment_request(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_payment_receipt(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_my_payment_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.launch_promo_status() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_payment_request(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_payment_receipt(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_my_payment_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.launch_promo_status() TO service_role;