/**
 * webapp/app/api/v1/payments/webhook/route.ts
 *
 * Stripe webhook handler.
 *
 * POST — Receives Stripe events, verifies signature using
 *        STRIPE_WEBHOOK_SECRET, and processes checkout.session.completed
 *        to update payment status and auto-register the user.
 *
 * Signature verification uses raw HMAC-SHA256 (no Stripe SDK).
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getPool } from "../../../../../../offchain/db/pool";

/* ------------------------------------------------------------------ */
/*  Stripe signature verification                                      */
/* ------------------------------------------------------------------ */

/**
 * Verify the Stripe-Signature header using HMAC-SHA256.
 *
 * Stripe signatures use the format:
 *   t=<timestamp>,v1=<signature>[,v0=<legacy>]
 *
 * The signed payload is `${timestamp}.${rawBody}`.
 * We allow up to 5 minutes of clock skew.
 */
function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): boolean {
  const parts = sigHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) return false;

  // Reject if timestamp is older than 5 minutes
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return signatures.some((sig) => {
    try {
      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(sig, "hex"),
      );
    } catch {
      return false;
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Payment record update helpers                                      */
/* ------------------------------------------------------------------ */

/**
 * Update a payment record's status inside competition settings JSONB.
 * Finds the record by payment_id within the payments array.
 */
async function updatePaymentStatus(
  paymentId: string,
  newStatus: string,
): Promise<{ competition_id: string; wallet: string } | null> {
  const pool = getPool();

  // Find which competition has this payment
  const { rows } = await pool.query(
    `SELECT id, settings
       FROM competitions
      WHERE settings->'payments' @> $1::jsonb`,
    [JSON.stringify([{ payment_id: paymentId }])],
  );

  if (rows.length === 0) return null;

  const comp = rows[0];
  const payments: Array<Record<string, unknown>> = comp.settings?.payments ?? [];
  let wallet = "";

  const updated = payments.map((p) => {
    if (p.payment_id === paymentId) {
      wallet = (p.wallet as string) ?? "";
      return { ...p, status: newStatus, completed_at: new Date().toISOString() };
    }
    return p;
  });

  if (!wallet) return null;

  await pool.query(
    `UPDATE competitions
        SET settings = jsonb_set(
              COALESCE(settings, '{}'::jsonb),
              '{payments}',
              $2::jsonb
            )
      WHERE id = $1`,
    [comp.id, JSON.stringify(updated)],
  );

  return { competition_id: comp.id, wallet };
}

/**
 * Auto-register the user for the competition after successful payment.
 * Skips if already registered.
 */
async function autoRegister(
  competitionId: string,
  wallet: string,
): Promise<void> {
  const pool = getPool();

  // Check if already registered
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM competition_registrations
      WHERE competition_id = $1
        AND lower(wallet) = lower($2)
      LIMIT 1`,
    [competitionId, wallet],
  );

  if (existing.length > 0) return;

  await pool.query(
    `INSERT INTO competition_registrations (competition_id, wallet)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [competitionId, wallet.toLowerCase()],
  );
}

/* ------------------------------------------------------------------ */
/*  POST /api/v1/payments/webhook                                      */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.warn(
        "[payments/webhook] STRIPE_WEBHOOK_SECRET not set. Rejecting webhook.",
      );
      return NextResponse.json(
        { ok: false, error: "Webhook secret not configured" },
        { status: 500 },
      );
    }

    const rawBody = await req.text();
    const sigHeader = req.headers.get("stripe-signature") ?? "";

    if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
      return NextResponse.json(
        { ok: false, error: "Invalid signature" },
        { status: 400 },
      );
    }

    const event = JSON.parse(rawBody) as {
      type: string;
      data: { object: Record<string, unknown> };
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const metadata = (session.metadata ?? {}) as Record<string, string>;
        const paymentId = metadata.payment_id;

        if (!paymentId) {
          console.warn("[payments/webhook] No payment_id in session metadata");
          break;
        }

        const result = await updatePaymentStatus(paymentId, "completed");

        if (result) {
          // Auto-register user for the competition
          try {
            await autoRegister(result.competition_id, result.wallet);
            console.log(
              `[payments/webhook] Payment ${paymentId} completed. Auto-registered ${result.wallet} for competition ${result.competition_id}.`,
            );
          } catch (regErr) {
            // Payment succeeded but registration failed — log but don't fail webhook
            console.error(
              `[payments/webhook] Auto-registration failed for ${result.wallet}:`,
              regErr,
            );
          }
        } else {
          console.warn(
            `[payments/webhook] Payment ${paymentId} not found in any competition.`,
          );
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const metadata = (session.metadata ?? {}) as Record<string, string>;
        const paymentId = metadata.payment_id;
        if (paymentId) {
          await updatePaymentStatus(paymentId, "expired");
          console.log(
            `[payments/webhook] Payment ${paymentId} expired.`,
          );
        }
        break;
      }

      default:
        // Acknowledge unhandled event types
        console.log(`[payments/webhook] Unhandled event type: ${event.type}`);
    }

    // Stripe expects 200 for successful receipt
    return NextResponse.json({ ok: true, received: true });
  } catch (err) {
    console.error("[payments/webhook] Error:", err);
    return NextResponse.json(
      { ok: false, error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
