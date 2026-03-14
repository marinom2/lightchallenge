-- 017_expanded_models_templates.sql
-- Expand model catalog: real hashes for fitbit, googlefit, garmin distance, cs2.
-- Add parameterized challenge templates.

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- MODELS — Fix placeholder hashes + add expanded library
-- ═════════════════════════════════════════════════════════════════════════════

-- Verifier address (ChallengePayAivmPoiVerifier deployed on testnet)
-- All AIVM models use this verifier.

-- ── Fitbit ──────────────────────────────────────────────────────────────────
INSERT INTO public.models (id, label, kind, model_hash, verifier, binding, signals, params_schema, sources, file_accept, notes, active)
VALUES
  ('fitbit.steps@1',
   'Fitbit — Daily Steps', 'aivm',
   '0xef89f75d3f5b1bb04ee42748a51dc8410c79cfdea474356ed5edb0b08e451ee9',
   '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
   true,
   '["bind","success","total_steps"]'::jsonb,
   '[{"key":"minSteps","label":"Min steps","kind":"number","min":100,"default":8000},{"key":"targetDayUtc","label":"Target day (YYYY-MM-DD)","kind":"text"}]'::jsonb,
   '["Fitbit daily steps"]'::jsonb,
   '[".json"]'::jsonb,
   'Fitbit daily steps from Fitbit Web API or manual JSON export',
   true),
  ('fitbit.distance@1',
   'Fitbit — Distance in Window', 'aivm',
   '0x3a7a7b773abcce8dd5619d63eff68bb14d12b873ca5d2fb395aee7a5c5d89fd6',
   '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
   true,
   '["bind","success","distance_m"]'::jsonb,
   '[{"key":"minMeters","label":"Min distance (m)","kind":"number","min":100,"default":5000},{"key":"startTs","label":"Start (Unix)","kind":"number"},{"key":"endTs","label":"End (Unix)","kind":"number"}]'::jsonb,
   '["Fitbit activity logs"]'::jsonb,
   '[".json"]'::jsonb,
   'Fitbit distance from activity logs',
   true)
ON CONFLICT (id) DO UPDATE SET
  model_hash = EXCLUDED.model_hash,
  label = EXCLUDED.label,
  signals = EXCLUDED.signals,
  params_schema = EXCLUDED.params_schema,
  sources = EXCLUDED.sources,
  file_accept = EXCLUDED.file_accept,
  notes = EXCLUDED.notes,
  active = EXCLUDED.active,
  updated_at = now();

-- ── Google Fit ──────────────────────────────────────────────────────────────
INSERT INTO public.models (id, label, kind, model_hash, verifier, binding, signals, params_schema, sources, file_accept, notes, active)
VALUES
  ('googlefit.steps@1',
   'Google Fit — Daily Steps', 'aivm',
   '0xe63ac4325bc9b06404dabf113dbee540064bb36aac31f54dd9ae3dad706b9484',
   '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
   true,
   '["bind","success","total_steps"]'::jsonb,
   '[{"key":"minSteps","label":"Min steps","kind":"number","min":100,"default":8000},{"key":"targetDayUtc","label":"Target day (YYYY-MM-DD)","kind":"text"}]'::jsonb,
   '["Google Fit Takeout export"]'::jsonb,
   '[".json"]'::jsonb,
   'Google Fit steps from Takeout JSON export (API deprecated 2025)',
   true),
  ('googlefit.distance@1',
   'Google Fit — Distance in Window', 'aivm',
   '0x396b3817947618e5e3277256c54eae4c10def805bb207513deaa9bb30b19dd2e',
   '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
   true,
   '["bind","success","distance_m"]'::jsonb,
   '[{"key":"minMeters","label":"Min distance (m)","kind":"number","min":100,"default":5000},{"key":"startTs","label":"Start (Unix)","kind":"number"},{"key":"endTs","label":"End (Unix)","kind":"number"}]'::jsonb,
   '["Google Fit Takeout export"]'::jsonb,
   '[".json"]'::jsonb,
   'Google Fit distance from Takeout JSON export',
   true)
