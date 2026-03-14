/**
 * offchain/workers/evidenceEvaluator.ts
 *
 * Evidence evaluator worker.
 *
 * Polls public.evidence for rows that do NOT yet have a corresponding row
 * in public.verdicts, runs the appropriate evaluator for each, and upserts
 * the verdict result.
 *
 * Each evaluation now receives the challenge's Rule / gaming config fetched
 * from public.challenges.proof.params (or .params fallback), so verdicts
 * reflect real challenge-specific thresholds rather than structural checks.
 *
 * Once a verdict row exists the challenge becomes eligible for the
 * dispatcher → worker → runner → orchestrator → indexer → chain pipeline.
 *
 * Production safety properties:
 *  - Unknown provider: writes pass:false verdict ("no evaluator registered")
 *    so the row exits the pending queue permanently — no hot-loop.
 *  - Per-row isolation: a crash in one evaluator never fails other rows.
 *  - In-process dedup: activeRows set prevents double-processing within a poll.
 *  - Idempotent: upsertVerdict uses ON CONFLICT DO UPDATE — safe to run
 *    multiple instances concurrently.
 *  - Overlap guard: loopRunning flag prevents concurrent poll iterations in
 *    the same process.
 *  - Null challenge config: getChallengeConfig returns null for challenge_id=0
 *    and unknown challenges; evaluators fall back to structural pass so rows
 *    always exit the pending queue.
 *
 * Environment variables:
 *   DATABASE_URL                  (required) Neon connection string
 *   EVIDENCE_EVALUATOR_POLL_MS    (default 15000)  ms between poll cycles
 *   EVIDENCE_EVALUATOR_BATCH      (default 50)     rows per poll
 *
 * Usage:
 *   npx tsx offchain/workers/evidenceEvaluator.ts
 */

import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { sslConfig } from "../db/sslConfig";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("[evidenceEvaluator] DATABASE_URL is not set");
}

const POLL_MS = Number(process.env.EVIDENCE_EVALUATOR_POLL_MS || 15000);
const BATCH   = Number(process.env.EVIDENCE_EVALUATOR_BATCH   || 50);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 5,
});

// ─── Imports (after dotenv / pool) ───────────────────────────────────────────

import { getEvaluator } from "../evaluators/index";
import { upsertVerdict } from "../db/verdicts";
import { getChallengeConfig } from "../db/challenges";
import type { EvidenceRow } from "../db/evidence";

// ─── Pending evidence query ───────────────────────────────────────────────────

/**
 * Fetch evidence rows that have no corresponding verdict yet.
 *
 * LEFT JOIN on (challenge_id, lower(subject)) mirrors the dispatcher's gate
 * query so that exactly the rows the dispatcher would care about are processed.
 *
 * challenge_id = 0 rows come from intake calls with no real challenge ID
 * (e.g. UI previews).  We still evaluate them so they exit the queue;
 * the dispatcher will never pick them up since no challenge has id = 0.
 */
async function fetchPendingEvidence(): Promise<EvidenceRow[]> {
  const res = await pool.query<EvidenceRow>(
    `
    SELECT  e.*
    FROM    public.evidence e
    LEFT    JOIN public.verdicts v
              ON  v.challenge_id = e.challenge_id
             AND  lower(v.subject) = lower(e.subject)
    WHERE   v.id IS NULL
    ORDER   BY e.created_at ASC
    LIMIT   $1
    `,
    [BATCH],
  );
  return res.rows;
}

// ─── Per-row evaluation ───────────────────────────────────────────────────────

/** Keys of rows being evaluated in this poll to prevent double-evaluation. */
const activeRows = new Set<string>();

/**
 * Evaluate a single evidence row and write the verdict.
 *
 * Guarantees:
 *  - Never throws — all errors are caught and written as pass:false verdicts
 *    so the row exits the pending queue regardless of outcome.
 *  - Skips rows already being processed in this poll (activeRows guard).
 */
