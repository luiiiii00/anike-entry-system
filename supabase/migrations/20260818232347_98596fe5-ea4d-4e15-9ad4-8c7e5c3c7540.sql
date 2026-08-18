CREATE TABLE public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.evaluations(id) on delete cascade,
  evaluation_id uuid references public.evaluations(id) on delete cascade,
  review_type text not null check (review_type in ('PRE_TRADE','NO_TRADE','POST_TRADE','WEEKLY_REVIEW')),
  summary text not null default '',
  what_worked text not null default '',
  what_failed text not null default '',
  what_learned text not null default '',
  next_time text not null default '',
  created_at timestamptz not null default now()
);

CREATE INDEX ai_reviews_user_created_idx ON public.ai_reviews (user_id, created_at DESC);
CREATE INDEX ai_reviews_eval_idx ON public.ai_reviews (evaluation_id);

GRANT SELECT ON public.ai_reviews TO authenticated;
GRANT ALL ON public.ai_reviews TO service_role;

ALTER TABLE public.ai_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ai reviews read" ON public.ai_reviews
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.ai_settings (
  id boolean primary key default true check (id),
  ai_daily_limit integer not null default 5 check (ai_daily_limit >= 0 and ai_daily_limit <= 200),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in reads ai settings" ON public.ai_settings
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER ai_settings_updated BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ai_settings (id, ai_daily_limit) VALUES (true, 5);