ON CONFLICT (id) DO UPDATE SET
  model_hash = EXCLUDED.model_hash,
  label = EXCLUDED.label,
  signals = EXCLUDED.signals,
  params_schema = EXCLUDED.params_schema,
  sources = EXCLUDED.sources,
  file_accept = EXCLUDED.file_accept,
  notes = EXCLUDED.notes,
  active = EXCLUDED.active,
  updated_at = now();

-- ── Garmin Distance ─────────────────────────────────────────────────────────
INSERT INTO public.models (id, label, kind, model_hash, verifier, binding, signals, params_schema, sources, file_accept, notes, active)
VALUES
  ('garmin.distance@1',
   'Garmin — Distance in Window', 'aivm',
   '0x1f0529367f707855129caa7af76a01c8ed88b22602f06433aaa7fc0a50cd1b90',
   '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
   true,
   '["bind","success","distance_m"]'::jsonb,
   '[{"key":"minMeters","label":"Min distance (m)","kind":"number","min":100,"default":5000},{"key":"startTs","label":"Start (Unix)","kind":"number"},{"key":"endTs","label":"End (Unix)","kind":"number"}]'::jsonb,
   '["Garmin Connect TCX/GPX/JSON export"]'::jsonb,
   '[".json",".tcx",".gpx"]'::jsonb,
   'Garmin distance from TCX/GPX activity exports or JSON daily summary',
   true)
ON CONFLICT (id) DO UPDATE SET
  model_hash = EXCLUDED.model_hash,
  label = EXCLUDED.label,
  signals = EXCLUDED.signals,
  params_schema = EXCLUDED.params_schema,
  sources = EXCLUDED.sources,
  file_accept = EXCLUDED.file_accept,
  notes = EXCLUDED.notes,
  active = EXCLUDED.active,
  updated_at = now();

-- ── CS2 / FACEIT ────────────────────────────────────────────────────────────
INSERT INTO public.models (id, label, kind, model_hash, verifier, binding, signals, params_schema, sources, file_accept, notes, active)
VALUES
  ('cs2.faceit_wins@1',
   'CS2 — FACEIT Match Wins', 'aivm',
   '0x68897197aeecd201ed61384bb4b1b07b1e14d4c3ac57ed33ebc0dd528ed551f4',
   '0x6aa0387ABF657d5Bf0710BbC9239e000eC4223d0',
   true,
   '["bind","success","wins"]'::jsonb,
   '[{"key":"minWins","label":"Min wins","kind":"number","min":1,"default":5},{"key":"startTs","label":"Start (Unix)","kind":"number"},{"key":"endTs","label":"End (Unix)","kind":"number"}]'::jsonb,
   '["FACEIT CS2 match history"]'::jsonb,
   '[".json"]'::jsonb,
   'CS2 wins from FACEIT Data API. Requires Steam account linked to FACEIT.',
   true)
ON CONFLICT (id) DO UPDATE SET
  model_hash = EXCLUDED.model_hash,
  label = EXCLUDED.label,
  signals = EXCLUDED.signals,
  params_schema = EXCLUDED.params_schema,
  sources = EXCLUDED.sources,
  file_accept = EXCLUDED.file_accept,
  notes = EXCLUDED.notes,
  active = EXCLUDED.active,
  updated_at = now();

-- ═════════════════════════════════════════════════════════════════════════════
-- PARAMETERIZED CHALLENGE TEMPLATES
-- ═════════════════════════════════════════════════════════════════════════════
-- Templates are parameterized — users provide concrete values at challenge creation.
-- rule_config stores the evaluator rule SHAPE; the UI fills in dynamic values.

