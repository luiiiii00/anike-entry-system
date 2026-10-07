DROP POLICY IF EXISTS "anyone signed in reads payment settings" ON public.payment_settings;
CREATE POLICY "pending payers and admins read payment settings"
ON public.payment_settings FOR SELECT TO authenticated
USING (
  private.is_admin(auth.uid())
  OR NOT private.has_active_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.payment_requests pr
    WHERE pr.user_id = auth.uid() AND pr.status = 'PENDING'
  )
);