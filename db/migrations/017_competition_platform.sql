-- 017_competition_platform.sql
-- Full competition platform infrastructure: organizations, teams, API keys,
-- competitions, brackets, seasons, webhooks, white-label config.

-- ─── Organizations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text          NOT NULL,
  slug            text          NOT NULL UNIQUE,
  logo_url        text,
  website         text,
  description     text,
  owner_wallet    text          NOT NULL,
  theme           jsonb         NOT NULL DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner
  ON public.organizations (lower(owner_wallet));

CREATE INDEX IF NOT EXISTS idx_organizations_slug
  ON public.organizations (slug);

-- ─── Organization Members ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_members (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  wallet          text          NOT NULL,
  role            text          NOT NULL DEFAULT 'member'
                                CHECK (role IN ('owner', 'admin', 'member')),
  email           text,
  joined_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_uq
  ON public.org_members (org_id, lower(wallet));

-- ─── Teams ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teams (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text          NOT NULL,
  tag             text,
  logo_url        text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_org
  ON public.teams (org_id);

-- ─── Team Roster ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_roster (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid          NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  wallet          text          NOT NULL,
  role            text          NOT NULL DEFAULT 'player'
                                CHECK (role IN ('captain', 'player', 'substitute')),
  joined_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_roster_uq
  ON public.team_roster (team_id, lower(wallet));

-- ─── API Keys ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_keys (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_hash        text          NOT NULL UNIQUE,
  key_prefix      text          NOT NULL,
  label           text          NOT NULL,
  scopes          text[]        NOT NULL DEFAULT '{}',
  rate_limit      integer       NOT NULL DEFAULT 1000,
  last_used_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  revoked_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org
  ON public.api_keys (org_id);

-- ─── Competitions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.competitions (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          REFERENCES public.organizations(id),
  title           text          NOT NULL,
  description     text,
  type            text          NOT NULL DEFAULT 'challenge'
                                CHECK (type IN ('challenge', 'bracket', 'league', 'circuit', 'ladder')),
  status          text          NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'registration', 'active', 'finalizing', 'completed', 'canceled')),
  category        text,
  rules           jsonb         NOT NULL DEFAULT '{}',
  prize_config    jsonb         NOT NULL DEFAULT '{}',
  settings        jsonb         NOT NULL DEFAULT '{}',
  challenge_ids   bigint[]      NOT NULL DEFAULT '{}',
  registration_opens_at   timestamptz,
  registration_closes_at  timestamptz,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_by      text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitions_org
  ON public.competitions (org_id);

CREATE INDEX IF NOT EXISTS idx_competitions_status
  ON public.competitions (status);

CREATE INDEX IF NOT EXISTS idx_competitions_type
  ON public.competitions (type);

-- ─── Competition Registrations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.competition_registrations (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid          NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  wallet          text,
  team_id         uuid          REFERENCES public.teams(id),
  seed            integer,
  checked_in      boolean       NOT NULL DEFAULT false,
  registered_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_reg_wallet_uq
  ON public.competition_registrations (competition_id, lower(wallet))
  WHERE wallet IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comp_reg_team_uq
  ON public.competition_registrations (competition_id, team_id)
  WHERE team_id IS NOT NULL;

-- ─── Bracket Matches ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bracket_matches (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid          NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  round           integer       NOT NULL,
  match_number    integer       NOT NULL,
  bracket_type    text          NOT NULL DEFAULT 'winners'
                                CHECK (bracket_type IN ('winners', 'losers', 'grand_final')),
  participant_a   text,
  participant_b   text,
  score_a         integer,
  score_b         integer,
  winner          text,
  status          text          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'in_progress', 'completed', 'bye')),
  challenge_id    bigint,
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bracket_match_uq
  ON public.bracket_matches (competition_id, round, match_number, bracket_type);

CREATE INDEX IF NOT EXISTS idx_bracket_matches_comp
  ON public.bracket_matches (competition_id);

-- ─── Seasons ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.seasons (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          REFERENCES public.organizations(id),
  name            text          NOT NULL,
  description     text,
  status          text          NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'completed', 'canceled')),
  scoring_config  jsonb         NOT NULL DEFAULT '{"win": 3, "loss": 0, "draw": 1}',
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- ─── Season ↔ Competition Link ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.season_competitions (
  season_id       uuid          NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  competition_id  uuid          NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  weight          float         NOT NULL DEFAULT 1.0,
  PRIMARY KEY (season_id, competition_id)
);

-- ─── Season Standings ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.season_standings (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       uuid          NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  wallet          text          NOT NULL,
  points          integer       NOT NULL DEFAULT 0,
  wins            integer       NOT NULL DEFAULT 0,
  losses          integer       NOT NULL DEFAULT 0,
  draws           integer       NOT NULL DEFAULT 0,
  competitions_entered integer  NOT NULL DEFAULT 0,
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_season_standings_uq
  ON public.season_standings (season_id, lower(wallet));

-- ─── Webhooks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhooks (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url             text          NOT NULL,
  secret          text          NOT NULL,
  events          text[]        NOT NULL DEFAULT '{}',
  active          boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org
  ON public.webhooks (org_id);

-- ─── Webhook Deliveries ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      uuid          NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event           text          NOT NULL,
  payload         jsonb         NOT NULL,
  response_status integer,
  response_body   text,
  attempt         integer       NOT NULL DEFAULT 1,
  delivered_at    timestamptz,
  next_retry_at   timestamptz,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON public.webhook_deliveries (next_retry_at)
  WHERE delivered_at IS NULL;

-- ─── White-label Config ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whitelabel_configs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  custom_domain   text,
  primary_color   text          DEFAULT '#6B5CFF',
  logo_url        text,
  favicon_url     text,
  custom_css      text,
  footer_text     text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
