-- PROFILES ------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.profiles SET full_name = COALESCE(full_name, display_name);

DROP TRIGGER IF EXISTS profiles_updated ON public.profiles;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ROLES ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- SIGNUP HANDLER ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

-- TRADE / EVALUATION EXTRA FIELDS ------------------------------------------
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS discipline_status text,
  ADD COLUMN IF NOT EXISTS before_screenshot_url text,
  ADD COLUMN IF NOT EXISTS after_screenshot_url text;

-- WEEKLY REVIEW STRUCTURED FIELDS -----------------------------------------
ALTER TABLE public.weekly_reviews
  ADD COLUMN IF NOT EXISTS week_end date,
  ADD COLUMN IF NOT EXISTS number_of_trades integer,
  ADD COLUMN IF NOT EXISTS win_rate numeric,
  ADD COLUMN IF NOT EXISTS average_r numeric,
  ADD COLUMN IF NOT EXISTS average_score numeric,
  ADD COLUMN IF NOT EXISTS best_setup text,
  ADD COLUMN IF NOT EXISTS worst_setup text,
  ADD COLUMN IF NOT EXISTS impulsive_trades integer,
  ADD COLUMN IF NOT EXISTS off_plan_trades integer,
  ADD COLUMN IF NOT EXISTS biggest_mistake text,
  ADD COLUMN IF NOT EXISTS biggest_success text,
  ADD COLUMN IF NOT EXISTS next_week_action text;

CREATE UNIQUE INDEX IF NOT EXISTS weekly_reviews_user_week_key
  ON public.weekly_reviews (user_id, week_start);

-- GRANTS (owner-only via existing RLS policies) ----------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_reviews TO authenticated;
GRANT ALL ON public.profiles, public.settings, public.evaluations, public.weekly_reviews TO service_role;

REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.settings FROM anon;
REVOKE ALL ON public.evaluations FROM anon;
REVOKE ALL ON public.weekly_reviews FROM anon;
REVOKE ALL ON public.user_roles FROM anon;