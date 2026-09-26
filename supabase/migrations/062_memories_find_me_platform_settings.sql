-- Find Me's search cap protects against real per-search AWS Rekognition
-- CompareFaces cost (one call per gallery photo compared, ~$0.001 each at
-- low volume) — a founder/operator cost-control concern across the whole
-- platform, not something any individual event host should tune. Singleton
-- row (id fixed to true) rather than a per-event column: this is one global
-- knob, deliberately not scoped by event_id.
CREATE TABLE public.memories_find_me_platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  daily_search_limit integer NOT NULL DEFAULT 20 CHECK (daily_search_limit > 0)
);

INSERT INTO public.memories_find_me_platform_settings (id, daily_search_limit) VALUES (true, 20);

ALTER TABLE public.memories_find_me_platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memories_find_me_platform_settings FROM anon, authenticated;
