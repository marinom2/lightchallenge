/**
 * scripts/seed_lifecycle_tests.ts
 *
 * Seeds test challenges at every lifecycle stage so both the webapp and iOS
 * app can be verified against realistic data.
 *
 * Usage:
 *   npx tsx scripts/seed_lifecycle_tests.ts            # seed all test data
 *   npx tsx scripts/seed_lifecycle_tests.ts --clean     # remove all test data
 *
 * Test challenge IDs: 9001-9007 (high numbers to avoid collisions with real data).
 * All data is idempotent — safe to run multiple times.
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../webapp/.env.local") });

import { getPool, closePool } from "../offchain/db/pool";

// ─── Configuration ───────────────────────────────────────────────────────────

const TEST_WALLET =
  process.env.TEST_WALLET ?? "0x95a4ce3c93cfb2c9757edcb0ebc22ca3b66b4d22";

/** Base ID for test challenges. IDs will be 9001..9007. */
const BASE_ID = 9001;

const HOUR = 3600;
const DAY = 86400;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function toISO(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString();
}

function fakeTxHash(seed: number): string {
  return (
    "0x" +
    Array.from({ length: 64 }, (_, i) =>
      ((seed * 7 + i * 13) % 16).toString(16)
    ).join("")
  );
}

function fakeEvidenceHash(seed: number): string {
  return (
    "0x" +
    Array.from({ length: 64 }, (_, i) =>
      ((seed * 11 + i * 17) % 16).toString(16)
    ).join("")
  );
}

// ─── Scenario Definitions ────────────────────────────────────────────────────

type Scenario = {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  chainOutcome: number | null;
  timeline: {
    joinClosesAt: string;
    startsAt: string;
    endsAt: string;
    proofDeadline: string;
  };
  addParticipant: boolean;
  addEvidence: boolean;
  addVerdict: boolean;
  verdictPass?: boolean;
  verdictReasons?: string[];
};

