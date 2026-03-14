/**
 * Notification worker. Polls notifications table, processes delivery.
 *
 * Future: integrate with SendGrid/SES for email delivery.
 * For now: logs notifications and marks them as processed.
 *
 * Usage: npx tsx offchain/workers/notificationWorker.ts
 *
 * Env:
 *   DATABASE_URL            — required
 *   NOTIFICATION_POLL_MS    — poll interval (default 30000)
 */

import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env` });

import { getPool, closePool } from "../db/pool";

const POLL_MS = Number(process.env.NOTIFICATION_POLL_MS || 30000);

type NotificationRow = {
  id: string;
  wallet: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

/**
 * Fetch unread notifications created in the last hour.
 */
async function fetchPending(): Promise<NotificationRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<NotificationRow>(
    `SELECT id, wallet, type, title, body, data, read, created_at
     FROM public.notifications
     WHERE read = false
       AND created_at >= now() - interval '1 hour'
     ORDER BY created_at ASC
     LIMIT 50`
  );
  return rows;
}

/**
 * Process a single notification. For now, log it. In the future this is
 * where email/push delivery would go (e.g. SendGrid, SES, Firebase).
 */
async function processNotification(n: NotificationRow): Promise<void> {
  const pool = getPool();

  console.log(`[notify] ${n.type} -> ${n.wallet}: ${n.title}`);

  // Mark as read so it won't be picked up again
  await pool.query(
    `UPDATE public.notifications SET read = true WHERE id = $1`,
    [n.id]
  );
}

// ── Main Loop ────────────────────────────────────────────────────────────

async function loop() {
  while (true) {
    try {
      const pending = await fetchPending();
      if (pending.length > 0) {
        console.log(`[notify] processing ${pending.length} notification(s)`);
        for (const n of pending) {
          try {
            await processNotification(n);
          } catch (err) {
            console.error(`[notify] failed to process ${n.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[notify] poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// Run if main
if (require.main === module) {
  console.log("[notify] starting notification worker");
  console.log(`[notify] poll=${POLL_MS}ms`);
  loop().catch((e) => {
    console.error("[notify] fatal:", e);
    closePool().then(() => process.exit(1));
  });
}
