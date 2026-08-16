CREATE OR REPLACE FUNCTION public.grant_owner_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'leguizmonl555@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.profiles
       SET status = 'APPROVED',
           plan = 'LIFETIME',
           access_start = COALESCE(access_start, now()),
           access_expiration = NULL,
           approved_at = COALESCE(approved_at, now()),
           rejection_reason = NULL,
           suspension_reason = NULL
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_owner_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_owner_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_owner_admin();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_owner_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_owner_admin
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_owner_admin();

-- Si la cuenta ya existe y está confirmada, asignar el rol ahora mismo.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE lower(u.email) = 'leguizmonl555@gmail.com'
  AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles p
   SET status = 'APPROVED',
       plan = 'LIFETIME',
       access_start = COALESCE(p.access_start, now()),
       access_expiration = NULL,
       approved_at = COALESCE(p.approved_at, now())
 FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = 'leguizmonl555@gmail.com'
  AND u.email_confirmed_at IS NOT NULL;

REVOKE ALL ON FUNCTION public.grant_owner_admin() FROM public, anon, authenticated;