-- Migration 003: participants table
--
-- Tracks off-chain join records for challenge participants.
-- Populated from two sources:
--   1. Frontend calls POST /api/challenge/[id]/participant after a successful
--      on-chain joinChallenge* transaction.
--   2. The intake route upserts a participant row whenever evidence is
--      submitted for a non-zero challenge_id.
--
-- This table is the source-of-truth for the "My Challenges" page and for the
-- participant status API.  On-chain Joined events remain the authoritative
-- record; this table is a queryable cache.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.participants (
  id            bigserial    PRIMARY KEY,
  challenge_id  bigint       NOT NULL,
  subject       text         NOT NULL,      -- lowercase 0x wallet address
  tx_hash       text,                       -- on-chain join tx hash (nullable)
  joined_at     timestamptz,                -- timestamp of on-chain join (set by caller)
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- Expression-based uniqueness: one row per (challenge_id, normalised subject)
CREATE UNIQUE INDEX IF NOT EXISTS participants_challenge_subject_uq
  ON public.participants (challenge_id, lower(subject));

CREATE INDEX IF NOT EXISTS participants_subject_idx
  ON public.participants (lower(subject));

CREATE INDEX IF NOT EXISTS participants_challenge_id_idx
  ON public.participants (challenge_id);
