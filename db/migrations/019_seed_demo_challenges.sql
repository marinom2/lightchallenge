-- 019_seed_demo_challenges.sql
-- Seed challenges for manual testing of threshold and competitive modes.
-- Uses the real test wallet as creator/subject.
-- These are DB-only rows — no on-chain state. For full E2E, use the create API + on-chain join.
-- IDs start at 100 to avoid conflicts with existing challenges.

BEGIN;

-- ── Helper: real verifier address ──────────────────────────────────────────────
-- 0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123 = ChallengePayAivmPoiVerifier

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- BATCH 1: Manual Test Challenges (one per category)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- TEST-100: Threshold fitness — Steps (Apple Health / Garmin / Fitbit / Google Fit)
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  100,
  'TEST: 5K Steps (7 Days)',
  'Walk at least 5,000 steps every day for 7 days. Accepts Apple Health, Garmin, Fitbit, or Google Fit data.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'apple_health.steps@1',
  '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
  jsonb_build_object(
    'templateId', 'steps_daily',
    'rule', jsonb_build_object(
      'challengeType', 'steps',
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone', 'UTC'
      ),
      'dailyTarget', jsonb_build_object(
        'consecutiveDays', 7,
        'conditions', jsonb_build_array(
          jsonb_build_object('metric', 'steps_count', 'op', '>=', 'value', 5000)
        )
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'apple_health.steps@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'steps_daily',
      'rule', jsonb_build_object(
        'challengeType', 'steps',
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timezone', 'UTC'
        ),
        'dailyTarget', jsonb_build_object(
          'consecutiveDays', 7,
          'conditions', jsonb_build_array(
            jsonb_build_object('metric', 'steps_count', 'op', '>=', 'value', 5000)
          )
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '8 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '0.01',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'fitness',
    'tags', jsonb_build_array('aivm', 'steps', 'test')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- TEST-101: Threshold fitness — Running distance (Strava)
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  101,
  'TEST: Run 5K in 2 Weeks',
  'Run at least 5 km total within 14 days. Upload Strava or Garmin data.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'strava.distance_in_window@1',
  '0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e',
  jsonb_build_object(
    'templateId', 'running_window',
    'rule', jsonb_build_object(
      'challengeType', 'run',
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone', 'UTC'
      ),
      'conditions', jsonb_build_array(
        jsonb_build_object('metric', 'distance_km', 'op', '>=', 'value', 5)
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'strava.distance_in_window@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'running_window',
      'rule', jsonb_build_object(
        'challengeType', 'run',
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timezone', 'UTC'
        ),
        'conditions', jsonb_build_array(
          jsonb_build_object('metric', 'distance_km', 'op', '>=', 'value', 5)
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '15 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '0.01',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'fitness',
    'tags', jsonb_build_array('aivm', 'running', 'test')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- TEST-102: Threshold gaming — Dota 2 wins
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  102,
  'TEST: Win 2 Dota 2 Matches',
  'Win at least 2 Dota 2 matches within the challenge window. Link your Steam account.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'dota.private_match_1v1@1',
  '0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def',
  jsonb_build_object(
    'templateId', 'dota_private_1v1',
    'rule', jsonb_build_object(
      'minWins', 2,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'dota.private_match_1v1@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'dota_private_1v1',
      'rule', jsonb_build_object(
        'minWins', 2,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '8 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '0.005',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'gaming',
    'game', 'dota',
    'tags', jsonb_build_array('aivm', 'dota', 'test')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- TEST-103: Competitive fitness — Steps competition (top 1)
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  103,
  'TEST: Steps Competition (Most Wins)',
  'Competitive: the participant with the most total steps wins the pool. Upload fitness data before the deadline.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'apple_health.steps@1',
  '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
  jsonb_build_object(
    'templateId', 'steps_competitive',
    'rule', jsonb_build_object(
      'challengeType', 'steps',
      'mode', 'competitive',
      'competitiveMetric', 'steps_count',
      'topN', 1,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone', 'UTC'
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'apple_health.steps@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'steps_competitive',
      'rule', jsonb_build_object(
        'challengeType', 'steps',
        'mode', 'competitive',
        'competitiveMetric', 'steps_count',
        'topN', 1,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timezone', 'UTC'
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '8 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '0.05',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'fitness',
    'mode', 'competitive',
    'tags', jsonb_build_array('aivm', 'competitive', 'steps', 'test')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- TEST-104: Competitive gaming — Dota kills (top 3)
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  104,
  'TEST: Dota Kill Competition (Top 3)',
  'Competitive: top 3 players with the most kills in Dota 2 matches win. Ranked matches only.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'dota.hero_kills_window@1',
  '0x0de4617204f86e47e89b88696ce2d323fa053589dce9152a523741429a83ddb1',
  jsonb_build_object(
    'templateId', 'dota_kills_competitive',
    'rule', jsonb_build_object(
      'mode', 'competitive',
      'competitiveMetric', 'kills',
      'topN', 3,
      'rankedOnly', true,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'dota.hero_kills_window@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0x0de4617204f86e47e89b88696ce2d323fa053589dce9152a523741429a83ddb1',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'dota_kills_competitive',
      'rule', jsonb_build_object(
        'mode', 'competitive',
        'competitiveMetric', 'kills',
        'topN', 3,
        'rankedOnly', true,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '15 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '0.02',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'gaming',
    'game', 'dota',
    'mode', 'competitive',
    'tags', jsonb_build_array('aivm', 'competitive', 'dota', 'test')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- BATCH 2: Client-Attractive Demo Challenges
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- DEMO-110: "March Madness Steps" — engaging 10K daily steps challenge
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  110,
  '10K Daily Steps Challenge',
  'Can you hit 10,000 steps every single day for a week? Connect your fitness tracker and prove it. No excuses, no rest days.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'apple_health.steps@1',
  '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
  jsonb_build_object(
    'templateId', 'steps_daily',
    'rule', jsonb_build_object(
      'challengeType', 'steps',
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone', 'UTC'
      ),
      'dailyTarget', jsonb_build_object(
        'consecutiveDays', 7,
        'conditions', jsonb_build_array(
          jsonb_build_object('metric', 'steps_count', 'op', '>=', 'value', 10000)
        )
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'apple_health.steps@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'steps_daily',
      'rule', jsonb_build_object(
        'challengeType', 'steps',
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timezone', 'UTC'
        ),
        'dailyTarget', jsonb_build_object(
          'consecutiveDays', 7,
          'conditions', jsonb_build_array(
            jsonb_build_object('metric', 'steps_count', 'op', '>=', 'value', 10000)
          )
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '8 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '1',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'fitness',
    'tags', jsonb_build_array('aivm', 'steps', 'daily', 'featured')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- DEMO-111: "Half Marathon Month" — run 21 km in 30 days
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  111,
  'Half Marathon Month',
  'Run a total of 21.1 km over the next 30 days. Split it however you want — one long run or many short ones. Strava or Garmin data accepted.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'strava.distance_in_window@1',
  '0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e',
  jsonb_build_object(
    'templateId', 'running_window',
    'rule', jsonb_build_object(
      'challengeType', 'run',
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone', 'UTC'
      ),
      'conditions', jsonb_build_array(
        jsonb_build_object('metric', 'distance_km', 'op', '>=', 'value', 21.1)
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'strava.distance_in_window@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'running_window',
      'rule', jsonb_build_object(
        'challengeType', 'run',
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timezone', 'UTC'
        ),
        'conditions', jsonb_build_array(
          jsonb_build_object('metric', 'distance_km', 'op', '>=', 'value', 21.1)
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '31 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '2',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'fitness',
    'tags', jsonb_build_array('aivm', 'running', 'endurance', 'featured')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- DEMO-112: "Step King" — competitive steps, winner takes all
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  112,
  'Step King: Most Steps Wins',
  'Who can walk the most in 7 days? The person with the highest step count takes the entire prize pool. Connect any fitness tracker and walk your heart out.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'apple_health.steps@1',
  '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
  jsonb_build_object(
    'templateId', 'steps_competitive',
    'rule', jsonb_build_object(
      'challengeType', 'steps',
      'mode', 'competitive',
      'competitiveMetric', 'steps_count',
      'topN', 1,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone', 'UTC'
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'apple_health.steps@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'steps_competitive',
      'rule', jsonb_build_object(
        'challengeType', 'steps',
        'mode', 'competitive',
        'competitiveMetric', 'steps_count',
        'topN', 1,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timezone', 'UTC'
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '8 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '5',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'fitness',
    'mode', 'competitive',
    'tags', jsonb_build_array('aivm', 'competitive', 'steps', 'featured')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- DEMO-113: "Dota Domination" — 5 win challenge
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  113,
  'Dota Domination: Win 5 Matches',
  'Prove your skill — win 5 Dota 2 matches within 2 weeks. Any game mode counts. Link your Steam account to verify.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'dota.private_match_1v1@1',
  '0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def',
  jsonb_build_object(
    'templateId', 'dota_private_1v1',
    'rule', jsonb_build_object(
      'minWins', 5,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'dota.private_match_1v1@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'dota_private_1v1',
      'rule', jsonb_build_object(
        'minWins', 5,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '15 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '1',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'gaming',
    'game', 'dota',
    'tags', jsonb_build_array('aivm', 'dota', 'wins', 'featured')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- DEMO-114: "LoL Ranked Grind" — win rate challenge
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  114,
  'LoL Ranked Grind: Win 10 of 20',
  'Play 20 ranked League of Legends matches and win at least 10. Put your rank where your mouth is.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'lol.winrate_next_n@1',
  '0x6a68a575fa50ebbc7c0404ebe2078f7a79cfa95b4c2efd9c869b0744137456c3',
  jsonb_build_object(
    'templateId', 'lol_winrate_next_n',
    'rule', jsonb_build_object(
      'minWins', 10,
      'rankedOnly', true,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'lol.winrate_next_n@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0x6a68a575fa50ebbc7c0404ebe2078f7a79cfa95b4c2efd9c869b0744137456c3',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'lol_winrate_next_n',
      'rule', jsonb_build_object(
        'minWins', 10,
        'rankedOnly', true,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '15 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '1',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'gaming',
    'game', 'lol',
    'tags', jsonb_build_array('aivm', 'lol', 'ranked', 'featured')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- DEMO-115: "CS2 FACEIT Warrior" — win 5 FACEIT matches
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  115,
  'CS2 FACEIT Warrior: 5 Wins',
  'Win 5 FACEIT matches in Counter-Strike 2 within 2 weeks. Valve matchmaking does not count — FACEIT only.',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'cs2.faceit_wins@1',
  '0x68897197aeecd201ed61384bb4b1b07b1e14d4c3ac57ed33ebc0dd528ed551f4',
  jsonb_build_object(
    'templateId', 'cs2_faceit_wins',
    'rule', jsonb_build_object(
      'minWins', 5,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'cs2.faceit_wins@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0x68897197aeecd201ed61384bb4b1b07b1e14d4c3ac57ed33ebc0dd528ed551f4',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'cs2_faceit_wins',
      'rule', jsonb_build_object(
        'minWins', 5,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '15 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '1',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'gaming',
    'game', 'cs',
    'tags', jsonb_build_array('aivm', 'cs2', 'faceit', 'featured')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- DEMO-116: "Distance Showdown" — competitive running (top 2)
INSERT INTO public.challenges (
  id, title, description, subject, model_id, model_hash,
  params, proof, timeline, funds, options, status,
  created_at, updated_at
) VALUES (
  116,
  'Distance Showdown: Top 2 Runners Win',
  'Competitive: the two runners who cover the most total distance in 14 days split the prize pool. Run as much as you can!',
  '0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217',
  'strava.distance_in_window@1',
  '0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e',
  jsonb_build_object(
    'templateId', 'distance_competitive',
    'rule', jsonb_build_object(
      'challengeType', 'run',
      'mode', 'competitive',
      'competitiveMetric', 'distance_km',
      'topN', 2,
      'period', jsonb_build_object(
        'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timezone', 'UTC'
      )
    )
  ),
  jsonb_build_object(
    'kind', 'aivm',
    'backend', 'lightchain_poi',
    'modelId', 'strava.distance_in_window@1',
    'verifier', '0x44c750aA01Ec2465CB3E7354EF1c16cc83D45123',
    'paramsHash', '0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e',
    'benchmarkHash', '0x0000000000000000000000000000000000000000000000000000000000000000',
    'params', jsonb_build_object(
      'templateId', 'distance_competitive',
      'rule', jsonb_build_object(
        'challengeType', 'run',
        'mode', 'competitive',
        'competitiveMetric', 'distance_km',
        'topN', 2,
        'period', jsonb_build_object(
          'start', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'timezone', 'UTC'
        )
      )
    )
  ),
  jsonb_build_object(
    'startsAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'endsAt',   to_char(now() + interval '14 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proofDeadline', to_char(now() + interval '15 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ),
  jsonb_build_object(
    'stake', '3',
    'currency', jsonb_build_object('type', 'NATIVE', 'symbol', 'LCAI')
  ),
  jsonb_build_object(
    'category', 'fitness',
    'mode', 'competitive',
    'tags', jsonb_build_array('aivm', 'competitive', 'running', 'featured')
  ),
  'Active',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

COMMIT;
