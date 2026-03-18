-- 027_expanded_fitness_models.sql
--
-- Register additional provider-agnostic fitness models for new activity types:
-- yoga, HIIT, calories, rowing, walking, exercise time.
-- These match the templates added to webapp/lib/templates.ts and iOS Templates.swift.

INSERT INTO public.models (id, label, kind, model_hash, verifier, active, created_at, updated_at)
VALUES
  ('fitness.yoga@1',
   'Fitness — Yoga (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60007',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.hiit@1',
   'Fitness — HIIT / CrossFit (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60008',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.calories@1',
   'Fitness — Calorie Burn (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f60009',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.rowing@1',
   'Fitness — Rowing (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000a',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.walking@1',
   'Fitness — Walking Distance (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000b',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now()),

  ('fitness.exercise@1',
   'Fitness — Exercise Minutes (all providers)',
   'aivm',
   '0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6000c',
   '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
   true, now(), now())

ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  model_hash = EXCLUDED.model_hash,
  verifier = EXCLUDED.verifier,
  active = EXCLUDED.active,
  updated_at = now();
