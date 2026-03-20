/**
 * offchain/workers/inviteWorker.ts
 *
 * Processes queued challenge invites and delivers them as notifications.
 *
 * Runs periodically (default 30s) and picks up rows in status = 'queued':
 *   - method = 'wallet': create in-app notification for the target wallet
 *   - method = 'email': log the deep link (actual email delivery is a future phase)
 *   - method = 'steam': look up linked_accounts for Steam → wallet mapping
 *
 * Status transitions: queued → sent | failed
 *
 * Usage: npx tsx offchain/workers/inviteWorker.ts
 *
 * Env:
 *   DATABASE_URL              — required
 *   INVITE_POLL_MS            — poll interval (default 30000 = 30s)
 *   INVITE_BATCH              — max invites per tick (default 20)
 *   APP_URL                   — base URL for deep links (default https://lightchallenge.app)
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../webapp/.env.local") });

import { getPool, closePool } from "../db/pool";
import { createNotification } from "../db/notifications";
import type { Pool } from "pg";

const POLL_MS = Number(process.env.INVITE_POLL_MS ?? 30_000);
const BATCH_SIZE = Number(process.env.INVITE_BATCH ?? 20);
const APP_URL = process.env.APP_URL ?? "https://lightchallenge.app";

type InviteRow = {
  id: string;
  challenge_id: string;
  method: "email" | "wallet" | "steam";
  value: string;
  inviter_wallet: string | null;
};

async function getChallengeTitle(pool: Pool, challengeId: string): Promise<string> {
  const res = await pool.query<{ title: string }>(
    `SELECT title FROM public.challenges WHERE id = $1::bigint`,
    [challengeId]
  );
  return res.rows[0]?.title || `Challenge #${challengeId}`;
}

async function updateStatus(pool: Pool, id: string, status: "sent" | "failed") {
  await pool.query(
    `UPDATE public.challenge_invites SET status = $1, updated_at = now() WHERE id = $2`,
    [status, id]
  );
}

async function processWalletInvite(pool: Pool, invite: InviteRow) {
  const title = await getChallengeTitle(pool, invite.challenge_id);
  const inviterLabel = invite.inviter_wallet
    ? `${invite.inviter_wallet.slice(0, 6)}…${invite.inviter_wallet.slice(-4)}`
    : "Someone";

  await createNotification(
    invite.value.toLowerCase(),
    "invite_received",
    `You've been invited to "${title}"`,
    `${inviterLabel} invited you to join "${title}".`,
    {
      challengeId: invite.challenge_id,
      inviteId: invite.id,
      tier: `invite_${invite.id.slice(0, 8)}`,
      deepLink: `lightchallengeapp://challenge/${invite.challenge_id}`,
    },
    pool
  );

  await updateStatus(pool, invite.id, "sent");
}

async function processEmailInvite(pool: Pool, invite: InviteRow) {
  const title = await getChallengeTitle(pool, invite.challenge_id);
  const deepLink = `${APP_URL}/challenge/${invite.challenge_id}?invite=${invite.id}`;

  // Email delivery is a future phase (SendGrid/SES). For now, log the deep link.
  console.log(
    `[inviteWorker] Email invite ${invite.id} for "${title}" → ${invite.value} — deep link: ${deepLink}`
  );

  await updateStatus(pool, invite.id, "sent");
}

async function processSteamInvite(pool: Pool, invite: InviteRow) {
  // Look up linked_accounts for a Steam external_id → wallet mapping
  const res = await pool.query<{ subject: string }>(
    `SELECT subject FROM public.linked_accounts
     WHERE provider = 'steam' AND external_id = $1
     LIMIT 1`,
    [invite.value]
  );

  if (!res.rows[0]) {
    console.log(
      `[inviteWorker] Steam invite ${invite.id}: no linked account for Steam ID ${invite.value} — marking failed`
    );
    await updateStatus(pool, invite.id, "failed");
    return;
  }

  const wallet = res.rows[0].subject;
  const title = await getChallengeTitle(pool, invite.challenge_id);
  const inviterLabel = invite.inviter_wallet
    ? `${invite.inviter_wallet.slice(0, 6)}…${invite.inviter_wallet.slice(-4)}`
    : "Someone";

  await createNotification(
    wallet.toLowerCase(),
    "invite_received",
    `You've been invited to "${title}"`,
    `${inviterLabel} invited you to join "${title}".`,
    {
      challengeId: invite.challenge_id,
      inviteId: invite.id,
      tier: `invite_${invite.id.slice(0, 8)}`,
      deepLink: `lightchallengeapp://challenge/${invite.challenge_id}`,
    },
    pool
  );

  await updateStatus(pool, invite.id, "sent");
}

async function tick() {
  const pool = getPool();

  const { rows: invites } = await pool.query<InviteRow>(
    `SELECT id, challenge_id, method, value, inviter_wallet
     FROM public.challenge_invites
     WHERE status = 'queued'
     ORDER BY created_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  if (invites.length === 0) return;

  console.log(`[inviteWorker] Processing ${invites.length} queued invite(s)`);

  for (const invite of invites) {
    try {
      switch (invite.method) {
        case "wallet":
          await processWalletInvite(pool, invite);
          break;
        case "email":
          await processEmailInvite(pool, invite);
          break;
        case "steam":
          await processSteamInvite(pool, invite);
          break;
        default:
          console.warn(`[inviteWorker] Unknown method "${invite.method}" for invite ${invite.id}`);
          await updateStatus(pool, invite.id, "failed");
      }
    } catch (err) {
      console.error(`[inviteWorker] Failed to process invite ${invite.id}:`, err);
      try {
        await updateStatus(pool, invite.id, "failed");
      } catch {
        // best-effort
      }
    }
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

let running = true;

async function main() {
  console.log(`[inviteWorker] Starting (poll=${POLL_MS}ms, batch=${BATCH_SIZE})`);

  while (running) {
    try {
      await tick();
    } catch (err) {
      console.error("[inviteWorker] Tick error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  await closePool();
}

process.on("SIGINT", () => { running = false; });
process.on("SIGTERM", () => { running = false; });

main().catch((err) => {
  console.error("[inviteWorker] Fatal:", err);
  process.exit(1);
});