function buildScenarios(): Scenario[] {
  const now = nowSec();

  return [
    // 1. Join Window Open — joinClosesAt in future, startsAt in future
    {
      id: BASE_ID,
      title: "[TEST] Join Window Open — 10K Steps Daily",
      description:
        "Walk 10,000 steps every day for 7 days. Join window is still open. Challenge has not started yet.",
      category: "fitness",
      status: "Active",
      chainOutcome: null,
      timeline: {
        joinClosesAt: toISO(now + 2 * DAY),
        startsAt: toISO(now + 3 * DAY),
        endsAt: toISO(now + 10 * DAY),
        proofDeadline: toISO(now + 11 * DAY),
      },
      addParticipant: false,
      addEvidence: false,
      addVerdict: false,
    },

    // 2. Challenge In Progress — started, not ended yet
    {
      id: BASE_ID + 1,
      title: "[TEST] In Progress — Marathon Training",
      description:
        "Run a total of 42km over 14 days. Challenge is underway; participants should be completing activities.",
      category: "fitness",
      status: "Active",
      chainOutcome: null,
      timeline: {
        joinClosesAt: toISO(now - 2 * DAY),
        startsAt: toISO(now - 1 * DAY),
        endsAt: toISO(now + 13 * DAY),
        proofDeadline: toISO(now + 14 * DAY),
      },
      addParticipant: true,
      addEvidence: false,
      addVerdict: false,
    },

    // 3. Proof Window Open — challenge ended, proof deadline in future
    {
      id: BASE_ID + 2,
      title: "[TEST] Proof Window Open — Cycling Century",
      description:
        "Ride 100 miles in a single week. Challenge has ended; proof window is open for auto-proof submission.",
      category: "fitness",
      status: "Active",
      chainOutcome: null,
      timeline: {
        joinClosesAt: toISO(now - 10 * DAY),
        startsAt: toISO(now - 8 * DAY),
        endsAt: toISO(now - 1 * DAY),
        proofDeadline: toISO(now + 2 * DAY),
      },
      addParticipant: true,
      addEvidence: false,
      addVerdict: false,
    },

    // 4. Proof Deadline Passed — both ended and deadline passed, no evidence
    {
      id: BASE_ID + 3,
      title: "[TEST] Deadline Passed — Swimming Sprint",
      description:
        "Swim 1km in under 20 minutes. Both the challenge and proof deadline have passed with no evidence submitted.",
      category: "fitness",
      status: "Active",
      chainOutcome: null,
      timeline: {
        joinClosesAt: toISO(now - 20 * DAY),
        startsAt: toISO(now - 18 * DAY),
        endsAt: toISO(now - 5 * DAY),
        proofDeadline: toISO(now - 2 * DAY),
      },
      addParticipant: true,
      addEvidence: false,
      addVerdict: false,
    },

    // 5. Finalized — Passed (verdict pass=true, chain_outcome=1)
    {
      id: BASE_ID + 4,
      title: "[TEST] Finalized Passed — Dota 2 Win Streak",
      description:
        "Win 5 Dota 2 ranked matches in one weekend. Challenge completed successfully; reward is claimable.",
      category: "gaming",
      status: "Finalized",
      chainOutcome: 1, // Success
      timeline: {
        joinClosesAt: toISO(now - 30 * DAY),
        startsAt: toISO(now - 28 * DAY),
        endsAt: toISO(now - 14 * DAY),
        proofDeadline: toISO(now - 12 * DAY),
      },
      addParticipant: true,
      addEvidence: true,
      addVerdict: true,
      verdictPass: true,
      verdictReasons: [],
    },

    // 6. Finalized — Failed (verdict pass=false, chain_outcome=2)
    {
      id: BASE_ID + 5,
      title: "[TEST] Finalized Failed — CS2 Headshot Challenge",
      description:
        "Get 15 headshots in a single CS2 competitive match. Challenge failed; evidence did not meet threshold.",
      category: "gaming",
      status: "Finalized",
      chainOutcome: 2, // Fail
      timeline: {
        joinClosesAt: toISO(now - 25 * DAY),
        startsAt: toISO(now - 23 * DAY),
        endsAt: toISO(now - 10 * DAY),
        proofDeadline: toISO(now - 8 * DAY),
      },
      addParticipant: true,
      addEvidence: true,
      addVerdict: true,
      verdictPass: false,
      verdictReasons: [
        "Only 7 headshots recorded; threshold is 15",
        "Match duration below minimum (12 rounds required)",
      ],
    },

    // 7. Canceled — challenge was canceled by creator
    {
      id: BASE_ID + 6,
      title: "[TEST] Canceled — Yoga 30-Day Streak",
      description:
        "Complete 30 consecutive days of yoga sessions. Challenge was canceled before completion.",
      category: "fitness",
      status: "Canceled",
      chainOutcome: null,
      timeline: {
        joinClosesAt: toISO(now - 15 * DAY),
        startsAt: toISO(now - 13 * DAY),
        endsAt: toISO(now + 17 * DAY),
        proofDeadline: toISO(now + 18 * DAY),
      },
      addParticipant: true,
      addEvidence: false,
      addVerdict: false,
    },
  ];
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function seed() {
  const pool = getPool();
  const scenarios = buildScenarios();
  const wallet = TEST_WALLET.toLowerCase();

  console.log(`Seeding ${scenarios.length} lifecycle test challenges...`);
  console.log(`  Wallet: ${wallet}`);
  console.log(`  IDs:    ${scenarios.map((s) => s.id).join(", ")}\n`);

  for (const s of scenarios) {
    // ── Challenge row ──────────────────────────────────────────────────────
    await pool.query(
      `
      INSERT INTO public.challenges (
        id, title, description, subject, status, chain_outcome,
        timeline, funds, options, params, proof,
        model_id, model_hash, tx_hash,
        created_at, updated_at
      )
      VALUES (
        $1::bigint, $2, $3, $4, $5, $6::smallint,
        $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
        $12, $13, $14,
        now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        title          = EXCLUDED.title,
        description    = EXCLUDED.description,
        subject        = EXCLUDED.subject,
        status         = EXCLUDED.status,
        chain_outcome  = EXCLUDED.chain_outcome,
        timeline       = EXCLUDED.timeline,
        funds          = EXCLUDED.funds,
        options        = EXCLUDED.options,
        params         = EXCLUDED.params,
        proof          = EXCLUDED.proof,
        model_id       = EXCLUDED.model_id,
        model_hash     = EXCLUDED.model_hash,
        tx_hash        = EXCLUDED.tx_hash,
        updated_at     = now()
      `,
      [
        String(s.id),
        s.title,
        s.description,
        wallet,
        s.status,
        s.chainOutcome,
        JSON.stringify(s.timeline),
        JSON.stringify({
          stakeWei: "100000000000000000",
          budgetWei: "500000000000000000",
          currency: "native",
        }),
        JSON.stringify({
          category: s.category,
          tags: ["test", "lifecycle", s.category],
        }),
        JSON.stringify({
          rules: { type: s.category === "gaming" ? "gaming" : "fitness" },
        }),
        JSON.stringify({
          backend: "lightchain_poi",
          kind: "aivm",
          verificationStatus: s.status === "Finalized" ? "done" : null,
        }),
        "test-model-lifecycle",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        fakeTxHash(s.id),
      ]
    );
    console.log(`  [${s.id}] ${s.status.padEnd(10)} ${s.title}`);

    // ── Participant row ────────────────────────────────────────────────────
    if (s.addParticipant) {
      await pool.query(
        `
        INSERT INTO public.participants (
          challenge_id, subject, tx_hash, joined_at, source, created_at, updated_at
        )
        VALUES ($1::bigint, $2, $3, $4, $5, now(), now())
        ON CONFLICT (challenge_id, (lower(subject)))
        DO UPDATE SET
          tx_hash    = COALESCE(EXCLUDED.tx_hash, public.participants.tx_hash),
          joined_at  = COALESCE(EXCLUDED.joined_at, public.participants.joined_at),
          source     = EXCLUDED.source,
          updated_at = now()
        `,
        [
          String(s.id),
          wallet,
          fakeTxHash(s.id + 100),
          new Date(),
          "onchain_join",
        ]
      );
      console.log(`         + participant`);
    }

    // ── Evidence row ───────────────────────────────────────────────────────
    if (s.addEvidence) {
      const evidenceHash = fakeEvidenceHash(s.id);
      const provider = s.category === "gaming" ? "opendota" : "garmin";
      const sampleData =
        s.category === "gaming"
          ? [
              {
                match_id: 7800000000 + s.id,
                win: s.verdictPass,
                hero: "Anti-Mage",
                kills: s.verdictPass ? 12 : 3,
                deaths: s.verdictPass ? 4 : 11,
                assists: s.verdictPass ? 8 : 2,
                duration: 2400,
              },
            ]
          : [
              {
                date: toISO(nowSec() - 15 * DAY),
                steps: s.verdictPass ? 12500 : 4200,
                distance_km: s.verdictPass ? 9.5 : 3.1,
                active_minutes: s.verdictPass ? 85 : 25,
              },
            ];

      // Delete existing evidence for this (challenge, subject) to keep idempotent
      await pool.query(
        `
        DELETE FROM public.evidence
        WHERE challenge_id = $1::bigint
          AND lower(subject) = lower($2)
        `,
        [String(s.id), wallet]
      );

      await pool.query(
        `
        INSERT INTO public.evidence (
          challenge_id, subject, provider, data, evidence_hash, raw_ref,
          created_at, updated_at
        )
        VALUES ($1::bigint, $2, $3, $4::jsonb, $5, $6, now(), now())
        `,
        [
          String(s.id),
          wallet,
          provider,
          JSON.stringify(sampleData),
          evidenceHash,
          null,
        ]
      );
      console.log(`         + evidence (${provider})`);
    }

    // ── Verdict row ────────────────────────────────────────────────────────
    if (s.addVerdict) {
      const evidenceHash = fakeEvidenceHash(s.id);
      const evaluator = s.category === "gaming" ? "gaming_dota" : "fitness";

      await pool.query(
        `
        INSERT INTO public.verdicts (
          challenge_id, subject, pass, reasons, evidence_hash, evaluator,
          score, metadata,
          created_at, updated_at
        )
        VALUES (
          $1::bigint, $2, $3::boolean, $4::text[], $5, $6,
          $7::numeric, $8::jsonb,
          now(), now()
        )
        ON CONFLICT ON CONSTRAINT verdicts_challenge_subject_uq
        DO UPDATE SET
          pass          = EXCLUDED.pass,
          reasons       = EXCLUDED.reasons,
          evidence_hash = EXCLUDED.evidence_hash,
          evaluator     = EXCLUDED.evaluator,
          score         = EXCLUDED.score,
          metadata      = EXCLUDED.metadata,
          updated_at    = now()
        `,
        [
          String(s.id),
          wallet,
          s.verdictPass ?? false,
          s.verdictReasons ?? [],
          evidenceHash,
          evaluator,
          s.verdictPass ? 100 : 25,
          JSON.stringify({
            seed: true,
            scenario: s.verdictPass ? "passed" : "failed",
          }),
        ]
      );
      console.log(
        `         + verdict (pass=${s.verdictPass})`
      );
    }
  }

  console.log("\nDone. Seeded all lifecycle test challenges.");
}

// ─── Clean ───────────────────────────────────────────────────────────────────

async function clean() {
  const pool = getPool();
  const ids = Array.from({ length: 7 }, (_, i) => String(BASE_ID + i));

  console.log(`Cleaning test data for challenge IDs: ${ids.join(", ")}...\n`);

  // Delete in dependency order: verdicts, evidence, participants, challenges
  const verdicts = await pool.query(
    `DELETE FROM public.verdicts WHERE challenge_id = ANY($1::bigint[]) RETURNING challenge_id`,
    [ids]
  );
  console.log(`  Deleted ${verdicts.rowCount} verdict(s)`);

  const evidence = await pool.query(
    `DELETE FROM public.evidence WHERE challenge_id = ANY($1::bigint[]) RETURNING challenge_id`,
    [ids]
  );
  console.log(`  Deleted ${evidence.rowCount} evidence row(s)`);

  const participants = await pool.query(
    `DELETE FROM public.participants WHERE challenge_id = ANY($1::bigint[]) RETURNING challenge_id`,
    [ids]
  );
  console.log(`  Deleted ${participants.rowCount} participant(s)`);

  const challenges = await pool.query(
    `DELETE FROM public.challenges WHERE id = ANY($1::bigint[]) RETURNING id`,
    [ids]
  );
  console.log(`  Deleted ${challenges.rowCount} challenge(s)`);

  console.log("\nDone. All test lifecycle data removed.");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const isClean = process.argv.includes("--clean");

  try {
    if (isClean) {
      await clean();
    } else {
      await seed();
    }
  } finally {
    await closePool();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
