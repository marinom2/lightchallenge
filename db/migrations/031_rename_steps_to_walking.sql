-- 031_rename_steps_to_walking.sql
-- Rename challenge kind "steps" → "walking" in templates.
-- The "walking" kind unifies step-counting and walking-distance challenges.
-- Note: challenges table stores kind inside params JSONB, not as a column.

-- Update templates
UPDATE public.challenge_templates
SET kind = 'walking'
WHERE kind = 'steps';
