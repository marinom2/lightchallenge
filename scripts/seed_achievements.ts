/**
 * Seed test achievement data for the Achievements page.
 * Usage: npx tsx scripts/seed_achievements.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

const WALLET = "0x8176735dE44c6a6e64C9153F2448B15F2F53cB31";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // 1. Check existing challenges
  const { rows: challenges } = await pool.query(
    "SELECT id, title, status FROM challenges ORDER BY id DESC LIMIT 20"
  );
  console.log("Existing challenges:", challenges);

  // 2. Check existing achievements
  const { rows: existingAch } = await pool.query(
    "SELECT * FROM achievement_mints WHERE lower(recipient) = lower($1)",
    [WALLET]
  );
  console.log("Existing achievements for wallet:", existingAch.length);

  if (existingAch.length > 0) {
    console.log("Achievements already seeded. Skipping insert.");
  } else {
    // Pick challenge IDs from what exists
    const challengeIds = challenges.map((c: any) => c.id).slice(0, 6);
    if (challengeIds.length === 0) {
      console.log("No challenges found. Creating some test ones.");
      // Insert some test challenges
      for (let i = 0; i < 6; i++) {
        await pool.query(
          `INSERT INTO challenges (title, description, status, creator, stake_amount, currency, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() - interval '${i * 5} days')
           RETURNING id`,
          [
            ["10K Steps Daily", "Dota 2 Win Streak", "Marathon Prep", "CS2 Headshot Challenge", "Cycling Century", "Swimming Sprint"][i],
            ["Walk 10,000 steps every day for 7 days", "Win 5 Dota 2 ranked matches", "Run 42km in under 4 hours", "Get 15 headshots in CS2", "Ride 100 miles in a single day", "Swim 1km in under 20 minutes"][i],
            "Finalized",
            WALLET,
            "500000000000000000",
            "native",
          ]
        );
      }
      const { rows: newChallenges } = await pool.query(
        "SELECT id FROM challenges ORDER BY id DESC LIMIT 6"
      );
      challengeIds.length = 0;
      challengeIds.push(...newChallenges.map((c: any) => c.id));
    }

    // Find max token_id
    const { rows: maxRow } = await pool.query(
      "SELECT COALESCE(MAX(token_id), 0) as max_id FROM achievement_mints"
    );
    let tokenId = Number(maxRow[0].max_id) + 1;

    // Insert achievement mints
    const achievements = [
      { challengeId: challengeIds[0], type: "victory", daysAgo: 2, title: "10K Steps Daily" },
      { challengeId: challengeIds[1], type: "completion", daysAgo: 5, title: "Dota 2 Win Streak" },
      { challengeId: challengeIds[2], type: "completion", daysAgo: 8, title: "Marathon Prep" },
      { challengeId: challengeIds[3], type: "victory", daysAgo: 12, title: "CS2 Headshot Challenge" },
      { challengeId: challengeIds[4], type: "completion", daysAgo: 18, title: "Cycling Century" },
      { challengeId: challengeIds[5] || challengeIds[0], type: "victory", daysAgo: 25, title: "Swimming Sprint" },
    ];

    for (const a of achievements) {
      await pool.query(
        `INSERT INTO achievement_mints (token_id, challenge_id, recipient, achievement_type, tx_hash, minted_at)
         VALUES ($1, $2, $3, $4, $5, now() - interval '${a.daysAgo} days')`,
        [
          tokenId++,
          a.challengeId,
          WALLET,
          a.type,
          `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
        ]
      );
      console.log(`  Inserted ${a.type} for challenge ${a.challengeId} (${a.title})`);
    }
  }

  // 3. Upsert reputation
  // 3 victories (150 each) + 3 completions (50 each) = 600 pts = Level 3 (Competitor)
  await pool.query(
    `INSERT INTO reputation (subject, points, level, completions, victories, updated_at)
     VALUES (lower($1), 600, 3, 3, 3, now())
     ON CONFLICT (subject) DO UPDATE
     SET points = 600, level = 3, completions = 3, victories = 3, updated_at = now()`,
    [WALLET]
  );
  console.log("Reputation upserted: 600 pts, Level 3 (Competitor), 3 completions, 3 victories");

  // Verify
  const { rows: finalAch } = await pool.query(
    "SELECT token_id, challenge_id, achievement_type, minted_at FROM achievement_mints WHERE lower(recipient) = lower($1) ORDER BY minted_at DESC",
    [WALLET]
  );
  console.log("\nFinal achievements:", finalAch);

  const { rows: finalRep } = await pool.query(
    "SELECT * FROM reputation WHERE subject = lower($1)",
    [WALLET]
  );
  console.log("Final reputation:", finalRep);

  await pool.end();
  console.log("\nDone! Visit /me/achievements to see the test data.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
