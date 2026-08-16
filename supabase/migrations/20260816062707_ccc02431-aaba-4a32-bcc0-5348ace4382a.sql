CREATE OR REPLACE FUNCTION public.admin_approve_user(_admin uuid, _target uuid, _plan access_plan, _days integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM private.admin_log(_admin,_target,'APPROVE_USER',
    jsonb_build_object('plan',_plan,'days',_days,'new_expiration',exp));
  PERFORM public.enqueue_email(_target,'ACCESS_APPROVED', jsonb_build_object('plan',_plan,'expiration',exp));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_change_plan(_admin uuid, _target uuid, _plan access_plan, _days integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE exp timestamptz;
BEGIN
  IF NOT private.is_admin(_admin) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _plan NOT IN ('PRO','LIFETIME') THEN RAISE EXCEPTION 'invalid_plan'; END IF;
  IF _plan = 'LIFETIME' THEN
    exp := NULL;
    UPDATE public.profiles SET plan='LIFETIME', access_expiration=NULL, status='APPROVED',
      access_start=COALESCE(access_start, now()), suspension_reason=NULL WHERE id=_target;
  ELSE
    IF _days IS NULL OR _days <= 0 OR _days > 3650 THEN RAISE EXCEPTION 'invalid_duration'; END IF;
    exp := now() + make_interval(days => _days);
    UPDATE public.profiles SET plan='PRO', access_expiration=exp, status='APPROVED',
      access_start=COALESCE(access_start, now()), suspension_reason=NULL WHERE id=_target;
  END IF;
  PERFORM private.admin_log(_admin,_target,'CHANGE_PLAN',
    jsonb_build_object('plan',_plan,'days',_days,'new_expiration',exp));
END; $function$;

REVOKE ALL ON FUNCTION public.admin_approve_user(uuid,uuid,access_plan,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_change_plan(uuid,uuid,access_plan,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid,uuid,access_plan,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid,uuid,access_plan,integer) TO service_role;