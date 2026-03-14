/**
 * scripts/ops/cancelTerminalJobs.ts
 *
 * One-time and idempotent cleanup: cancels aivm_jobs rows stuck in
 * queued/failed/processing for challenges already in a terminal state
 * (Finalized, Rejected, Canceled).
 *
 * These jobs will never run — the challenge is over. This script corrects
 * existing stale rows and is safe to re-run at any time.
 *
 * The challengeDispatcher also runs this logic every poll cycle going forward,
 * so this script is only needed for pre-existing stale rows.
 *
 * Usage:
 *   npx tsx scripts/ops/cancelTerminalJobs.ts
 */
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { sslConfig } from "../../offchain/db/sslConfig";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const DATABASE_URL = process.env.DATABASE_URL as string;
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

const pool = new Pool({ connectionString: DATABASE_URL, ssl: sslConfig() });

async function main() {
  console.log("[cancelTerminalJobs] scanning for stale jobs...");

  const res = await pool.query(`
    UPDATE public.aivm_jobs j
    SET    status     = 'canceled',
           last_error = 'Challenge reached terminal state (Finalized/Rejected/Canceled) before this job could be submitted.',
           updated_at = now()
    FROM   public.challenges c
    WHERE  c.id = j.challenge_id
      AND  j.status IN ('queued', 'failed', 'processing')
      AND  lower(c.status) IN ('finalized', 'rejected', 'canceled')
    RETURNING j.challenge_id, j.status AS old_status
  `);

  if ((res.rowCount ?? 0) === 0) {
    console.log("[cancelTerminalJobs] no stale jobs found — nothing to do");
  } else {
    console.log(`[cancelTerminalJobs] canceled ${res.rowCount} stale job(s):`);
    for (const row of res.rows) {
      console.log(`  challenge_id=${row.challenge_id} was_status=${row.old_status}`);
    }
  }
}

main()
  .catch(async (err) => { console.error("[cancelTerminalJobs] fatal:", err); await pool.end(); process.exit(1); })
  .finally(() => pool.end());
