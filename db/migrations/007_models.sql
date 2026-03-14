-- Migration 007: models table
--
-- Stores the model catalog previously kept in webapp/public/models/models.json.
-- The admin API (GET/PUT /api/admin/models) now reads/writes this table.
-- webapp/lib/modelRegistry.ts fetches via the API — no change needed there.
--
-- params_schema: JSON array of TemplateField descriptors (key/label/type/default)
--   used by the create-challenge UI to render model-specific form fields.
-- signals: JSON array of output signal names produced by the model.
-- sources: JSON array of human-readable data-source strings.
-- file_accept: JSON array of accepted file extensions (e.g. [".zip", ".json"]).
-- active: false = soft-deleted / hidden from the create UI.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.models (
  id             text         PRIMARY KEY,          -- e.g. 'apple_health.steps@1'
  label          text         NOT NULL,
  kind           text         NOT NULL,             -- 'aivm' | 'zk' | 'plonk'
  model_hash     text         NOT NULL,             -- '0x...'
  verifier       text         NOT NULL,             -- '0x...' contract address
  plonk_verifier text,                              -- optional second verifier
  binding        boolean      NOT NULL DEFAULT false,
  signals        jsonb        NOT NULL DEFAULT '[]',
  params_schema  jsonb        NOT NULL DEFAULT '[]',
  sources        jsonb        NOT NULL DEFAULT '[]',
  file_accept    jsonb        NOT NULL DEFAULT '[]',
  notes          text,
  active         boolean      NOT NULL DEFAULT true,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS models_kind_idx    ON public.models (kind);
CREATE INDEX IF NOT EXISTS models_active_idx  ON public.models (active);

-- ── Seed data (from webapp/public/models/models.json) ─────────────────────────
-- INSERT ... ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO public.models
  (id, label, kind, model_hash, verifier, plonk_verifier, binding, signals, params_schema, sources, file_accept, notes)
VALUES
  (
    'strava.distance_in_window@1',
    'Strava — Distance in Window (ZK)',
    'zk',
    '0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e',
    '0xB503369b4d419062296931f304911F406cf8E3cc',
    '0x24346b67dE55d36E72068CA096Aa7f14819ACa3b',
    true,
    '["bind","success","distance_m_total"]',
    '[{"key":"start_ts","label":"Start (UTC)","type":"datetime"},{"key":"end_ts","label":"End (UTC)","type":"datetime"},{"key":"min_distance_m","label":"Minimum distance (m)","type":"int","default":5000}]',
    '["strava:file-upload","apple_health:zip"]',
    '[".gpx",".json",".zip"]',
    'publicSignals[0] = keccak256(abi.encode(challengeId, subject))'
  ),
  (
    'apple_health.steps@1',
    'Apple Health — Daily Steps (AIVM)',
    'aivm',
    '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
    '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
    NULL,
    true,
    '["bind","success","totalSteps","days","avgSteps"]',
    '[{"key":"days","label":"Number of days","type":"int","default":7},{"key":"minSteps","label":"Min steps/day","type":"int","default":8000}]',
    '["apple_health:zip (export.xml + workouts/steps)"]',
    '[".zip"]',
    NULL
  ),
  (
    'garmin.steps@1',
    'Garmin — Daily Steps (AIVM)',
    'aivm',
    '0x7abfc322e4b015bd06ff99afe644c44868506d0ef39ae80a17b21813a389a1f2',
    '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
    NULL,
    true,
    '["bind","success","totalSteps","days","avgSteps"]',
    '[{"key":"days","label":"Number of days","type":"int","default":7},{"key":"minSteps","label":"Min steps/day","type":"int","default":8000}]',
    '["garmin:export JSON (daily steps)"]',
    '[".json"]',
    NULL
  ),
  (
    'dota.winrate_next_n@1',
    'Dota 2 — Win Rate (Next N Matches, AIVM)',
    'aivm',
    '0x39abeb3664e21ae78cd0ae1b2393ac5e3d3fa3fa5a2f290474c323cce59d93c6',
    '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
    NULL,
    true,
    '["bind","wins","games","winRatePct"]',
    '[{"key":"matches","label":"Next N matches","type":"int","default":50},{"key":"rankedOnly","label":"Ranked only? (true/false)","type":"text","default":"true"}]',
    '["Steam ↔ wallet binding","OpenDota API"]',
    '[]',
    'Filters your next N matches; if rankedOnly=true restrict to ranked queues'
  ),
  (
    'lol.winrate_next_n@1',
    'League of Legends — Win Rate (Next N Matches, AIVM)',
    'aivm',
    '0x6a68a575fa50ebbc7c0404ebe2078f7a79cfa95b4c2efd9c869b0744137456c3',
    '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
    NULL,
    true,
    '["bind","wins","games","winRatePct"]',
    '[{"key":"matches","label":"Next N matches","type":"int","default":20},{"key":"queue","label":"Queue (ranked/flex/aram)","type":"text","default":"ranked"}]',
    '["Riot API (PUUID binding)"]',
    '[]',
    NULL
  ),
  (
    'dota.hero_kills_window@1',
    'Dota 2 — Hero Kills in Time Window (AIVM)',
    'aivm',
    '0x0de4617204f86e47e89b88696ce2d323fa053589dce9152a523741429a83ddb1',
    '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
    NULL,
    true,
    '["bind","kills","matches","success"]',
    '[{"key":"start_ts","label":"Start (UTC)","type":"datetime"},{"key":"end_ts","label":"End (UTC)","type":"datetime"},{"key":"hero","label":"Hero (string id)","type":"text","default":"antimage"},{"key":"minKills","label":"Total kills required","type":"int","default":100},{"key":"rankedOnly","label":"Ranked only? (true/false)","type":"text","default":"true"}]',
    '["Steam ↔ wallet binding","OpenDota API"]',
    '[]',
    NULL
  ),
  (
    'dota.private_match_1v1@1',
    'Dota 2 — Private Match 1v1 (AIVM)',
    'aivm',
    '0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def',
    '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
    NULL,
    true,
    '["bind","success","matchCount"]',
    '[{"key":"start_ts","label":"Start (UTC)","type":"datetime"},{"key":"end_ts","label":"End (UTC)","type":"datetime"},{"key":"minMatches","label":"Min matches to count","type":"int","default":1}]',
    '["Steam ↔ wallet binding","OpenDota API (lobby_type/custom identifiers)"]',
    '[]',
    'Verifies at least N valid 1v1 private matches for subject in window'
  ),
  (
    'dota.private_match_5v5@1',
    'Dota 2 — Private Match 5v5 (AIVM)',
    'aivm',
    '0xa36667f7fba0e008bfca236bcec118fef4f7177046cbc57f093b557b41ca95e6',
    '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
    NULL,
    true,
    '["bind","success","matchCount"]',
    '[{"key":"start_ts","label":"Start (UTC)","type":"datetime"},{"key":"end_ts","label":"End (UTC)","type":"datetime"},{"key":"minMatches","label":"Min matches to count","type":"int","default":1}]',
    '["Steam ↔ wallet binding","OpenDota API (lobby_type/custom identifiers)"]',
    '[]',
    'Verifies at least N valid 5v5 private matches for subject in window'
  )
ON CONFLICT (id) DO NOTHING;
