-- Migration 004: linked_accounts table
--
-- Stores OAuth tokens and external IDs for connected provider accounts.
-- Used by the evidence collector worker to pull live data from provider APIs.
--
-- Providers: 'strava' | 'opendota' | 'riot' | 'apple' (placeholder)
--
-- access_token / refresh_token are stored in plain text.
-- Encrypt at rest in production (use database-level encryption or a vault).
--
-- token_expires_at: NULL means token does not expire or expiry is unknown.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.linked_accounts (
  id               bigserial    PRIMARY KEY,
  subject          text         NOT NULL,      -- lowercase 0x wallet address
  provider         text         NOT NULL,      -- 'strava' | 'opendota' | 'riot' | 'apple'
  external_id      text,                       -- provider's user / athlete ID
  access_token     text,                       -- OAuth access token
  refresh_token    text,                       -- OAuth refresh token
  token_expires_at timestamptz,               -- token expiry (null = no expiry / unknown)
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

-- Expression-based uniqueness: one linked account per (normalised subject, provider)
CREATE UNIQUE INDEX IF NOT EXISTS linked_accounts_subject_provider_uq
  ON public.linked_accounts (lower(subject), provider);

CREATE INDEX IF NOT EXISTS linked_accounts_subject_idx
  ON public.linked_accounts (lower(subject));

CREATE INDEX IF NOT EXISTS linked_accounts_provider_idx
  ON public.linked_accounts (provider);
