/**
 * offchain/workers/challengeAlertWorker.ts
 *
 * Comprehensive challenge lifecycle notification engine.
 *
 * Runs periodically and generates notifications for ALL lifecycle events:
 *
 *  PROGRESS ALERTS (active challenges):
 *    behind_pace_50   — 50% time, < 25% progress
 *    behind_pace_75   — 75% time, < 50% progress
 *    behind_pace_90   — 90% time, < 75% progress
 *    final_push_24h   — ≤ 24h remaining, < 100% progress
 *    final_push_6h    — ≤ 6h remaining, < 100% progress
 *    goal_reached     — progress ≥ 100%
 *
 *  LIFECYCLE EVENTS:
 *    starting_24h     — challenge starts within 24h
 *    proof_window     — proof submission window just opened (challenge ended)
 *    finalized        — challenge finalized, verdict available
 *    claim_available  — user has unclaimed funds (winner payout / loser cashback / refund)
 *    claim_reminder_3d — 3 days since finalization, still unclaimed
 *    claim_reminder_7d — 7 days since finalization, still unclaimed
 *    proof_submitted  — auto-proof was submitted for user
 *    joined           — someone joined a challenge you created
 *
 * Duplicate prevention: unique index on (wallet, data->>'challengeId', data->>'tier').
 *
 * Usage: npx tsx offchain/workers/challengeAlertWorker.ts
 *
 * Env:
 *   DATABASE_URL                — required
 *   CHALLENGE_ALERT_POLL_MS     — poll interval (default 300000 = 5 min)
 *   CHALLENGE_ALERT_BATCH       — max challenges per tick (default 200)
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../webapp/.env.local") });

import { getPool, closePool } from "../db/pool";
import type { Pool } from "pg";
import type { NotificationType } from "../db/notifications";

const POLL_MS = Number(process.env.CHALLENGE_ALERT_POLL_MS ?? 300_000); // 5 min
const BATCH_SIZE = Number(process.env.CHALLENGE_ALERT_BATCH ?? 200);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "ended";
  const h = Math.floor(seconds / 3600);
  const d = Math.floor(h / 24);
  if (d >= 2) return `${d} days`;
  if (h >= 1) return `${h}h`;
  const m = Math.ceil(seconds / 60);
  return `${m}m`;
}

function formatLCAI(stakeStr: string): string {
  const n = Number(stakeStr || 0);
  if (n === 0) return "0 LCAI";
  // Detect wei (> 1e15) vs human-readable (e.g. "0.05")
  const lcai = n > 1e15 ? n / 1e18 : n;
  if (lcai >= 1) return `${lcai.toFixed(2)} LCAI`;
  if (lcai >= 0.001) return `${lcai.toFixed(3)} LCAI`;
  return `${lcai.toFixed(6)} LCAI`;
}

/**
 * Insert a notification with dedup via ON CONFLICT DO NOTHING.
 * Returns true if a NEW notification was created.
 */
async function notify(
  pool: Pool,
  wallet: string,
  type: NotificationType,
  tier: string,
  challengeId: string,
  title: string,
  body: string,
  extraData?: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await pool.query(
      `INSERT INTO public.notifications (wallet, type, title, body, data, read, created_at)
       VALUES (lower($1), $2, $3, $4, $5::jsonb, false, now())
       ON CONFLICT (wallet, (data->>'challengeId'), (data->>'tier'))
         WHERE type IN (
           'challenge_behind_pace','challenge_final_push','challenge_goal_reached',
           'challenge_finalized','claim_available','claim_reminder',
           'challenge_joined','proof_submitted','challenge_starting','proof_window_open'
         )
       DO NOTHING
       RETURNING id`,
      [
        wallet,
        type,
        title,
        body,
        JSON.stringify({
          challengeId,
          tier,
          deepLink: `lightchallengeapp://challenge/${challengeId}`,
          ...extraData,
        }),
      ]
    );
    if ((res.rowCount ?? 0) > 0) {
      console.log(`[challenge-alert] ${tier} → ${wallet.slice(0, 10)}… #${challengeId}`);
      return true;
    }
    return false;
  } catch (err: any) {
    if (err.code === "23505") return false; // unique constraint
    console.error(`[challenge-alert] insert error (${tier}):`, err.message);
    return false;
  }
}

