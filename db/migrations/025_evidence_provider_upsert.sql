-- Migration 025: Add unique constraint on evidence for provider-based upserts
--
-- Enables periodic progress sync: each sync cycle replaces the previous
-- evidence data from the same provider for the same (challenge, subject).
-- Multiple providers per (challenge, subject) are still allowed.
--
-- Idempotent: safe to run multiple times.

-- Remove duplicates first (keep newest per challenge/subject/provider)
DELETE FROM public.evidence a
USING public.evidence b
WHERE a.challenge_id = b.challenge_id
  AND lower(a.subject) = lower(b.subject)
  AND a.provider = b.provider
  AND a.id < b.id;

-- Add unique index (not constraint, to use lower(subject))
CREATE UNIQUE INDEX IF NOT EXISTS evidence_challenge_subject_provider_uq
  ON public.evidence (challenge_id, lower(subject), provider);
