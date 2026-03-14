/**
 * offchain/db/webhooks.ts
 *
 * Typed service for public.webhooks and public.webhook_deliveries.
 *
 * Webhooks allow organizations to receive event notifications at a URL.
 * Each delivery is tracked with status, retry count, and next retry time.
 *
 * Delivery lifecycle: created -> delivered (response_status 2xx)
 *                              -> failed (max retries or permanent error)
 *                              -> pending retry (next_retry_at in future)
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "./pool";

// ─── Types ──────────────────────────────────────────────────────────────────

export type WebhookRow = {
  id: string;
  org_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: Date;
};

export type WebhookDeliveryRow = {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  attempt: number;
  delivered_at: Date | null;
  next_retry_at: Date | null;
  created_at: Date;
};

export type RegisterWebhookInput = {
  orgId: string;
  url: string;
  secret: string;
  events: string[];
};

// ─── Webhook Queries ────────────────────────────────────────────────────────

/**
 * Register a new webhook for an organization.
 */
export async function registerWebhook(
  input: RegisterWebhookInput,
  db?: Pool | PoolClient
): Promise<WebhookRow> {
  const client = db ?? getPool();

  const res = await client.query<WebhookRow>(
    `
    INSERT INTO public.webhooks (org_id, url, secret, events, active, created_at)
    VALUES ($1, $2, $3, $4::text[], true, now())
    RETURNING *
    `,
    [input.orgId, input.url, input.secret, input.events]
  );

  return res.rows[0];
}

/**
 * List all webhooks for an organization.
 * Optionally filter to only active webhooks.
 */
export async function listWebhooks(
  orgId: string,
  activeOnly: boolean = false,
  db?: Pool | PoolClient
): Promise<WebhookRow[]> {
  const client = db ?? getPool();

  if (activeOnly) {
    const res = await client.query<WebhookRow>(
      `
      SELECT * FROM public.webhooks
      WHERE org_id = $1 AND active = true
      ORDER BY created_at ASC
      `,
      [orgId]
    );
    return res.rows;
  }

  const res = await client.query<WebhookRow>(
    `
    SELECT * FROM public.webhooks
    WHERE org_id = $1
    ORDER BY created_at ASC
    `,
    [orgId]
  );

  return res.rows;
}

/**
 * Delete (hard delete) a webhook and all its deliveries.
 * Returns true if a webhook was deleted.
 */
export async function deleteWebhook(
  webhookId: string,
  db?: Pool | PoolClient
): Promise<boolean> {
  const client = db ?? getPool();

  // Deliveries are FK-cascaded, but delete explicitly for clarity
  await client.query(
    `DELETE FROM public.webhook_deliveries WHERE webhook_id = $1`,
    [webhookId]
  );

  const res = await client.query(
    `DELETE FROM public.webhooks WHERE id = $1`,
    [webhookId]
  );

  return (res.rowCount ?? 0) > 0;
}

// ─── Delivery Queries ───────────────────────────────────────────────────────

/**
 * Create a delivery record for a webhook event.
 * Initial attempt = 1, no response yet.
 */
export async function createDelivery(
  webhookId: string,
  event: string,
  payload: Record<string, unknown>,
  db?: Pool | PoolClient
): Promise<WebhookDeliveryRow> {
  const client = db ?? getPool();

  const res = await client.query<WebhookDeliveryRow>(
    `
    INSERT INTO public.webhook_deliveries (
      webhook_id, event, payload, attempt, created_at
    )
    VALUES ($1, $2, $3::jsonb, 1, now())
    RETURNING *
    `,
    [webhookId, event, JSON.stringify(payload)]
  );

  return res.rows[0];
}

/**
 * Get all pending deliveries that are ready for (re)attempt.
 *
 * A delivery is pending if:
 * - delivered_at is null (not yet successfully delivered)
 * - next_retry_at is null or in the past (ready to retry)
 * - attempt <= maxAttempts
 *
 * Ordered by created_at ascending (FIFO).
 */
export async function getPendingDeliveries(
  maxAttempts: number = 5,
  limit: number = 100,
  db?: Pool | PoolClient
): Promise<WebhookDeliveryRow[]> {
  const client = db ?? getPool();

  const res = await client.query<WebhookDeliveryRow>(
    `
    SELECT d.* FROM public.webhook_deliveries d
    JOIN public.webhooks w ON w.id = d.webhook_id
    WHERE d.delivered_at IS NULL
      AND (d.next_retry_at IS NULL OR d.next_retry_at <= now())
      AND d.attempt <= $1
      AND w.active = true
    ORDER BY d.created_at ASC
    LIMIT $2
    `,
    [maxAttempts, limit]
  );

  return res.rows;
}

/**
 * Mark a delivery as successfully delivered.
 * Records the HTTP response status and body.
 */
export async function markDelivered(
  deliveryId: string,
  responseStatus: number,
  responseBody?: string | null,
  db?: Pool | PoolClient
): Promise<WebhookDeliveryRow> {
  const client = db ?? getPool();

  const res = await client.query<WebhookDeliveryRow>(
    `
    UPDATE public.webhook_deliveries
    SET delivered_at = now(),
        response_status = $1,
        response_body = $2,
        next_retry_at = NULL
    WHERE id = $3
    RETURNING *
    `,
    [responseStatus, responseBody ?? null, deliveryId]
  );

  return res.rows[0];
}

/**
 * Mark a delivery as failed for this attempt.
 * Increments the attempt counter and sets next_retry_at for exponential backoff.
 * Records the HTTP response status and body from the failed attempt.
 */
export async function markFailed(
  deliveryId: string,
  responseStatus: number | null,
  responseBody?: string | null,
  db?: Pool | PoolClient
): Promise<WebhookDeliveryRow> {
  const client = db ?? getPool();

  // Exponential backoff: 30s, 2min, 8min, 32min, 2h
  const res = await client.query<WebhookDeliveryRow>(
    `
    UPDATE public.webhook_deliveries
    SET attempt = attempt + 1,
        response_status = $1,
        response_body = $2,
        next_retry_at = now() + (interval '30 seconds' * power(4, LEAST(attempt - 1, 4)))
    WHERE id = $3
    RETURNING *
    `,
    [responseStatus, responseBody ?? null, deliveryId]
  );

  return res.rows[0];
}
