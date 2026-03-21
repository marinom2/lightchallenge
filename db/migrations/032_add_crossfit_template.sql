-- 032_add_crossfit_template.sql
-- Add CrossFit as a distinct challenge template (separate from HIIT).

INSERT INTO public.challenge_templates (id, kind, name, hint, model_id, fields_json, rule_config)
VALUES (
  'crossfit_sessions',
  'crossfit',
  'CrossFit — Session Time',
  'Accumulate CrossFit training time within the challenge window.',
  'fitness.crossfit@1',
  '[{"key":"durationMin","label":"Target minutes","kind":"number","min":10,"step":10,"default":60}]'::jsonb,
  '{"challengeType":"crossfit","conditions":[{"metric":"crossfit_min","op":">=","value":60}]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
