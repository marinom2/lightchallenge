-- 037_live_game_events.sql
-- Tables for live game event streaming from desktop clients via WebSocket gateway.

-- Game sessions track active desktop client connections
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet          text          NOT NULL,
  platform        text          NOT NULL CHECK (platform IN ('dota2', 'cs2', 'lol')),
  external_match_id text,
  status          text          NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at      timestamptz   NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  event_count     integer       NOT NULL DEFAULT 0,
  summary         jsonb
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_wallet
  ON public.game_sessions (lower(wallet), started_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_sessions_status
  ON public.game_sessions (status) WHERE status = 'active';

-- Raw GSI/LiveClient events streamed from desktop clients
CREATE TABLE IF NOT EXISTS public.live_game_events (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid          NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  wallet          text          NOT NULL,
  platform        text          NOT NULL,
  event_type      text          NOT NULL,
  data            jsonb         NOT NULL,
  received_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_events_session
  ON public.live_game_events (session_id, received_at DESC);

-- Partition-friendly: events older than 7 days can be archived/deleted
CREATE INDEX IF NOT EXISTS idx_live_events_received
  ON public.live_game_events (received_at);
