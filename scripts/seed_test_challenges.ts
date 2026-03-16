#!/usr/bin/env npx tsx
/**
 * scripts/seed_test_challenges.ts
 *
 * Seeds the database with test challenges, participants, evidence, verdicts,
 * achievement mints, reputation, and claims for both wallets.
 *
 * Wallets:
 *   - WALLET_A (0x95A4...A217) — creates challenges, wins some, loses some
 *   - WALLET_B (0x8176...cB31) — joins challenges, wins some, loses some
 *
 * Creates 10 challenges (IDs 1000–1009) with diverse fitness types:
 *   - 4 where WALLET_A wins, WALLET_B loses
 *   - 3 where WALLET_B wins, WALLET_A loses
 *   - 2 where both pass (community challenges)
 *   - 1 active (no verdict yet, evidence submitted) — shows as "pending"
 *
 * Also seeds:
 *   - achievement_mints for victories, completions, first_win, streaks
 *   - reputation rows computed from achievements
 *   - claim rows for completed challenges
 *
 * Safe to re-run: uses ON CONFLICT / upserts.
 *
 * Usage:
 *   npx tsx scripts/seed_test_challenges.ts
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../webapp/.env.local") });

import { getPool, closePool } from "../offchain/db/pool";

const WALLET_A = "0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217";
const WALLET_B = "0x8176735dE44c6a6e64C9153F2448B15F2F53cB31";

const BASE_ID = 1000;

interface ChallengeSpec {
  id: number;
  title: string;
  description: string;
  category: string; // fitness type keyword
  stakeWei: string;
  creator: string;
  status: "Active" | "Finalized";
  /** Verdict for wallet A: true=pass, false=fail, null=none */
  verdictA: boolean | null;
  /** Verdict for wallet B */
  verdictB: boolean | null;
  /** Days ago the challenge was created */
  daysAgo: number;
}

const challenges: ChallengeSpec[] = [
  // WALLET_A wins (4)
  {
    id: BASE_ID,
    title: "10K Steps Daily Challenge",
    description: "Walk at least 10,000 steps every day for a week",
    category: "walking",
    stakeWei: "500000000000000000", // 0.5 LCAI
    creator: WALLET_A,
    status: "Finalized",
    verdictA: true,
    verdictB: false,
    daysAgo: 30,
  },
  {
    id: BASE_ID + 1,
    title: "5K Morning Run",
    description: "Complete a 5K run before 9am",
    category: "running",
    stakeWei: "1000000000000000000", // 1 LCAI
    creator: WALLET_A,
    status: "Finalized",
    verdictA: true,
    verdictB: false,
    daysAgo: 25,
  },
  {
    id: BASE_ID + 2,
    title: "Century Ride Challenge",
    description: "Complete a 100km bike ride in a single session",
    category: "cycling",
    stakeWei: "2000000000000000000", // 2 LCAI
    creator: WALLET_B,
    status: "Finalized",
    verdictA: true,
    verdictB: false,
    daysAgo: 20,
  },
  {
    id: BASE_ID + 3,
    title: "Yoga Flexibility Sprint",
    description: "Complete 7 yoga sessions in 7 days",
    category: "yoga",
    stakeWei: "250000000000000000", // 0.25 LCAI
    creator: WALLET_A,
    status: "Finalized",
    verdictA: true,
    verdictB: false,
    daysAgo: 15,
  },

  // WALLET_B wins (3)
  {
    id: BASE_ID + 4,
    title: "50 Lap Swim Challenge",
    description: "Swim 50 laps in an Olympic pool",
    category: "swimming",
    stakeWei: "1500000000000000000", // 1.5 LCAI
    creator: WALLET_B,
    status: "Finalized",
    verdictA: false,
    verdictB: true,
    daysAgo: 12,
  },
  {
    id: BASE_ID + 5,
    title: "Strength Training Week",
    description: "Complete 5 strength training sessions with tracked weights",
    category: "strength",
    stakeWei: "750000000000000000", // 0.75 LCAI
    creator: WALLET_A,
    status: "Finalized",
    verdictA: false,
    verdictB: true,
    daysAgo: 10,
  },
  {
    id: BASE_ID + 6,
    title: "Marathon Prep 20K",
    description: "Run 20km in under 2 hours as marathon preparation",
    category: "running",
    stakeWei: "3000000000000000000", // 3 LCAI
    creator: WALLET_B,
    status: "Finalized",
    verdictA: false,
    verdictB: true,
    daysAgo: 7,
  },

  // Both pass (2)
  {
    id: BASE_ID + 7,
    title: "Community Walking Month",
    description: "Walk at least 5,000 steps every day for 30 days",
    category: "walking",
    stakeWei: "100000000000000000", // 0.1 LCAI
    creator: WALLET_A,
    status: "Finalized",
    verdictA: true,
    verdictB: true,
    daysAgo: 5,
  },
  {
    id: BASE_ID + 8,
    title: "Cycling Commute Week",
    description: "Bike to work every day this week (min 5km each way)",
    category: "cycling",
    stakeWei: "200000000000000000", // 0.2 LCAI
    creator: WALLET_B,
    status: "Finalized",
    verdictA: true,
    verdictB: true,
    daysAgo: 3,
  },

  // Active — evidence submitted, no verdict yet (1)
  {
    id: BASE_ID + 9,
    title: "Spring Running Challenge",
    description: "Run 50km total this week — track with Apple Watch or Strava",
    category: "running",
    stakeWei: "500000000000000000", // 0.5 LCAI
    creator: WALLET_A,
    status: "Active",
    verdictA: null,
    verdictB: null,
    daysAgo: 1,
  },
];