// ─── 1. Progress Alerts (active challenges) ──────────────────────────────────

type ActiveChallenge = {
  challenge_id: string;
  title: string;
  start_ts: number;
  end_ts: number;
  proof_deadline_ts: number;
  metric: string | null;
  threshold: number | null;
  creator: string | null;
};

async function getActiveChallenges(pool: Pool): Promise<ActiveChallenge[]> {
  const res = await pool.query<ActiveChallenge>(
    `SELECT
       c.id::text AS challenge_id,
       c.title,
       EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz)::bigint AS start_ts,
       EXTRACT(EPOCH FROM (c.timeline->>'endsAt')::timestamptz)::bigint AS end_ts,
       EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz)::bigint AS proof_deadline_ts,
       c.creator,
       COALESCE(
         c.params->'rules'->'conditions'->0->>'metric',
         c.params->>'metric',
         c.params->'rules'->>'metric'
       ) AS metric,
       COALESCE(
         c.params->'rules'->'conditions'->0->>'value',
         c.params->>'threshold',
         c.params->'rules'->>'threshold'
       ) AS threshold
     FROM public.challenges c
     WHERE lower(coalesce(c.status,'')) NOT IN ('finalized','canceled','rejected')
       AND c.timeline->>'startsAt' IS NOT NULL
       AND c.timeline->>'endsAt' IS NOT NULL
       AND EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz) <= EXTRACT(EPOCH FROM now())
       AND EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz) > EXTRACT(EPOCH FROM now())
       AND coalesce(c.params->'rules'->>'mode', c.params->>'mode', '') != 'competitive'
     ORDER BY c.created_at DESC
     LIMIT $1`,
    [BATCH_SIZE]
  );
  return res.rows.map((r) => ({ ...r, threshold: r.threshold != null ? Number(r.threshold) : null }));
}

function sumMetric(records: any[], metric: string): number {
  let total = 0;
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    switch (metric) {
      case "steps": case "steps_count":
        total += Number(r.steps ?? r.steps_count ?? 0); break;
      case "distance_km":
        if (["run","walk","distance"].includes(r.type))
          total += Number(r.distance_km ?? (r.distance_m ? r.distance_m / 1000 : 0));
        break;
      case "cycling_km":
        if (["cycle","ride","cycling"].includes(r.type))
          total += Number(r.distance_km ?? (r.distance_m ? r.distance_m / 1000 : 0));
        break;
      case "swimming_km":
        if (["swim","swimming"].includes(r.type))
          total += Number(r.distance_km ?? (r.distance_m ? r.distance_m / 1000 : 0));
        break;
      case "hiking_km":
        if (["hike","hiking"].includes(r.type))
          total += Number(r.distance_km ?? (r.distance_m ? r.distance_m / 1000 : 0));
        break;
      case "walking_km":
        if (["walk","walking"].includes(r.type))
          total += Number(r.distance_km ?? (r.distance_m ? r.distance_m / 1000 : 0));
        break;
      case "rowing_km":
        if (["rowing","row"].includes(r.type))
          total += Number(r.distance_km ?? (r.distance_m ? r.distance_m / 1000 : 0));
        break;
      case "elev_gain_m":
        total += Number(r.elev_gain_m ?? r.elevation_gain ?? 0); break;
      case "strength_sessions":
        if (["strength","weighttraining","gym"].includes(r.type)) total += 1;
        break;
      case "yoga_min":
        if (["yoga","pilates"].includes(r.type))
          total += Number(r.duration_s ? r.duration_s / 60 : r.duration_min ?? 0);
        break;
      case "hiit_min":
        if (["hiit","crossfit"].includes(r.type))
          total += Number(r.duration_s ? r.duration_s / 60 : r.duration_min ?? 0);
        break;
      case "calories":
        total += Number(r.calories ?? r.active_energy ?? 0); break;
      case "exercise_time":
        total += Number(r.exercise_time ?? r.exercise_minutes ?? 0); break;
      case "duration_min":
        total += Number(r.duration_s ? r.duration_s / 60 : r.duration_min ?? 0); break;
      default:
        total += Number(r[metric] ?? 0);
    }
  }
  return total;
}

