ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS design_recipe jsonb,
  ADD COLUMN IF NOT EXISTS reference_analysis jsonb,
  ADD COLUMN IF NOT EXISTS analysis_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS analysis_attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_design_recipe_object,
  ADD CONSTRAINT invitation_events_design_recipe_object CHECK (design_recipe IS NULL OR jsonb_typeof(design_recipe) = 'object'),
  DROP CONSTRAINT IF EXISTS invitation_events_reference_analysis_object,
  ADD CONSTRAINT invitation_events_reference_analysis_object CHECK (reference_analysis IS NULL OR jsonb_typeof(reference_analysis) = 'object'),
  DROP CONSTRAINT IF EXISTS invitation_events_analysis_attempt_count_nonnegative,
  ADD CONSTRAINT invitation_events_analysis_attempt_count_nonnegative CHECK (analysis_attempt_count >= 0);

CREATE OR REPLACE FUNCTION public.reserve_invitation_analysis_attempt(
  p_event_id uuid,
  p_limit integer DEFAULT 5,
  p_window interval DEFAULT interval '1 hour'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.invitation_events%ROWTYPE;
BEGIN
  IF p_limit < 1 OR p_window <= interval '0 seconds' THEN RETURN false; END IF;
  SELECT * INTO v_event FROM public.invitation_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_event.analysis_window_started_at IS NULL OR v_event.analysis_window_started_at + p_window <= now() THEN
    UPDATE public.invitation_events SET analysis_window_started_at = now(), analysis_attempt_count = 1 WHERE id = p_event_id;
    RETURN true;
  END IF;
  IF v_event.analysis_attempt_count >= p_limit THEN RETURN false; END IF;
  UPDATE public.invitation_events SET analysis_attempt_count = analysis_attempt_count + 1 WHERE id = p_event_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_invitation_analysis_attempt(uuid, integer, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_invitation_analysis_attempt(uuid, integer, interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_analysis_attempt(uuid, integer, interval) TO service_role;

NOTIFY pgrst, 'reload schema';
