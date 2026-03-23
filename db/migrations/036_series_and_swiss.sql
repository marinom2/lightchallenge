-- 036_series_and_swiss.sql
-- Bo3/Bo5/Bo7 series support for bracket matches, plus Swiss tournament type.

-- ─── Series ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.series (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_match_id uuid          NOT NULL REFERENCES public.bracket_matches(id) ON DELETE CASCADE,
  competition_id   uuid          NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  format           text          NOT NULL DEFAULT 'bo1'
                                 CHECK (format IN ('bo1', 'bo3', 'bo5', 'bo7')),
  participant_a    text,
  participant_b    text,
  score_a          integer       NOT NULL DEFAULT 0,
  score_b          integer       NOT NULL DEFAULT 0,
  winner           text,
  status           text          NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'in_progress', 'completed')),
  map_veto         jsonb         NOT NULL DEFAULT '[]',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_bracket_match_uq
  ON public.series (bracket_match_id);

CREATE INDEX IF NOT EXISTS idx_series_competition
  ON public.series (competition_id);

-- ─── Series Games ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.series_games (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id        uuid          NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  game_number      integer       NOT NULL,
  winner           text,
  evidence_id      text,
  match_id_ext     text,
  platform         text,
  metadata         jsonb         NOT NULL DEFAULT '{}',
  status           text          NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at     timestamptz,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_games_uq
  ON public.series_games (series_id, game_number);

CREATE INDEX IF NOT EXISTS idx_series_games_series
  ON public.series_games (series_id);

-- ─── Add 'swiss' to competitions type CHECK ───────────────────────────────────

ALTER TABLE public.competitions
  DROP CONSTRAINT IF EXISTS competitions_type_check;

ALTER TABLE public.competitions
  ADD CONSTRAINT competitions_type_check
  CHECK (type IN ('challenge', 'bracket', 'league', 'circuit', 'ladder', 'swiss'));
