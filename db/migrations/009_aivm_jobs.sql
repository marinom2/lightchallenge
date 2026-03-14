-- Migration 009: aivm_jobs table
--
-- Tracks AIVM inference job requests submitted by the challengePayAivmJob
-- orchestrator. One row per challenge (UNIQUE on challenge_id).
--
-- status flow: queued → processing → submitted → committed → revealed → done
--   (indexer updates status as Lightchain network events arrive)
--
-- task_id:         bytes32 hex string — Lightchain AIVM task identifier,
--                  populated after requestInferenceV2 succeeds.
-- worker_address:  legacy field; our node is a requester-only, not a worker.
--                  Retained for compatibility; not written by active code.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.aivm_jobs (
  id              bigserial    PRIMARY KEY,
  challenge_id    bigint       NOT NULL UNIQUE,
  status          text         NOT NULL DEFAULT 'queued',
  attempts        integer      NOT NULL DEFAULT 0,
  last_error      text,
  worker_address  text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  task_id         text
);

CREATE INDEX IF NOT EXISTS idx_aivm_jobs_challenge_id
  ON public.aivm_jobs (challenge_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aivm_jobs_challenge_id_unique
  ON public.aivm_jobs (challenge_id);

CREATE INDEX IF NOT EXISTS idx_aivm_jobs_status_created_at
  ON public.aivm_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_aivm_jobs_task_id
  ON public.aivm_jobs (task_id);
