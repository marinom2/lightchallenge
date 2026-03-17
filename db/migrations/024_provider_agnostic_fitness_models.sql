-- 024_provider_agnostic_fitness_models.sql
--
-- Register provider-agnostic fitness model IDs.
-- Challenges reference these generic model IDs (e.g. "fitness.steps@1")
-- instead of provider-specific ones (e.g. "apple_health.steps@1").
-- The user connects their preferred tracking app (Apple Health, Strava,
-- Garmin, Fitbit, Google Fit) — the evidence is evaluated by the same model.

INSERT INTO public.models (id, label, kind, model_hash, verifier, active, created_at, updated_at)
VALUES
  ('fitness.steps@1',
   'Fitness — Steps (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60001',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.distance@1',
   'Fitness — Running/Walking Distance (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60002',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.cycling@1',
   'Fitness — Cycling Distance (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60003',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.hiking@1',
   'Fitness — Hiking (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60004',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.swimming@1',
   'Fitness — Swimming (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60005',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.strength@1',
   'Fitness — Strength Training (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60006',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now())

ON CONFLICT (id) DO NOTHING;