async function runProgressAlerts(pool: Pool, nowSec: number): Promise<number> {
  const challenges = await getActiveChallenges(pool);
  let created = 0;

  for (const ch of challenges) {
    if (!ch.metric || !ch.threshold || ch.threshold <= 0) continue;

    const participants = await pool.query<{ subject: string }>(
      `SELECT DISTINCT p.subject FROM public.participants p WHERE p.challenge_id = $1::bigint`,
      [ch.challenge_id]
    );

    for (const p of participants.rows) {
      // Calculate progress
      const evRes = await pool.query<{ data: any }>(
        `SELECT data FROM public.evidence
         WHERE challenge_id = $1::bigint AND lower(subject) = lower($2)
         ORDER BY updated_at DESC`,
        [ch.challenge_id, p.subject]
      );
      let val = 0;
      for (const r of evRes.rows) {
        val += sumMetric(Array.isArray(r.data) ? r.data : [], ch.metric!);
      }

      const progress = val / ch.threshold!;
      const totalDur = ch.end_ts - ch.start_ts;
      if (totalDur <= 0) continue;
      const timeFrac = Math.min(1.0, (nowSec - ch.start_ts) / totalDur);
      const remaining = ch.end_ts - nowSec;
      const rem = formatRemaining(remaining);
      const pct = Math.round(progress * 100);

      // Goal reached
      if (progress >= 1.0) {
        if (await notify(pool, p.subject, "challenge_goal_reached", "goal_reached", ch.challenge_id,
          "Target reached!",
          `You hit your goal for "${ch.title}". Your proof will be submitted automatically.`
        )) created++;
        continue;
      }

      // Final push: ≤6h
      if (remaining <= 6 * 3600) {
        if (await notify(pool, p.subject, "challenge_final_push", "final_push_6h", ch.challenge_id,
          `Final hours — ${ch.title}`,
          `Only ${rem} left at ${pct}%. Give it one last push!`
        )) created++;
      }
      // Final push: ≤24h
      else if (remaining <= 24 * 3600) {
        if (await notify(pool, p.subject, "challenge_final_push", "final_push_24h", ch.challenge_id,
          `Last day — ${ch.title}`,
          `${rem} remaining with ${pct}% progress. Time to finish strong!`
        )) created++;
      }

      // Behind pace tiers
      if (timeFrac >= 0.9 && progress < 0.75) {
        if (await notify(pool, p.subject, "challenge_behind_pace", "behind_pace_90", ch.challenge_id,
          `Almost over — ${ch.title}`,
          `90% done but only ${pct}% progress. ${rem} left.`
        )) created++;
      } else if (timeFrac >= 0.75 && progress < 0.50) {
        if (await notify(pool, p.subject, "challenge_behind_pace", "behind_pace_75", ch.challenge_id,
          `Falling behind — ${ch.title}`,
          `Three-quarters through with only ${pct}% progress. Pick up the pace — ${rem} left!`
        )) created++;
      } else if (timeFrac >= 0.50 && progress < 0.25) {
        if (await notify(pool, p.subject, "challenge_behind_pace", "behind_pace_50", ch.challenge_id,
          `Halfway check — ${ch.title}`,
          `Halfway through "${ch.title}" but only ${pct}% done. ${rem} to go.`
        )) created++;
      }
    }
  }
  return created;
}

