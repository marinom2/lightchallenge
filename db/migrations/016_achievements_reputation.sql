-- 016_achievements_reputation.sql
-- Achievement tracking + reputation system for LightChallenge soulbound tokens.

-- ─── Achievement mints (indexed from on-chain events) ────────────────────────

CREATE TABLE IF NOT EXISTS public.achievement_mints (
  id              bigserial     PRIMARY KEY,
  token_id        bigint        NOT NULL UNIQUE,
  challenge_id    bigint        NOT NULL,
  recipient       text          NOT NULL,
  achievement_type text         NOT NULL CHECK (achievement_type IN ('completion', 'victory')),
  tx_hash         text,
  block_number    bigint,
  minted_at       timestamptz   NOT NULL DEFAULT now(),
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_achievement_mints_recipient
  ON public.achievement_mints (lower(recipient));

CREATE INDEX IF NOT EXISTS idx_achievement_mints_challenge
  ON public.achievement_mints (challenge_id);

-- ─── Reputation scores (computed off-chain, stored for fast reads) ───────────

CREATE TABLE IF NOT EXISTS public.reputation (
  subject         text          PRIMARY KEY,
  points          integer       NOT NULL DEFAULT 0,
  level           integer       NOT NULL DEFAULT 1,
  completions     integer       NOT NULL DEFAULT 0,
  victories       integer       NOT NULL DEFAULT 0,
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