async function evaluateRow(row: EvidenceRow): Promise<void> {
  const key = `${row.challenge_id}:${String(row.subject).toLowerCase()}`;
  if (activeRows.has(key)) return;
  activeRows.add(key);

  try {
    const provider = String(row.provider || "").toLowerCase();
    const evaluator = getEvaluator(provider);

    // ── Unknown provider: write a permanent fail verdict so the row exits ──
    if (!evaluator) {
      const reason = `No evaluator registered for provider "${provider}"`;
      console.warn("[evidenceEvaluator] SKIP", reason, "— evidence id", row.id);

      await upsertVerdict(
        {
          challengeId:  row.challenge_id,
          subject:      row.subject,
          pass:         false,
          reasons:      [reason],
          evidenceHash: String(row.evidence_hash ?? ""),
          evaluator:    "unknown:no-evaluator",
        },
        pool,
      );
      return;
    }

    // ── Fetch challenge-specific rule config ───────────────────────────────
    let config = null;
    try {
      config = await getChallengeConfig(row.challenge_id, pool);
    } catch (cfgErr: any) {
      // Non-fatal: evaluator will use structural-pass fallback
      console.warn(
        "[evidenceEvaluator] could not load challenge config for",
        row.challenge_id, "—", cfgErr?.message ?? cfgErr,
        "— falling back to structural pass",
      );
    }

    // ── Run the evaluator (catch any internal throw) ───────────────────────
    let result;
    try {
      result = await evaluator.evaluate(row, config);
    } catch (evalErr: any) {
      const msg = evalErr?.message ?? String(evalErr);
      console.error(
        "[evidenceEvaluator] evaluator threw for evidence id", row.id, ":", msg,
      );
      result = {
        verdict: false,
        reasons: [`Evaluator internal error: ${msg}`],
      };
    }

    // Stable evaluator identifier: first provider + phase tag
    const evaluatorName = `${evaluator.providers[0]}:phase8`;

    await upsertVerdict(
      {
        challengeId:  row.challenge_id,
        subject:      row.subject,
        pass:         result.verdict,
        reasons:      result.reasons,
        evidenceHash: String(row.evidence_hash ?? ""),
        evaluator:    evaluatorName,
        score:        result.score ?? null,
        metadata:     result.metadata ?? null,
      },
      pool,
    );

    const status = result.verdict ? "PASS" : "FAIL";
    const detail = result.verdict ? "" : ` — ${result.reasons.join("; ")}`;
    const configNote = config
      ? `challenge=${row.challenge_id}`
      : `challenge=${row.challenge_id}(no-rule)`;
    console.log(
      `[evidenceEvaluator] ${status}`,
      configNote,
      `subject=${row.subject}`,
      `provider=${provider}${detail}`,
    );
  } catch (outerErr: any) {
    // Last-resort catch: verdict write itself failed.  Log and move on;
    // the row will be retried on the next poll.
    console.error(
      "[evidenceEvaluator] failed to write verdict for evidence id", row.id,
      ":", outerErr?.message ?? outerErr,
    );
  } finally {
    activeRows.delete(key);
  }
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

let loopRunning = false;
let timer: NodeJS.Timeout | null = null;

async function runEvaluatorOnce(): Promise<void> {
  if (loopRunning) {
    // Previous poll is still running (slow DB or large batch).  Skip tick.
    return;
  }
  loopRunning = true;

  try {
    const rows = await fetchPendingEvidence();

    if (!rows.length) {
      // Suppress repetitive "no pending evidence" noise after the first few ticks.
      return;
    }

    console.log("[evidenceEvaluator] processing", rows.length, "pending row(s)");

    // Evaluate each row concurrently.  Per-row errors are isolated inside
    // evaluateRow() — a failed row never blocks others.
    await Promise.all(rows.map((row) => evaluateRow(row)));

    console.log("[evidenceEvaluator] poll complete");
  } catch (err) {
    console.error("[evidenceEvaluator] poll error:", err);
  } finally {
    loopRunning = false;
  }
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────

async function shutdown(code: number): Promise<never> {
  try {
    if (timer) clearInterval(timer);
    console.log("[evidenceEvaluator] shutting down…");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

process.on("SIGINT",  () => { void shutdown(0); });
process.on("SIGTERM", () => { void shutdown(0); });

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[evidenceEvaluator] started");
  console.log("[evidenceEvaluator] poll_ms =", POLL_MS);
  console.log("[evidenceEvaluator] batch   =", BATCH);

  // Run immediately on start, then on interval.
  await runEvaluatorOnce();

  timer = setInterval(() => {
    void runEvaluatorOnce();
  }, POLL_MS);
}

main().catch(async (err) => {
  console.error("[evidenceEvaluator] fatal:", err);
  await shutdown(1);
});