// ─── 2. Challenge Starting Soon ──────────────────────────────────────────────

async function runStartingSoonAlerts(pool: Pool, nowSec: number): Promise<number> {
  // Challenges that start within 24h but haven't started yet
  const res = await pool.query<{ challenge_id: string; title: string; start_ts: number; subject: string }>(
    `SELECT c.id::text AS challenge_id, c.title,
            EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz)::bigint AS start_ts,
            p.subject
     FROM public.challenges c
     JOIN public.participants p ON p.challenge_id = c.id
     WHERE lower(coalesce(c.status,'')) NOT IN ('finalized','canceled','rejected')
       AND c.timeline->>'startsAt' IS NOT NULL
       AND EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz) > $1
       AND EXTRACT(EPOCH FROM (c.timeline->>'startsAt')::timestamptz) <= $2
     LIMIT $3`,
    [nowSec, nowSec + 24 * 3600, BATCH_SIZE]
  );

  let created = 0;
  for (const r of res.rows) {
    const rem = formatRemaining(r.start_ts - nowSec);
    if (await notify(pool, r.subject, "challenge_starting", "starting_24h", r.challenge_id,
      `Starting soon — ${r.title}`,
      `"${r.title}" starts in ${rem}. Get ready!`
    )) created++;
  }
  return created;
}

// ─── 3. Proof Window Opened ──────────────────────────────────────────────────

async function runProofWindowAlerts(pool: Pool, nowSec: number): Promise<number> {
  // Challenges where endTs has passed (proof window open) but proofDeadline hasn't
  const res = await pool.query<{ challenge_id: string; title: string; proof_deadline_ts: number; subject: string }>(
    `SELECT c.id::text AS challenge_id, c.title,
            EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz)::bigint AS proof_deadline_ts,
            p.subject
     FROM public.challenges c
     JOIN public.participants p ON p.challenge_id = c.id
     WHERE lower(coalesce(c.status,'')) NOT IN ('finalized','canceled','rejected')
       AND c.timeline->>'endsAt' IS NOT NULL
       AND c.timeline->>'proofDeadline' IS NOT NULL
       AND EXTRACT(EPOCH FROM (c.timeline->>'endsAt')::timestamptz) <= $1
       AND EXTRACT(EPOCH FROM (c.timeline->>'proofDeadline')::timestamptz) > $1
     LIMIT $2`,
    [nowSec, BATCH_SIZE]
  );

  let created = 0;
  for (const r of res.rows) {
    const rem = formatRemaining(r.proof_deadline_ts - nowSec);
    if (await notify(pool, r.subject, "proof_window_open", "proof_window", r.challenge_id,
      `Proof window open — ${r.title}`,
      `"${r.title}" has ended. Submit your proof within ${rem}.`
    )) created++;
  }
  return created;
}

// ─── 4. Challenge Finalized (verdict ready) ──────────────────────────────────

