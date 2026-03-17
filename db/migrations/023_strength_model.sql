-- 023_strength_model.sql
-- Add Apple Health strength training model to the models catalog.

INSERT INTO public.models (id, label, kind, model_hash, verifier, active, created_at, updated_at)
VALUES (
  'apple_health.strength@1',
  'Apple Health — Strength Training',
  'aivm',
  '0x3e4f99b1597e7761d293466be582b73dbe1cdb2bfdf862fc3c41bfge0f121d0f',
  '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
  true,
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;
