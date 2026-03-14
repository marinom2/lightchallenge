-- Migration 012: claims table
--
-- Persists on-chain claim events for challenge participants.
--
-- A claim row is created when:
--   1. The webapp UI writes a record after a successful claimETH / claimPrincipal
--      / etc. transaction is confirmed on-chain (immediate, primary path).
--   2. The claimsIndexer watches ChallengePay *Claimed events and Treasury
--      ClaimedETH events as a secondary/hardening source of truth.
--
-- One row per (challenge_id, subject, claim_type) — upserts on conflict so
-- both write paths are idempotent and the same claim is never recorded twice.
--
-- claim_type values mirror the 6 ChallengePay claim functions:
--   principal | cashback | validator_reward | validator_reject |
--   reject_creator | reject_contribution | treasury_eth
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.claims (
  id             bigserial     PRIMARY KEY,
  challenge_id   bigint        NOT NULL,
  subject        text          NOT NULL,           -- lowercase 0x wallet address
  claim_type     text          NOT NULL,           -- e.g. 'principal', 'cashback', 'treasury_eth'
  amount_wei     numeric(78,0) NOT NULL DEFAULT 0, -- claim amount in wei
  bucket_id      bigint,                           -- Treasury bucket ID (= challenge_id for most claims)
  tx_hash        text,                             -- on-chain transaction hash
  block_number   bigint,                           -- block where the claim tx was mined
  source         text          NOT NULL DEFAULT 'ui', -- 'ui' | 'indexer'
  metadata       jsonb,                            -- optional extra data (gas, event args, etc.)
  claimed_at     timestamptz   NOT NULL DEFAULT now(),
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

-- Prevent duplicate claims: one row per (challenge, subject, claim_type)
CREATE UNIQUE INDEX IF NOT EXISTS claims_challenge_subject_type_uq
  ON public.claims (challenge_id, lower(subject), claim_type);

-- Fast lookups by subject (for "my claims" page)
CREATE INDEX IF NOT EXISTS claims_subject_idx
  ON public.claims (lower(subject));

-- Fast lookups by challenge
CREATE INDEX IF NOT EXISTS claims_challenge_id_idx
  ON public.claims (challenge_id);

-- Fast lookups by tx_hash (for dedup by indexer)
CREATE INDEX IF NOT EXISTS claims_tx_hash_idx
  ON public.claims (tx_hash)
  WHERE tx_hash IS NOT NULL;
