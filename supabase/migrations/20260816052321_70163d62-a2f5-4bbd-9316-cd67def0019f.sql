-- Scope the elevated helper functions to the calling user so signed-in users
-- cannot probe other accounts, and remove any anon/public execute grants.

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id
        AND p.status = 'APPROVED'
        AND (p.plan = 'LIFETIME' OR p.access_expiration IS NULL OR p.access_expiration > now())
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_active_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_access(uuid) TO authenticated, service_role;

-- Administrative routines: only signed-in callers, and each one already verifies
-- the caller is an admin internally.
REVOKE ALL ON FUNCTION public.admin_approve_user(uuid, access_plan, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_change_plan(uuid, access_plan, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_user(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_suspend_user(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reactivate_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_renew_user(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, access_plan, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, access_plan, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_user(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_renew_user(uuid, integer) TO authenticated, service_role;