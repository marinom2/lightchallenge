-- Migration 029: Add inviter_wallet to challenge_invites
--
-- Stores the wallet address of the user who sent the invite.
-- Used by the invite worker to notify the inviter when an invite is accepted.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.challenge_invites
  ADD COLUMN IF NOT EXISTS inviter_wallet text;
