-- Migration 010: indexer_state table
--
-- Simple key-value store used by aivmIndexer.ts to persist the last
-- processed block number and other indexer checkpoints across restarts.
--
-- key:   e.g. 'lastBlock', 'lastProcessedAt'
-- value: text (stored as string; callers parse to int/timestamp as needed)
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.indexer_state (
  key   text  PRIMARY KEY,
  value text
);
