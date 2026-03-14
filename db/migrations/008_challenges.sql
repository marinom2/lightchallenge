-- Migration 008: challenges table
--
-- Documents the pre-existing public.challenges table which was created
-- outside the migration runner (no prior .sql file existed).
--
-- params:   JSONB rule/model parameters set at challenge creation.
-- proof:    JSONB verification state (verifier, modelId, kind, taskBinding, etc.)
-- timeline: JSONB on-chain timestamps (startAt, endAt, deadline, etc.)
-- funds:    JSONB staking snapshot (budgetWei, stakeWei, currency, etc.)
-- options:  JSONB UI metadata (category, game, mode, tags, externalId, etc.)
--
-- DEPRECATED columns (no writers/readers in active code — retained for history):
--   aivm_request_started      boolean  — superseded by aivm_jobs.status
--   aivm_request_started_at   timestamptz — superseded by aivm_jobs.created_at
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.challenges (
  id          bigint       PRIMARY KEY,
  title       text,
  description text,
  subject     text,
  tx_hash     text,
  model_id    text,
  model_hash  text,
  params      jsonb,
  proof       jsonb,
  timeline    jsonb,
  funds       jsonb,
  options     jsonb,
  status      text,
  created_at  timestamptz  DEFAULT now(),
  updated_at  timestamptz  DEFAULT now(),

  -- DEPRECATED: superseded by aivm_jobs table
  aivm_request_started     boolean     DEFAULT false,
  aivm_request_started_at  timestamptz
);

-- Performance indexes (match live DB)
CREATE INDEX IF NOT EXISTS idx_challenges_status
  ON public.challenges (status);

CREATE INDEX IF NOT EXISTS idx_challenges_status_created_at
  ON public.challenges (lower(COALESCE(status, '')), created_at);

CREATE INDEX IF NOT EXISTS idx_challenges_created_at
  ON public.challenges (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenges_proof_backend
  ON public.challenges (lower(COALESCE(proof->>'backend', '')));

CREATE INDEX IF NOT EXISTS idx_challenges_proof_task_id
  ON public.challenges ((proof->'taskBinding'->>'taskId'));

CREATE INDEX IF NOT EXISTS idx_challenges_proof_request_id
  ON public.challenges ((proof->'taskBinding'->>'requestId'));

-- DEPRECATED — retained to match live schema; can be dropped after aivm_request_started* columns are removed
CREATE INDEX IF NOT EXISTS idx_challenges_aivm_started
  ON public.challenges (aivm_request_started);
