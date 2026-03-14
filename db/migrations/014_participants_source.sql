-- Migration 014: participants.source provenance column
--
-- Records how each participant row was created:
--   onchain_join    — created via POST /api/challenge/[id]/participant after
--                     a successful on-chain joinChallenge() tx; tx_hash IS NOT NULL
--   evidence_intake — created implicitly by POST /api/aivm/intake when evidence
--                     was submitted without a prior join tx; tx_hash IS NULL
--   unknown         — rows created before this column existed where provenance
--                     cannot be safely inferred (tx_hash IS NULL AND joined_at IS NOT NULL)
--
-- Backfill logic (run once at migration time):
--   tx_hash IS NOT NULL           → onchain_join    (definitive: only join API sets tx_hash)
--   tx_hash IS NULL, joined_at IS NULL → evidence_intake  (definitive: intake never sets joined_at)
--   tx_hash IS NULL, joined_at IS NOT NULL → unknown  (edge case: may be manual or test data)
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN public.participants.source IS
  'Participant row provenance: onchain_join | evidence_intake | unknown';

-- Backfill existing rows
UPDATE public.participants
   SET source = 'onchain_join'
 WHERE tx_hash IS NOT NULL
   AND source = 'unknown';

UPDATE public.participants
   SET source = 'evidence_intake'
 WHERE tx_hash IS NULL
   AND joined_at IS NULL
   AND source = 'unknown';

-- Rows with tx_hash IS NULL AND joined_at IS NOT NULL remain 'unknown' (cannot be inferred safely).
