import path from "path";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

const POLL_MS = Number(process.env.CHALLENGE_DISPATCHER_POLL_MS || 10000);
const MAX_SCAN = Number(process.env.CHALLENGE_DISPATCHER_SCAN_LIMIT || 200);

type ChallengeCandidate = {
  id: string | number;
  timeline: Record<string, any> | null;
  proof: Record<string, any> | null;
  status: string | null;
};

let loopRunning = false;
let timer: NodeJS.Timeout | null = null;

function lower(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function parseIsoToSec(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

function getStartSec(timeline: Record<string, any>): number | null {
  return (
    parseIsoToSec(timeline?.startsAt) ??
    parseIsoToSec(timeline?.startTs) ??
    parseIsoToSec(timeline?.starts) ??
    null
  );
}

function getProofDeadlineSec(timeline: Record<string, any>): number | null {
  return (
    parseIsoToSec(timeline?.proofDeadline) ??
    parseIsoToSec(timeline?.proofDeadlineAt) ??
    null
  );
}

function isReady(row: ChallengeCandidate): boolean {
  const timeline = row.timeline ?? {};
  const proof = row.proof ?? {};

  const startSec = getStartSec(timeline);
  const proofDeadlineSec = getProofDeadlineSec(timeline);

  if (!startSec || !proofDeadlineSec) return false;
  if (nowSec() < startSec) return false;
  if (nowSec() > proofDeadlineSec) return false;

  if (lower(row.status) !== "approved") return false;
  if (lower(proof?.backend) !== "lightchain_poi") return false;

  if (!proof?.modelId) return false;
  if (!proof?.paramsHash) return false;
  if (!proof?.benchmarkHash) return false;

  if (proof?.taskBinding?.requestId || proof?.taskBinding?.taskId) return false;

  return true;
}

async function getChallengesToScan(): Promise<ChallengeCandidate[]> {
  const res = await pool.query<ChallengeCandidate>(
    `
    select
      id,
      timeline,
      proof,
      status
    from public.challenges
    where lower(coalesce(status, '')) = 'approved'
    order by created_at asc
    limit $1
    `,
    [MAX_SCAN]
  );

  return res.rows;
}

async function ensureQueuedJob(challengeId: string): Promise<boolean> {
  const res = await pool.query(
    `
    insert into public.aivm_jobs (
      challenge_id,
      status,
      attempts,
      created_at,
      updated_at
    )
    values (
      $1::bigint,
      'queued',
      0,
      now(),
      now()
    )
    on conflict (challenge_id) do nothing
    returning challenge_id
    `,
    [challengeId]
  );

  return (res.rowCount ?? 0) > 0;
}

async function runDispatcherOnce() {
  if (loopRunning) {
    console.log("[challengeDispatcher] previous loop still running");
    return;
  }

  loopRunning = true;

  try {
    const rows = await getChallengesToScan();
    const ready = rows.filter(isReady);

    if (!ready.length) {
      console.log("[challengeDispatcher] no ready challenges");
      return;
    }

    console.log(
      "[challengeDispatcher] ready",
      ready.map((x) => String(x.id))
    );

    for (const row of ready) {
      const id = String(row.id);
      const inserted = await ensureQueuedJob(id);

      if (inserted) {
        console.log("[challengeDispatcher] queued", id);
      } else {
        console.log("[challengeDispatcher] already queued", id);
      }
    }
  } catch (err) {
    console.error("[challengeDispatcher] loop failed", err);
  } finally {
    loopRunning = false;
  }
}

async function shutdown(code: number) {
  try {
    if (timer) clearInterval(timer);
    console.log("[challengeDispatcher] shutting down...");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

async function main() {
  console.log("[challengeDispatcher] started");
  console.log("[challengeDispatcher] poll ms =", POLL_MS);
  console.log("[challengeDispatcher] scan limit =", MAX_SCAN);

  await runDispatcherOnce();

  timer = setInterval(() => {
    void runDispatcherOnce();
  }, POLL_MS);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch(async (err) => {
  console.error("[challengeDispatcher] fatal", err);
  await shutdown(1);
});