/**
 * offchain/workers/webhookDelivery.ts
 *
 * Webhook delivery worker. Polls webhook_deliveries for pending items,
 * sends HTTP POST requests with HMAC-SHA256 signatures, handles retries.
 *
 * Usage: npx tsx offchain/workers/webhookDelivery.ts
 *
 * Env:
 *   DATABASE_URL          — required
 *   WEBHOOK_POLL_MS       — poll interval (default 5000)
 *   WEBHOOK_MAX_ATTEMPTS  — max delivery attempts (default 5)
 *   WEBHOOK_TIMEOUT_MS    — HTTP timeout per delivery (default 10000)
 *   DISCORD_BOT_ENABLED   — set to "true" to forward events to the Discord bot
 *   DISCORD_BOT_WEBHOOK_PORT — Discord bot HTTP port (default 3200)
 */

import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env` });

import { getPool, closePool } from "../db/pool";
import { createHmac } from "crypto";

const POLL_MS = Number(process.env.WEBHOOK_POLL_MS || 5000);
const MAX_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS || 5);
const TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS || 10000);

// Exponential backoff: 30s, 2min, 10min, 1hr, 4hr
const BACKOFF_SEC = [30, 120, 600, 3600, 14400];

type PendingDelivery = {
  id: string;
  webhook_id: string;
  event: string;
  payload: any;
  attempt: number;
  url: string;
  secret: string;
};

async function getPending(): Promise<PendingDelivery[]> {
  const pool = getPool();
  const { rows } = await pool.query<PendingDelivery>(`
    SELECT d.id, d.webhook_id, d.event, d.payload, d.attempt,
           w.url, w.secret
    FROM public.webhook_deliveries d
    JOIN public.webhooks w ON w.id = d.webhook_id AND w.active = true
    WHERE d.delivered_at IS NULL
      AND (d.next_retry_at IS NULL OR d.next_retry_at <= now())
      AND d.attempt <= $1
    ORDER BY d.created_at ASC
    LIMIT 20
  `, [MAX_ATTEMPTS]);
  return rows;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function deliver(d: PendingDelivery): Promise<void> {
  const pool = getPool();
  const body = JSON.stringify({
    event: d.event,
    payload: d.payload,
    timestamp: new Date().toISOString(),
    delivery_id: d.id,
  });

  const signature = sign(body, d.secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(d.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LightChallenge-Signature": `sha256=${signature}`,
        "X-LightChallenge-Event": d.event,
        "X-LightChallenge-Delivery": d.id,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await res.text().catch(() => "");

    if (res.ok) {
      // Success
      await pool.query(
        `UPDATE public.webhook_deliveries
         SET delivered_at = now(), response_status = $2, response_body = $3
         WHERE id = $1`,
        [d.id, res.status, responseBody.slice(0, 1000)]
      );
      console.log(`[webhook] delivered ${d.id} (${d.event}) -> ${res.status}`);
    } else {
      // HTTP error — schedule retry
      await scheduleRetry(d, res.status, responseBody.slice(0, 1000));
    }
  } catch (err: any) {
    // Network error — schedule retry
    await scheduleRetry(d, 0, err.message?.slice(0, 500) || "unknown error");
  }
}

async function scheduleRetry(
  d: PendingDelivery,
  status: number,
  body: string
): Promise<void> {
  const pool = getPool();
  const nextAttempt = d.attempt + 1;

  if (nextAttempt > MAX_ATTEMPTS) {
    // Give up
    await pool.query(
      `UPDATE public.webhook_deliveries
       SET response_status = $2, response_body = $3, attempt = $4
       WHERE id = $1`,
      [d.id, status, `GAVE UP after ${MAX_ATTEMPTS} attempts. Last: ${body}`, nextAttempt]
    );
    console.log(`[webhook] gave up on ${d.id} after ${MAX_ATTEMPTS} attempts`);
    return;
  }

  const backoffSec = BACKOFF_SEC[Math.min(d.attempt - 1, BACKOFF_SEC.length - 1)];

  await pool.query(
    `UPDATE public.webhook_deliveries
     SET attempt = $2, response_status = $3, response_body = $4,
         next_retry_at = now() + interval '${backoffSec} seconds'
     WHERE id = $1`,
    [d.id, nextAttempt, status, body.slice(0, 1000)]
  );
  console.log(`[webhook] retry ${d.id} attempt ${nextAttempt} in ${backoffSec}s (status=${status})`);
}

// ── Webhook Event Emitter (importable by other services) ─────────────────

/**
 * Queue a webhook event for delivery to all matching org webhooks.
 * Call this from any service that needs to emit events.
 */
export async function emitWebhookEvent(
  orgId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<number> {
  const pool = getPool();

  // Find all active webhooks for this org that subscribe to this event
  const { rows: hooks } = await pool.query<{ id: string }>(
    `SELECT id FROM public.webhooks
     WHERE org_id = $1 AND active = true AND ($2 = ANY(events) OR events = '{}')`,
    [orgId, event]
  );

  if (hooks.length === 0) {
    // Still forward to Discord even if no org webhooks matched
    forwardToDiscordBot(event, payload);
    return 0;
  }

  // Create delivery records
  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const hook of hooks) {
    placeholders.push(`($${idx++}, $${idx++}, $${idx++})`);
    values.push(hook.id, event, JSON.stringify(payload));
  }

  await pool.query(
    `INSERT INTO public.webhook_deliveries (webhook_id, event, payload)
     VALUES ${placeholders.join(", ")}`,
    values
  );

  forwardToDiscordBot(event, payload);

  return hooks.length;
}

// ── Discord Bot Forwarding (fire-and-forget) ─────────────────────────────

function forwardToDiscordBot(event: string, payload: Record<string, unknown>): void {
  if (process.env.DISCORD_BOT_ENABLED !== "true") return;

  // DISCORD_BOT_WEBHOOK_URL for remote deployments, falls back to localhost
  const url = process.env.DISCORD_BOT_WEBHOOK_URL
    || `http://localhost:${Number(process.env.DISCORD_BOT_WEBHOOK_PORT) || 3200}/`;
  // Discord bot expects { type, competition_id, ...rest } at top level
  const body = JSON.stringify({ type: event, ...payload });

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch((err) => {
    console.warn(`[webhook] discord bot forward failed: ${err.message || err}`);
  });
}

// ── Main Loop ────────────────────────────────────────────────────────────

async function loop() {
  while (true) {
    try {
      const pending = await getPending();
      if (pending.length > 0) {
        console.log(`[webhook] processing ${pending.length} deliveries`);
        await Promise.allSettled(pending.map(deliver));
      }
    } catch (err) {
      console.error("[webhook] poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// Run if main
if (require.main === module) {
  console.log("[webhook] starting delivery worker");
  console.log(`[webhook] poll=${POLL_MS}ms, maxAttempts=${MAX_ATTEMPTS}, timeout=${TIMEOUT_MS}ms`);
  loop().catch((e) => {
    console.error("[webhook] fatal:", e);
    closePool().then(() => process.exit(1));
  });
}
