/**
 * Creates a test tournament for Discord bot testing.
 * Usage: npx tsx scripts/seedDiscordTest.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../webapp/.env.local` });

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Clean up previous test tournament
    await client.query(`DELETE FROM public.competitions WHERE title = $1`, [
      "Discord Bot Test Tournament",
    ]);

    const {
      rows: [comp],
    } = await client.query(
      `INSERT INTO public.competitions (title, description, type, status, category, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        "Discord Bot Test Tournament",
        "4-player single elimination to test Discord notifications",
        "bracket",
        "active",
        "gaming",
        JSON.stringify({ format: "single_elim", game: "Dota 2" }),
      ]
    );
    const compId = comp.id;

    const w = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444",
    ];

    for (let i = 0; i < w.length; i++) {
      await client.query(
        `INSERT INTO public.competition_registrations (competition_id, wallet, seed)
         VALUES ($1, $2, $3)`,
        [compId, w[i], i + 1]
      );
    }

    const {
      rows: [m1],
    } = await client.query(
      `INSERT INTO public.bracket_matches (competition_id, round, match_number, bracket_type, participant_a, participant_b, status)
       VALUES ($1, 1, 1, 'winners', $2, $3, 'pending') RETURNING id`,
      [compId, w[0], w[1]]
    );

    const {
      rows: [m2],
    } = await client.query(
      `INSERT INTO public.bracket_matches (competition_id, round, match_number, bracket_type, participant_a, participant_b, status)
       VALUES ($1, 1, 2, 'winners', $2, $3, 'pending') RETURNING id`,
      [compId, w[2], w[3]]
    );

    const {
      rows: [m3],
    } = await client.query(
      `INSERT INTO public.bracket_matches (competition_id, round, match_number, bracket_type, participant_a, participant_b, status)
       VALUES ($1, 2, 1, 'winners', NULL, NULL, 'pending') RETURNING id`,
      [compId]
    );

    await client.query("COMMIT");

    console.log("=== TEST TOURNAMENT CREATED ===");
    console.log(`Competition ID: ${compId}`);
    console.log("");
    console.log("Bracket:");
    console.log(`  SF1 (${m1.id}): 0x1111...1111 vs 0x2222...2222`);
    console.log(`  SF2 (${m2.id}): 0x3333...3333 vs 0x4444...4444`);
    console.log(`  Final (${m3.id}): TBD vs TBD`);
    console.log("");
    console.log("=== DISCORD SLASH COMMANDS ===");
    console.log(`/link-channel ${compId}`);
    console.log(`/bracket ${compId}`);
    console.log(`/standings ${compId}`);
    console.log("");
    console.log("=== WEBHOOK CURL TESTS (run while bot is up) ===");
    console.log("");

    const curls = [
      {
        label: "1. Competition started",
        payload: { type: "competition.started", competition_id: compId },
      },
      {
        label: "2. Match result (SF1 — Player 1 wins 2-1)",
        payload: {
          type: "match.completed",
          competition_id: compId,
          match_id: m1.id,
          winner: w[0],
          score_a: 2,
          score_b: 1,
        },
      },
      {
        label: "3. Upcoming match (SF2)",
        payload: {
          type: "match.upcoming",
          competition_id: compId,
          match: {
            participant_a: w[2],
            participant_b: w[3],
            round: 1,
            match_number: 2,
            bracket_type: "winners",
            scheduled_at: "2026-03-24T18:00:00Z",
          },
        },
      },
      {
        label: "4. Competition completed",
        payload: {
          type: "competition.completed",
          competition_id: compId,
          winner: w[0],
        },
      },
    ];

    for (const c of curls) {
      console.log(`# ${c.label}:`);
      console.log(
        `curl -X POST http://localhost:3200/ -H "Content-Type: application/json" -d '${JSON.stringify(c.payload)}'`
      );
      console.log("");
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
