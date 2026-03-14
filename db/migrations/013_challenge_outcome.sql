-- Migration 013: chain_outcome column on challenges
--
-- Stores the on-chain Outcome enum value from the ChallengePay Finalized event.
-- Written by statusIndexer when it observes a Finalized(id, status, outcome) event.
--
-- ChallengePay Outcome enum (contracts/ChallengePay.sol):
--   0 = None     — not yet finalized
--   1 = Success  — winners paid out (Challenge.winnersPool > 0 and no peer gate fail)
--   2 = Fail     — nobody won (staked amount forfeited / returned to cashback)
--
-- NULL means the indexer has not recorded a finalization outcome yet.
-- This is the authoritative source for reward eligibility; it takes priority over
-- DB verdict_pass when they disagree (chain outcome wins for money-critical logic).
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS chain_outcome smallint DEFAULT NULL;

COMMENT ON COLUMN public.challenges.chain_outcome IS
  '0=None,1=Success,2=Fail — from ChallengePay Finalized event. NULL = not yet recorded.';