async function runFinalizedAlerts(pool: Pool): Promise<number> {
  // Challenges with status='Finalized' that have verdicts
  const res = await pool.query<{
    challenge_id: string; title: string; subject: string;
    verdict_pass: boolean;
    stake_wei: string | null;
  }>(
    `SELECT c.id::text AS challenge_id, c.title,
            v.subject,
            v.pass AS verdict_pass,
            c.funds->>'stake' AS stake_wei
     FROM public.challenges c
     JOIN public.verdicts v ON v.challenge_id = c.id
     WHERE lower(coalesce(c.status,'')) = 'finalized'
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let created = 0;
  for (const r of res.rows) {
    const passed = r.verdict_pass;
    const stakeStr = r.stake_wei ? formatLCAI(r.stake_wei) : "";
    const verb = passed ? "passed" : "did not pass";

    if (await notify(pool, r.subject, "challenge_finalized", "finalized", r.challenge_id,
      passed ? `Challenge passed — ${r.title}` : `Results in — ${r.title}`,
      passed
        ? `You ${verb} "${r.title}"!${stakeStr ? ` Claim your reward.` : ""}`
        : `You ${verb} "${r.title}".${stakeStr ? ` You may still have cashback to claim.` : ""}`
    )) created++;
  }
  return created;
}

// ─── 5. Claim Available + Claim Reminders ────────────────────────────────────

async function runClaimAlerts(pool: Pool, nowSec: number): Promise<number> {
  // Finalized challenges where participants have NOT yet claimed.
  // Winners: no claim row with type 'principal'. Losers: no claim row with type 'cashback'.
  const res = await pool.query<{
    challenge_id: string; title: string; subject: string;
    verdict_pass: boolean; stake_wei: string | null;
    finalized_at: number | null;
  }>(
    `SELECT c.id::text AS challenge_id, c.title,
            v.subject,
            v.pass AS verdict_pass,
            c.funds->>'stake' AS stake_wei,
            EXTRACT(EPOCH FROM c.updated_at)::bigint AS finalized_at
     FROM public.challenges c
     JOIN public.verdicts v ON v.challenge_id = c.id
     LEFT JOIN public.claims cl
       ON cl.challenge_id = c.id
       AND lower(cl.subject) = lower(v.subject)
     WHERE lower(coalesce(c.status,'')) = 'finalized'
       AND cl.id IS NULL  -- No claim record exists
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let created = 0;
  for (const r of res.rows) {
    const stakeStr = r.stake_wei ? formatLCAI(r.stake_wei) : "your reward";
    const daysSince = r.finalized_at ? Math.floor((nowSec - r.finalized_at) / 86400) : 0;

    // Initial claim available notification
    if (r.verdict_pass) {
      if (await notify(pool, r.subject, "claim_available", "claim_winner", r.challenge_id,
        `Claim your reward — ${r.title}`,
        `You won "${r.title}"! Claim ${stakeStr} plus your bonus.`
      )) created++;
    } else {
      if (await notify(pool, r.subject, "claim_available", "claim_loser", r.challenge_id,
        `Cashback available — ${r.title}`,
        `"${r.title}" is over. You may have cashback to claim.`
      )) created++;
    }

    // Reminder at 3 days
    if (daysSince >= 3) {
      if (await notify(pool, r.subject, "claim_reminder", "claim_reminder_3d", r.challenge_id,
        `Don't forget to claim — ${r.title}`,
        `It's been ${daysSince} days since "${r.title}" ended. Your funds are still waiting.`
      )) created++;
    }

    // Reminder at 7 days
    if (daysSince >= 7) {
      if (await notify(pool, r.subject, "claim_reminder", "claim_reminder_7d", r.challenge_id,
        `Unclaimed reward — ${r.title}`,
        `Your reward from "${r.title}" is still unclaimed after ${daysSince} days. Claim it now!`
      )) created++;
    }
  }
  return created;
}

// ─── 6. Canceled challenge refund alerts ─────────────────────────────────────

async function runRefundAlerts(pool: Pool): Promise<number> {
  const res = await pool.query<{
    challenge_id: string; title: string; subject: string; stake_wei: string | null;
  }>(
    `SELECT c.id::text AS challenge_id, c.title, p.subject,
            c.funds->>'stake' AS stake_wei
     FROM public.challenges c
     JOIN public.participants p ON p.challenge_id = c.id
     LEFT JOIN public.claims cl
       ON cl.challenge_id = c.id
       AND lower(cl.subject) = lower(p.subject)
       AND cl.claim_type = 'refund'
     WHERE lower(coalesce(c.status,'')) = 'canceled'
       AND cl.id IS NULL  -- No refund claim
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let created = 0;
  for (const r of res.rows) {
    const stakeStr = r.stake_wei ? formatLCAI(r.stake_wei) : "your stake";
    if (await notify(pool, r.subject, "claim_available", "claim_refund", r.challenge_id,
      `Refund available — ${r.title}`,
      `"${r.title}" was canceled. Claim your refund of ${stakeStr}.`
    )) created++;
  }
  return created;
}

// ─── 7. New participant joined (notify creator) ──────────────────────────────

async function runJoinAlerts(pool: Pool): Promise<number> {
  // Recent joins (last 10 minutes) — notify the challenge creator
  const res = await pool.query<{
    challenge_id: string; title: string; creator: string;
    subject: string; participant_count: number;
  }>(
    `SELECT c.id::text AS challenge_id, c.title, c.creator,
            p.subject,
            (SELECT count(*) FROM public.participants p2 WHERE p2.challenge_id = c.id)::int AS participant_count
     FROM public.participants p
     JOIN public.challenges c ON c.id = p.challenge_id
     WHERE p.created_at >= now() - interval '10 minutes'
       AND lower(p.subject) != lower(coalesce(c.creator,''))
       AND c.creator IS NOT NULL
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let created = 0;
  for (const r of res.rows) {
    const addr = r.subject.slice(0, 6) + "…" + r.subject.slice(-4);
    // Use subject+challenge as tier to dedup per-joiner
    const tier = `joined_${r.subject.toLowerCase().slice(0, 10)}`;
    if (await notify(pool, r.creator, "challenge_joined", tier, r.challenge_id,
      `New participant — ${r.title}`,
      `${addr} joined "${r.title}". ${r.participant_count} participant(s) total.`
    )) created++;
  }
  return created;
}

// ─── 8. Proof submitted (notify participant) ─────────────────────────────────

async function runProofSubmittedAlerts(pool: Pool): Promise<number> {
  // Evidence submitted in last 10 minutes that doesn't have a notification yet
  const res = await pool.query<{
    challenge_id: string; title: string; subject: string; provider: string;
  }>(
    `SELECT c.id::text AS challenge_id, c.title, e.subject, e.provider
     FROM public.evidence e
     JOIN public.challenges c ON c.id = e.challenge_id
     WHERE e.created_at >= now() - interval '10 minutes'
       AND e.challenge_id > 0
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let created = 0;
  for (const r of res.rows) {
    const providerLabel = r.provider === "apple_health" ? "Apple Health"
      : r.provider.charAt(0).toUpperCase() + r.provider.slice(1);
    if (await notify(pool, r.subject, "proof_submitted", "proof_submitted", r.challenge_id,
      `Proof submitted — ${r.title}`,
      `Your ${providerLabel} evidence for "${r.title}" has been submitted. Evaluation in progress.`
    )) created++;
  }
  return created;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function runOnce(pool: Pool): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  let total = 0;

  total += await runProgressAlerts(pool, nowSec);
  total += await runStartingSoonAlerts(pool, nowSec);
  total += await runProofWindowAlerts(pool, nowSec);
  total += await runFinalizedAlerts(pool);
  total += await runClaimAlerts(pool, nowSec);
  total += await runRefundAlerts(pool);
  total += await runJoinAlerts(pool);
  total += await runProofSubmittedAlerts(pool);

  if (total > 0) {
    console.log(`[challenge-alert] tick complete: ${total} new notification(s)`);
  }
}

async function main() {
  console.log(`[challenge-alert] starting — poll every ${POLL_MS / 1000}s, batch ${BATCH_SIZE}`);
  const pool = getPool();

  async function tick() {
    try { await runOnce(pool); }
    catch (e: any) { console.error(`[challenge-alert] tick error: ${e.message}`); }
    setTimeout(tick, POLL_MS);
  }

  await tick();
}

process.on("SIGINT", async () => {
  console.log("[challenge-alert] shutting down...");
  await closePool();
  process.exit(0);
});

if (require.main === module) {
  main().catch((e) => {
    console.error("[challenge-alert] fatal:", e);
    process.exit(1);
  });
}

export { runOnce, sumMetric, formatRemaining };
