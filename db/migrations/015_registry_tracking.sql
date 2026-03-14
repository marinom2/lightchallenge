-- Migration 015: registry tracking columns on public.challenges
--
-- Tracks whether the MetadataRegistry on-chain pointer has been written
-- for each challenge. Enables backfill/reconciliation of failed writes.
--
-- registry_status: 'pending' | 'success' | 'failed' | 'skipped'
-- registry_tx_hash: tx hash of the successful ownerSet() call
-- registry_error:   error message if the write failed
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS registry_status  text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS registry_tx_hash text,
  ADD COLUMN IF NOT EXISTS registry_error   text;

-- Index for backfill queries: find challenges needing registry writes
CREATE INDEX IF NOT EXISTS idx_challenges_registry_status
  ON public.challenges (registry_status)
  WHERE registry_status IN ('pending', 'failed');
