-- 033_merge_hiit_into_crossfit.sql
-- Merge HIIT into CrossFit: rename kind='hiit' templates to kind='crossfit'.
-- Existing crossfit_sessions template (from 032) already exists, so just
-- remove the old hiit_sessions row and update any challenges that reference it.

-- Remove the old HIIT template (crossfit_sessions covers both now)
DELETE FROM public.challenge_templates WHERE id = 'hiit_sessions';

-- Update the crossfit template name to reflect the merge
UPDATE public.challenge_templates
SET name = 'CrossFit / HIIT — Session Time',
    hint = 'Accumulate CrossFit and HIIT training time within the challenge window.'
WHERE id = 'crossfit_sessions';

-- Migrate any existing challenges that used kind='hiit' to kind='crossfit'
UPDATE public.challenges
SET category = 'crossfit'
WHERE category = 'hiit';
