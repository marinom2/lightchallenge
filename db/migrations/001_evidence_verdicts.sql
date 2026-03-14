-- Migration 001: evidence and verdicts tables
--
-- Idempotent: safe to run multiple times.
-- Adds the DB-first storage layer for Phase 2+ evaluation pipeline.
-- Does NOT modify any existing tables (challenges, aivm_jobs, indexer_state).

-- ─────────────────────────────────────────────────────────────────────────────
-- evidence
-- Stores normalized evidence records submitted for a (challenge, subject) pair.
-- One row per ingestion event (multiple rows per challenge are allowed).
-- provider: the source of the evidence ('apple' | 'garmin' | 'strava' |
--           'opendota' | 'riot' | 'steam' | 'manual')
-- data:     normalized canonical records array (jsonb)
-- evidence_hash: deterministic hash of data contents (caller-computed)
-- raw_ref:  optional reference to raw source (S3 key, upload path, etc.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.evidence (
  id             bigserial     PRIMARY KEY,
  challenge_id   bigint        NOT NULL,
  subject        text          NOT NULL,
  provider       text          NOT NULL,
  data           jsonb         NOT NULL,
  evidence_hash  text          NOT NULL,
  raw_ref        text,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_challenge_id_idx
  ON public.evidence (challenge_id);

CREATE INDEX IF NOT EXISTS evidence_challenge_subject_idx
  ON public.evidence (challenge_id, lower(subject));

-- ─────────────────────────────────────────────────────────────────────────────
-- verdicts
-- Stores the result of evaluating evidence for a (challenge, subject) pair.
-- One verdict per (challenge_id, subject) — subsequent evaluations upsert.
-- pass:          whether the subject satisfied the challenge rules
-- reasons:       human-readable list of reasons (empty on pass)
-- evidence_hash: hash of the evidence used to produce this verdict
-- evaluator:     which evaluator produced the verdict (e.g. 'fitness', 'gaming_dota')
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.verdicts (
  id             bigserial     PRIMARY KEY,
  challenge_id   bigint        NOT NULL,
  subject        text          NOT NULL,
  pass           boolean       NOT NULL,
  reasons        text[]        NOT NULL DEFAULT '{}',
  evidence_hash  text          NOT NULL,
  evaluator      text          NOT NULL,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT verdicts_challenge_subject_uq UNIQUE (challenge_id, subject)
);

CREATE INDEX IF NOT EXISTS verdicts_challenge_id_idx
  ON public.verdicts (challenge_id);