async function main() {
  const pool = getPool();

  console.log("=== Seeding test challenges ===\n");

  for (const c of challenges) {
    const createdAt = new Date(Date.now() - c.daysAgo * 86400000);
    const endAt = new Date(createdAt.getTime() + 7 * 86400000);
    const startTs = Math.floor(createdAt.getTime() / 1000);
    const endTs = Math.floor(endAt.getTime() / 1000);

    // 1. Upsert challenge
    await pool.query(
      `INSERT INTO public.challenges (id, title, description, subject, status, model_id, model_hash, params, proof, timeline, funds, options, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         params = EXCLUDED.params,
         timeline = EXCLUDED.timeline,
         funds = EXCLUDED.funds,
         options = EXCLUDED.options,
         updated_at = now()`,
      [
        c.id,
        c.title,
        c.description,
        c.creator.toLowerCase(),
        c.status,
        `lc-fitness-${c.category}`,
        "0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        JSON.stringify({
          rules: {
            period: "daily",
            metric: c.category === "walking" ? "steps" : c.category === "running" ? "distance" : "active_minutes",
            threshold: c.category === "walking" ? 10000 : c.category === "running" ? 5 : 30,
          },
        }),
        JSON.stringify({
          backend: "aivm_poi",
          verifier: "ChallengePayAivmPoiVerifier",
          modelHash: "0xabcd1234",
        }),
        JSON.stringify({
          startAt: startTs,
          endAt: endTs,
          deadline: endTs + 3600,
        }),
        JSON.stringify({
          stakeWei: c.stakeWei,
          budgetWei: (BigInt(c.stakeWei) * 2n).toString(),
          currency: "LCAI",
        }),
        JSON.stringify({
          category: "fitness",
          tags: [c.category, "test"],
        }),
        createdAt,
        new Date(),
      ],
    );
    console.log(`  [✓] Challenge ${c.id}: ${c.title} (${c.status})`);

    // 2. Upsert participants (both wallets join every challenge)
    for (const wallet of [WALLET_A, WALLET_B]) {
      await pool.query(
        `INSERT INTO public.participants (challenge_id, subject, source, joined_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (challenge_id, lower(subject)) DO NOTHING`,
        [c.id, wallet.toLowerCase(), "seed", createdAt],
      );
    }

    // 3. Insert evidence for both wallets
    for (const wallet of [WALLET_A, WALLET_B]) {
      const sampleData = JSON.stringify([
        {
          date: createdAt.toISOString().split("T")[0],
          steps: 12500,
          distance_km: 8.3,
          active_minutes: 45,
          source: "apple_health",
        },
      ]);
      await pool.query(
        `INSERT INTO public.evidence (challenge_id, subject, provider, data, evidence_hash)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT DO NOTHING`,
        [
          c.id,
          wallet.toLowerCase(),
          "apple_health",
          sampleData,
          `0x${Buffer.from(`${c.id}-${wallet}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
        ],
      );
    }

    // 4. Insert verdicts
    const verdicts: { wallet: string; pass: boolean | null }[] = [
      { wallet: WALLET_A, pass: c.verdictA },
      { wallet: WALLET_B, pass: c.verdictB },
    ];
    for (const v of verdicts) {
      if (v.pass === null) continue; // active challenge, no verdict
      await pool.query(
        `INSERT INTO public.verdicts (challenge_id, subject, pass, reasons, evidence_hash, evaluator, score, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (challenge_id, subject) DO UPDATE SET
           pass = EXCLUDED.pass,
           reasons = EXCLUDED.reasons,
           score = EXCLUDED.score,
           updated_at = now()`,
        [
          c.id,
          v.wallet.toLowerCase(),
          v.pass,
          v.pass
            ? ["All fitness criteria met", "Daily threshold exceeded"]
            : ["Insufficient activity data", "Below minimum threshold"],
          `0x${Buffer.from(`${c.id}-${v.wallet}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
          "fitnessEvaluator",
          v.pass ? 95 + Math.floor(Math.random() * 5) : 20 + Math.floor(Math.random() * 30),
          JSON.stringify({ seeded: true }),
        ],
      );
    }
  }

  // 5. Seed achievement mints
  console.log("\n=== Seeding achievements ===\n");

  // Use numeric token IDs: 900_000 + offset to avoid collision
  let nextTokenId = 900000;

  const achievementMints: {
    tokenId: number;
    challengeId: number;
    recipient: string;
    type: string;
  }[] = [];

  // For each finalized challenge, give completion to everyone who participated and victory to winners
  for (const c of challenges.filter((c) => c.status === "Finalized")) {
    if (c.verdictA === true) {
      achievementMints.push({
        tokenId: nextTokenId++,
        challengeId: c.id,
        recipient: WALLET_A,
        type: "victory",
      });
    }
    if (c.verdictA !== null) {
      achievementMints.push({
        tokenId: nextTokenId++,
        challengeId: c.id,
        recipient: WALLET_A,
        type: "completion",
      });
    }
    if (c.verdictB === true) {
      achievementMints.push({
        tokenId: nextTokenId++,
        challengeId: c.id,
        recipient: WALLET_B,
        type: "victory",
      });
    }
    if (c.verdictB !== null) {
      achievementMints.push({
        tokenId: nextTokenId++,
        challengeId: c.id,
        recipient: WALLET_B,
        type: "completion",
      });
    }
  }

  // Special achievements
  achievementMints.push(
    { tokenId: nextTokenId++, challengeId: BASE_ID, recipient: WALLET_A, type: "first_win" },
    { tokenId: nextTokenId++, challengeId: BASE_ID + 4, recipient: WALLET_B, type: "first_win" },
    { tokenId: nextTokenId++, challengeId: BASE_ID, recipient: WALLET_A, type: "early_adopter" },
    { tokenId: nextTokenId++, challengeId: BASE_ID, recipient: WALLET_B, type: "early_adopter" },
    { tokenId: nextTokenId++, challengeId: BASE_ID + 3, recipient: WALLET_A, type: "streak" },
    { tokenId: nextTokenId++, challengeId: BASE_ID + 2, recipient: WALLET_A, type: "explorer" },
    { tokenId: nextTokenId++, challengeId: BASE_ID + 6, recipient: WALLET_B, type: "explorer" },
  );

  for (const m of achievementMints) {
    await pool.query(
      `INSERT INTO public.achievement_mints (token_id, challenge_id, recipient, achievement_type, tx_hash, block_number, minted_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (token_id) DO NOTHING`,
      [
        m.tokenId,
        m.challengeId,
        m.recipient.toLowerCase(),
        m.type,
        `0x${m.tokenId.toString(16).padStart(64, "0")}`,
        100000 + m.challengeId,
      ],
    );
    console.log(`  [✓] Achievement: ${m.type} → ${m.recipient.slice(-6)} (challenge ${m.challengeId})`);
  }

  // 6. Recompute reputation
  console.log("\n=== Recomputing reputation ===\n");

  for (const wallet of [WALLET_A, WALLET_B]) {
    const addr = wallet.toLowerCase();
    const mints = await pool.query<{ achievement_type: string }>(
      `SELECT achievement_type FROM public.achievement_mints WHERE lower(recipient) = $1`,
      [addr],
    );

    let points = 0;
    let completions = 0;
    let victories = 0;

    const typePoints: Record<string, number> = {
      completion: 50,
      victory: 150,
      streak: 100,
      first_win: 75,
      participation: 25,
      top_scorer: 200,
      undefeated: 250,
      comeback: 125,
      speedrun: 150,
      social: 50,
      early_adopter: 100,
      veteran: 200,
      perfectionist: 300,
      explorer: 75,
    };

    for (const row of mints.rows) {
      points += typePoints[row.achievement_type] ?? 0;
      if (row.achievement_type === "completion") completions++;
      if (row.achievement_type === "victory") victories++;
    }

    const level =
      points >= 2000 ? 5 : points >= 800 ? 4 : points >= 300 ? 3 : points >= 100 ? 2 : 1;

    await pool.query(
      `INSERT INTO public.reputation (subject, points, level, completions, victories, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (subject) DO UPDATE SET
         points = EXCLUDED.points,
         level = EXCLUDED.level,
         completions = EXCLUDED.completions,
         victories = EXCLUDED.victories,
         updated_at = now()`,
      [addr, points, level, completions, victories],
    );

    console.log(
      `  [✓] ${wallet.slice(-6)}: ${points} pts, level ${level}, ${victories}W/${completions}C`,
    );
  }

  // 7. Seed claims (for finalized challenges where wallet won)
  console.log("\n=== Seeding claims ===\n");

  for (const c of challenges.filter((c) => c.status === "Finalized")) {
    // Winner gets stake back + reward
    const winnerRewardWei = (BigInt(c.stakeWei) * 3n / 2n).toString(); // 1.5x stake

    if (c.verdictA === true) {
      await pool.query(
        `INSERT INTO public.claims (challenge_id, subject, claim_type, amount_wei, tx_hash, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (challenge_id, lower(subject), claim_type) DO NOTHING`,
        [
          c.id,
          WALLET_A.toLowerCase(),
          "principal",
          winnerRewardWei,
          `0x${Buffer.from(`claim-a-${c.id}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
          "seed",
        ],
      );
      console.log(`  [✓] Claim: ${WALLET_A.slice(-6)} principal ${winnerRewardWei} wei (challenge ${c.id})`);
    }
    if (c.verdictB === true) {
      await pool.query(
        `INSERT INTO public.claims (challenge_id, subject, claim_type, amount_wei, tx_hash, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (challenge_id, lower(subject), claim_type) DO NOTHING`,
        [
          c.id,
          WALLET_B.toLowerCase(),
          "principal",
          winnerRewardWei,
          `0x${Buffer.from(`claim-b-${c.id}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
          "seed",
        ],
      );
      console.log(`  [✓] Claim: ${WALLET_B.slice(-6)} principal ${winnerRewardWei} wei (challenge ${c.id})`);
    }

    // Loser gets cashback (10% of stake)
    const cashbackWei = (BigInt(c.stakeWei) / 10n).toString();

    if (c.verdictA === false) {
      await pool.query(
        `INSERT INTO public.claims (challenge_id, subject, claim_type, amount_wei, tx_hash, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (challenge_id, lower(subject), claim_type) DO NOTHING`,
        [
          c.id,
          WALLET_A.toLowerCase(),
          "cashback",
          cashbackWei,
          `0x${Buffer.from(`cashback-a-${c.id}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
          "seed",
        ],
      );
    }
    if (c.verdictB === false) {
      await pool.query(
        `INSERT INTO public.claims (challenge_id, subject, claim_type, amount_wei, tx_hash, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (challenge_id, lower(subject), claim_type) DO NOTHING`,
        [
          c.id,
          WALLET_B.toLowerCase(),
          "cashback",
          cashbackWei,
          `0x${Buffer.from(`cashback-b-${c.id}`).toString("hex").slice(0, 64).padEnd(64, "0")}`,
          "seed",
        ],
      );
    }
  }

  // 8. Summary
  console.log("\n=== Seed complete ===\n");

  const challengeCount = await pool.query(
    `SELECT COUNT(*) as n FROM public.challenges WHERE id >= $1 AND id < $2`,
    [BASE_ID, BASE_ID + 100],
  );
  const verdictCount = await pool.query(
    `SELECT COUNT(*) as n FROM public.verdicts WHERE challenge_id >= $1 AND challenge_id < $2`,
    [BASE_ID, BASE_ID + 100],
  );
  const achCount = await pool.query(
    `SELECT COUNT(*) as n FROM public.achievement_mints WHERE token_id >= 900000 AND token_id < 999999`,
  );
  const claimCount = await pool.query(
    `SELECT COUNT(*) as n FROM public.claims WHERE challenge_id >= $1 AND challenge_id < $2`,
    [BASE_ID, BASE_ID + 100],
  );

  console.log(`  Challenges: ${challengeCount.rows[0].n}`);
  console.log(`  Verdicts:   ${verdictCount.rows[0].n}`);
  console.log(`  Achievements: ${achCount.rows[0].n}`);
  console.log(`  Claims:     ${claimCount.rows[0].n}`);

  // Verify stats for both wallets
  for (const wallet of [WALLET_A, WALLET_B]) {
    const stats = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN pass THEN 1 ELSE 0 END), 0) as wins,
         COALESCE(SUM(CASE WHEN NOT pass THEN 1 ELSE 0 END), 0) as losses
       FROM public.verdicts
       WHERE lower(subject) = lower($1)
         AND challenge_id >= $2 AND challenge_id < $3`,
      [wallet, BASE_ID, BASE_ID + 100],
    );
    const { wins, losses } = stats.rows[0];
    console.log(`  ${wallet.slice(-6)}: ${wins}W / ${losses}L`);
  }

  await closePool();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
