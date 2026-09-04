-- 1) Hardened admin check: an authenticated caller may only ask about itself.
CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
  END;
$function$;

-- 2) Library documents: active access required, admins keep full management.
DROP POLICY IF EXISTS "anyone signed in reads library" ON public.library_documents;
DROP POLICY IF EXISTS "active access reads library" ON public.library_documents;
CREATE POLICY "active access reads library"
  ON public.library_documents FOR SELECT TO authenticated
  USING (private.has_active_access(auth.uid()) OR private.is_admin(auth.uid()));

-- 3) Library storage objects: active access required.
DROP POLICY IF EXISTS "signed in read library files" ON storage.objects;
DROP POLICY IF EXISTS "active access read library files" ON storage.objects;
CREATE POLICY "active access read library files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'library'
    AND (private.has_active_access(auth.uid()) OR private.is_admin(auth.uid()))
  );

-- 4) AI reviews: owner with active access, plus admin read.
DROP POLICY IF EXISTS "own ai reviews read" ON public.ai_reviews;
CREATE POLICY "own ai reviews read"
  ON public.ai_reviews FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND private.has_active_access(auth.uid()));

DROP POLICY IF EXISTS "admins read ai reviews" ON public.ai_reviews;
CREATE POLICY "admins read ai reviews"
  ON public.ai_reviews FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));

-- 5) Realtime: stop broadcasting full row images of other users' records.
ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT;
ALTER TABLE public.payment_requests REPLICA IDENTITY DEFAULT;
