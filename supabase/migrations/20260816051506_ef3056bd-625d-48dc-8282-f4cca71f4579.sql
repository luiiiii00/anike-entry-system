REVOKE EXECUTE ON FUNCTION public.expire_overdue_accounts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_accounts() TO service_role;

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
GRANT SELECT ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.email_outbox FROM authenticated, anon;

DROP POLICY IF EXISTS "admins insert audit log" ON public.admin_audit_log;
CREATE POLICY "admins insert audit log" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND admin_user_id = auth.uid());

DROP POLICY IF EXISTS "no client writes email outbox" ON public.email_outbox;
CREATE POLICY "no client writes email outbox" ON public.email_outbox
  FOR INSERT TO authenticated
  WITH CHECK (false);