-- ── Fitness Threshold Templates ─────────────────────────────────────────────
INSERT INTO public.challenge_templates (id, name, hint, kind, model_id, fields_json, rule_config, active)
VALUES
  -- Steps threshold (any provider: Apple, Fitbit, Garmin, Google Fit)
  ('fitness_steps_threshold',
   'Steps Threshold',
   'Reach a target number of steps within a time window.',
   'steps',
   'apple_health.steps@1',
   '[{"key":"minSteps","label":"Target steps","kind":"number","min":100,"step":100,"default":8000},{"key":"days","label":"Duration (days)","kind":"number","min":1,"step":1,"default":7}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"steps_count","aggregation":"sum","comparison":"gte"}'::jsonb,
   true),

  -- Distance threshold
  ('fitness_distance_threshold',
   'Distance Threshold',
   'Cover a target distance (run, walk, cycle, hike) within a time window.',
   'running',
   'strava.distance_in_window@1',
   '[{"key":"distanceKm","label":"Target distance (km)","kind":"number","min":0.5,"step":0.5,"default":5},{"key":"activityType","label":"Activity type","kind":"select","options":[{"value":"run","label":"Running"},{"value":"walk","label":"Walking"},{"value":"cycle","label":"Cycling"},{"value":"hike","label":"Hiking"}],"default":"run"}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"distance_km","aggregation":"sum","comparison":"gte"}'::jsonb,
   true),

  -- Duration threshold
  ('fitness_duration_threshold',
   'Duration Threshold',
   'Accumulate a target number of active minutes within a time window.',
   'running',
   'strava.distance_in_window@1',
   '[{"key":"durationMin","label":"Target minutes","kind":"number","min":10,"step":5,"default":60},{"key":"activityType","label":"Activity type","kind":"select","options":[{"value":"run","label":"Running"},{"value":"walk","label":"Walking"},{"value":"cycle","label":"Cycling"},{"value":"swim","label":"Swimming"}],"default":"run"}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"duration_min","aggregation":"sum","comparison":"gte"}'::jsonb,
   true),

  -- Elevation threshold
  ('fitness_elevation_threshold',
   'Elevation Gain Threshold',
   'Accumulate a target elevation gain within a time window.',
   'hiking',
   'strava.distance_in_window@1',
   '[{"key":"elevGainM","label":"Target elevation (m)","kind":"number","min":50,"step":50,"default":500},{"key":"activityType","label":"Activity type","kind":"select","options":[{"value":"hike","label":"Hiking"},{"value":"run","label":"Running"},{"value":"cycle","label":"Cycling"}],"default":"hike"}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"elev_gain_m","aggregation":"sum","comparison":"gte"}'::jsonb,
   true),

  -- Competitive steps
  ('fitness_steps_competitive',
   'Steps Competition',
   'Compete: whoever accumulates the most steps wins.',
   'steps',
   'apple_health.steps@1',
   '[]'::jsonb,
   '{"evaluation_mode":"competitive","metric":"steps_count","aggregation":"sum","higher_is_better":true,"tie_break":"earliest_submission"}'::jsonb,
   true),

  -- Competitive distance
  ('fitness_distance_competitive',
   'Distance Competition',
   'Compete: whoever covers the most distance wins.',
   'running',
   'strava.distance_in_window@1',
   '[{"key":"activityType","label":"Activity type","kind":"select","options":[{"value":"run","label":"Running"},{"value":"walk","label":"Walking"},{"value":"cycle","label":"Cycling"}],"default":"run"}]'::jsonb,
   '{"evaluation_mode":"competitive","metric":"distance_km","aggregation":"sum","higher_is_better":true,"tie_break":"earliest_submission"}'::jsonb,
   true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  hint = EXCLUDED.hint,
  kind = EXCLUDED.kind,
  model_id = EXCLUDED.model_id,
  fields_json = EXCLUDED.fields_json,
  rule_config = EXCLUDED.rule_config,
  active = EXCLUDED.active,
  updated_at = now();

-- ── Gaming Threshold Templates ──────────────────────────────────────────────
INSERT INTO public.challenge_templates (id, name, hint, kind, model_id, fields_json, rule_config, active)
VALUES
  -- Match wins (any game)
  ('gaming_match_win_threshold',
   'Match Wins',
   'Win a target number of matches within a time window.',
   'dota',
   'dota.private_match_1v1@1',
   '[{"key":"minWins","label":"Target wins","kind":"number","min":1,"step":1,"default":3},{"key":"rankedOnly","label":"Ranked only","kind":"select","options":[{"value":"true","label":"Yes"},{"value":"false","label":"No"}],"default":"false"}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"wins","aggregation":"count","comparison":"gte"}'::jsonb,
   true),

  -- Hero/champion-specific wins
  ('gaming_hero_win_threshold',
   'Hero/Champion Wins',
   'Win matches with a specific hero or champion.',
   'dota',
   'dota.hero_kills_window@1',
   '[{"key":"minWins","label":"Target wins","kind":"number","min":1,"step":1,"default":3},{"key":"hero","label":"Hero / Champion name","kind":"text","default":""},{"key":"rankedOnly","label":"Ranked only","kind":"select","options":[{"value":"true","label":"Yes"},{"value":"false","label":"No"}],"default":"false"}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"wins","aggregation":"count","comparison":"gte","filters":["hero"]}'::jsonb,
   true),

  -- Win streak
  ('gaming_win_streak_threshold',
   'Win Streak',
   'Achieve a win streak of N consecutive wins.',
   'dota',
   'dota.private_match_1v1@1',
   '[{"key":"streakLength","label":"Streak length","kind":"number","min":2,"step":1,"default":3},{"key":"rankedOnly","label":"Ranked only","kind":"select","options":[{"value":"true","label":"Yes"},{"value":"false","label":"No"}],"default":"false"}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"win_streak","aggregation":"max","comparison":"gte"}'::jsonb,
   true),

  -- Competitive kills
  ('gaming_kills_competitive',
   'Kills Competition',
   'Compete: most total kills wins.',
   'dota',
   'dota.hero_kills_window@1',
   '[{"key":"rankedOnly","label":"Ranked only","kind":"select","options":[{"value":"true","label":"Yes"},{"value":"false","label":"No"}],"default":"false"}]'::jsonb,
   '{"evaluation_mode":"competitive","metric":"kills","aggregation":"sum","higher_is_better":true,"tie_break":"earliest_submission"}'::jsonb,
   true),

  -- CS2 FACEIT wins
  ('gaming_cs2_wins_threshold',
   'CS2 FACEIT Wins',
   'Win a target number of CS2 FACEIT matches.',
   'cs',
   'cs2.faceit_wins@1',
   '[{"key":"minWins","label":"Target wins","kind":"number","min":1,"step":1,"default":5}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"wins","aggregation":"count","comparison":"gte"}'::jsonb,
   true),

  -- LoL wins
  ('gaming_lol_wins_threshold',
   'LoL Match Wins',
   'Win a target number of League of Legends matches.',
   'lol',
   'lol.winrate_next_n@1',
   '[{"key":"minWins","label":"Target wins","kind":"number","min":1,"step":1,"default":5},{"key":"rankedOnly","label":"Ranked only","kind":"select","options":[{"value":"true","label":"Yes"},{"value":"false","label":"No"}],"default":"true"}]'::jsonb,
   '{"evaluation_mode":"threshold","metric":"wins","aggregation":"count","comparison":"gte"}'::jsonb,
   true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  hint = EXCLUDED.hint,
  kind = EXCLUDED.kind,
  model_id = EXCLUDED.model_id,
  fields_json = EXCLUDED.fields_json,
  rule_config = EXCLUDED.rule_config,
  active = EXCLUDED.active,
  updated_at = now();

COMMIT;
