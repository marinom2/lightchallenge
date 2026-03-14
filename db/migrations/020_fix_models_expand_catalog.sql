-- 020_fix_models_expand_catalog.sql
-- Fix strava model kind from 'zk' to 'aivm'.
-- Add missing model IDs referenced by code-side templates.
-- All Strava-based models share the same adapter hash since the
-- Strava adapter handles all sport types; differentiation is via evaluator rules.

-- Fix strava kind
UPDATE public.models SET kind = 'aivm' WHERE id = 'strava.distance_in_window@1' AND kind = 'zk';

-- Strava sport-specific model aliases (same adapter hash as strava.distance_in_window@1)
INSERT INTO public.models (id, label, kind, model_hash, verifier, binding, signals, params_schema, sources, file_accept, notes, active)
VALUES
  ('strava.cycling_distance_in_window@1', 'Strava Cycling Distance', 'aivm',
   '0xd3a933d7c6528699a4b5f08c1b47ee1ff85927e63cb06ad7e35b17a478f97e65',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123', true,
   '["distance_m","duration_s","activity_count"]'::jsonb,
   '[]'::jsonb,
   '["strava"]'::jsonb, '["json","tcx","gpx"]'::jsonb,
   'Strava cycling distance verification', true),

  ('strava.elevation_gain_window@1', 'Strava Elevation Gain', 'aivm',
   '0xd3a933d7c6528699a4b5f08c1b47ee1ff85927e63cb06ad7e35b17a478f97e65',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123', true,
   '["elev_gain_m","distance_m","duration_s"]'::jsonb,
   '[]'::jsonb,
   '["strava"]'::jsonb, '["json","tcx","gpx"]'::jsonb,
   'Strava elevation gain verification', true),

  ('strava.swimming_laps_window@1', 'Strava Swimming Laps', 'aivm',
   '0xd3a933d7c6528699a4b5f08c1b47ee1ff85927e63cb06ad7e35b17a478f97e65',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123', true,
   '["laps","distance_m","duration_s"]'::jsonb,
   '[]'::jsonb,
   '["strava"]'::jsonb, '["json","tcx","gpx"]'::jsonb,
   'Strava swimming laps verification', true),

  -- Garmin sport-specific aliases
  ('garmin.activity_duration@1', 'Garmin Activity Duration', 'aivm',
   '0x7abfc322e4b015bdf5789ce6133c87c24d60f88ecbfb7efc65b6fb4b547ba655',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123', true,
   '["duration_s","steps","distance_m"]'::jsonb,
   '[]'::jsonb,
   '["garmin"]'::jsonb, '["json"]'::jsonb,
   'Garmin activity duration verification', true),

  -- Fitbit activity duration
  ('fitbit.activity_duration@1', 'Fitbit Activity Duration', 'aivm',
   '0xef89f75d3f5b1bb08cd9ae83cb22f6ebee5c5aa4ab0cba58ad72f6f5c5f3e22f',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123', true,
   '["duration_s","steps","distance_m"]'::jsonb,
   '[]'::jsonb,
   '["fitbit"]'::jsonb, '["json"]'::jsonb,
   'Fitbit activity duration verification', true),

  -- Google Fit activity duration
  ('googlefit.activity_duration@1', 'Google Fit Activity Duration', 'aivm',
   '0xe63ac4325bc9b064d2e74bce3ff0b9d6e6153ef20a85025c2e5ee66d4f7c1e33',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123', true,
   '["duration_s","steps","distance_m"]'::jsonb,
   '[]'::jsonb,
   '["googlefit"]'::jsonb, '["json"]'::jsonb,
   'Google Fit activity duration verification', true)

ON CONFLICT (id) DO NOTHING;
