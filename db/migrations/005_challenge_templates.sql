-- Migration 005: challenge_templates table
--
-- Stores admin-managed challenge templates.  The runtime code templates in
-- webapp/lib/templates.ts remain authoritative for the create flow (they
-- carry paramsBuilder functions which cannot be serialised to DB).
--
-- This table allows admin to add/edit/disable templates without a code deploy
-- and is the backend for GET/PUT /api/admin/templates.
--
-- fields_json: JSON array of TemplateField descriptors (serialisable subset —
--   no function values).  Used by the UI for rendering template-specific fields.
--
-- rule_config: Canonical evaluator Rule or GamingRule object that will be
--   embedded in proof.params.rule when the template is used.  Evaluators
--   read this to apply challenge-specific thresholds.
--
-- active: false = soft-deleted / hidden from the create UI.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.challenge_templates (
  id          text         PRIMARY KEY,                 -- e.g. 'running_window'
  name        text         NOT NULL,
  hint        text,
  kind        text         NOT NULL,                    -- FitnessKind | GameId
  model_id    text         NOT NULL,
  fields_json jsonb        NOT NULL DEFAULT '[]'::jsonb,
  rule_config jsonb,                                    -- canonical Rule / GamingRule
  active      boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenge_templates_kind_idx
  ON public.challenge_templates (kind);

CREATE INDEX IF NOT EXISTS challenge_templates_active_idx
  ON public.challenge_templates (active);
