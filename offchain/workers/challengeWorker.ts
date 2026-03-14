import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";
import { sslConfig } from "../db/sslConfig";
import { runChallengePayAivmJob } from "../runners/runChallengePayAivmJob";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 10,
});

const POLL_MS = Number(process.env.CHALLENGE_WORKER_POLL_MS || 5000);
const CONCURRENCY = Number(process.env.CHALLENGE_WORKER_CONCURRENCY || 2);
const MAX_ATTEMPTS = Number(process.env.CHALLENGE_WORKER_MAX_ATTEMPTS || 10);

const activeJobs = new Set<string>();
let loopRunning = false;
let timer: NodeJS.Timeout | null = null;

type JobRow = {
  id: string | number;
  challenge_id: string | number;
  attempts: number;
};

async function claimNextJobs(limit: number): Promise<JobRow[]> {
  const res = await pool.query<JobRow>(
    `
    with picked as (
      select j.id
      from public.aivm_jobs j
      -- Safety net: skip jobs for challenges already in a terminal state.
      -- The dispatcher's cancelTerminalJobs() handles this proactively,
      -- but this guard prevents races where a challenge is finalized between
      -- the dispatcher scan and worker claim.
      join public.challenges c on c.id = j.challenge_id
      where j.status in ('queued', 'failed')
        and coalesce(j.attempts, 0) < $1
        and lower(coalesce(c.status, '')) not in ('finalized', 'rejected', 'canceled')
      order by j.created_at asc
      limit $2
      for update of j skip locked
    )
    update public.aivm_jobs j
    set
      status = 'processing',
      attempts = coalesce(j.attempts, 0) + 1,
      updated_at = now()
    from picked
    where j.id = picked.id
    returning j.id, j.challenge_id, j.attempts
    `,
    [MAX_ATTEMPTS, limit]
  );

  return res.rows;
}

async function markJobDone(challengeId: string) {
  await pool.query(
    `
    update public.aivm_jobs
    set
      status = 'done',
      updated_at = now()
    where challenge_id = $1::bigint
    `,
    [challengeId]
  );
}

async function markJobFailed(challengeId: string, error: string) {
  await pool.query(
    `
    update public.aivm_jobs
    set
      status = case
        when coalesce(attempts, 0) >= $3 then 'dead'
        else 'failed'
      end,
      last_error = $2::text,
      updated_at = now()
    where challenge_id = $1::bigint
    `,
    [challengeId, error.slice(0, 4000), MAX_ATTEMPTS]
  );
}

async function runSingleJob(challengeId: string) {
  if (activeJobs.has(challengeId)) return;

  activeJobs.add(challengeId);

  try {
    console.log("[challengeWorker] executing", challengeId);

    const result = await runChallengePayAivmJob(challengeId);

    if (result === null) {
      // Challenge was already bound — mark done to clear the queue entry.
      await markJobDone(challengeId);
      console.log("[challengeWorker] no-op/done (already bound)", challengeId);
      return;
    }

    // AIVM request submitted successfully. Job is now in 'submitted' status
    // (set by persistRequestBindingEarly inside the runner). The aivmIndexer
    // will advance it through committed → revealed → done as the Lightchain
    // network processes the task. Do NOT mark done here.
    console.log("[challengeWorker] AIVM request submitted", challengeId, {
      requestId: result.requestId.toString(),
      taskId: result.taskId,
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[challengeWorker] job failed", challengeId, msg);
    await markJobFailed(challengeId, msg);
  } finally {
    activeJobs.delete(challengeId);
  }
}

async function runWorkerOnce() {
  if (loopRunning) {
    console.log("[challengeWorker] previous loop still running");
    return;
  }

  loopRunning = true;

  try {
    const freeSlots = Math.max(0, CONCURRENCY - activeJobs.size);
    if (freeSlots === 0) {
      return;
    }

    const jobs = await claimNextJobs(freeSlots);

    if (!jobs.length) {
      console.log("[challengeWorker] no queued jobs");
      return;
    }

    console.log(
      "[challengeWorker] claimed jobs",
      jobs.map((x) => String(x.challenge_id))
    );

    for (const job of jobs) {
      void runSingleJob(String(job.challenge_id));
    }
  } catch (err) {
    console.error("[challengeWorker] loop failed", err);
  } finally {
    loopRunning = false;
  }
}

async function shutdown(code: number) {
  try {
    if (timer) clearInterval(timer);
    console.log("[challengeWorker] shutting down...");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

async function main() {
  console.log("[challengeWorker] started");
  console.log("[challengeWorker] poll ms =", POLL_MS);
  console.log("[challengeWorker] concurrency =", CONCURRENCY);
  console.log("[challengeWorker] max attempts =", MAX_ATTEMPTS);

  await runWorkerOnce();

  timer = setInterval(() => {
    void runWorkerOnce();
  }, POLL_MS);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch(async (err) => {
  console.error("[challengeWorker] fatal", err);
  await shutdown(1);
});