/**
 * webapp/app/api/v1/payments/route.ts
 *
 * Payment intents for competition entry fees.
 *
 * POST — Create a payment record (optionally backed by Stripe Checkout).
 * GET  — List payment records for a competition.
 *
 * If STRIPE_SECRET_KEY is set, POST creates a real Stripe Checkout Session.
 * Otherwise it returns a mock payment with instructions to configure Stripe.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";
import { validateApiKey } from "@/lib/apiKeyAuth";
import { randomBytes } from "crypto";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PaymentRecord = {
  payment_id: string;
  competition_id: string;
  wallet: string;
  amount_cents: number;
  currency: string;
  status: string;
  checkout_url: string | null;
  stripe_session_id: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/*  In-memory payment store (JSON in competition settings)             */
/*                                                                     */
/*  Payments are stored as a JSONB array inside                        */
/*  competitions.settings->'payments'. No migration needed.            */
/* ------------------------------------------------------------------ */

async function loadPayments(competitionId: string): Promise<PaymentRecord[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT settings->'payments' AS payments
       FROM competitions
      WHERE id = $1
      LIMIT 1`,
    [competitionId],
  );
  if (rows.length === 0) return [];
  return Array.isArray(rows[0].payments) ? rows[0].payments : [];
}

async function appendPayment(
  competitionId: string,
  payment: PaymentRecord,
): Promise<void> {
  const pool = getPool();
  // Append to the payments array inside settings JSONB.
  // If settings is null or payments key is absent, initialize it.
  await pool.query(
    `UPDATE competitions
        SET settings = jsonb_set(
              COALESCE(settings, '{}'::jsonb),
              '{payments}',
              COALESCE(settings->'payments', '[]'::jsonb) || $2::jsonb
            )
      WHERE id = $1`,
    [competitionId, JSON.stringify(payment)],
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe Checkout (raw fetch, no SDK)                                */
/* ------------------------------------------------------------------ */

async function createStripeCheckoutSession(opts: {
  amount_cents: number;
  currency: string;
  payment_id: string;
  competition_id: string;
  wallet: string;
}): Promise<{ session_id: string; checkout_url: string } | null> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return null;

  const successUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000";

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("payment_method_types[]", "card");
  params.set("line_items[0][price_data][currency]", opts.currency);
  params.set(
    "line_items[0][price_data][unit_amount]",
    String(opts.amount_cents),
  );
  params.set(
    "line_items[0][price_data][product_data][name]",
    `Competition Entry #${opts.competition_id}`,
  );
  params.set("line_items[0][quantity]", "1");
  params.set(
    "success_url",
    `${successUrl}/api/v1/payments?status=success&payment_id=${opts.payment_id}`,
  );
  params.set(
    "cancel_url",
    `${successUrl}/api/v1/payments?status=cancel&payment_id=${opts.payment_id}`,
  );
  params.set("metadata[payment_id]", opts.payment_id);
  params.set("metadata[competition_id]", opts.competition_id);
  params.set("metadata[wallet]", opts.wallet);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(stripeKey + ":").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[payments] Stripe checkout creation failed:", errBody);
    return null;
  }

  const session = (await res.json()) as { id: string; url: string };
  return { session_id: session.id, checkout_url: session.url };
}

/* ------------------------------------------------------------------ */
/*  POST /api/v1/payments — Create payment intent                      */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await validateApiKey(req);

    const body = await req.json();
    const { competition_id, wallet, amount_cents, currency } = body as {
      competition_id?: string;
      wallet?: string;
      amount_cents?: number;
      currency?: string;
    };

    if (!competition_id || !wallet || !amount_cents) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "competition_id, wallet, and amount_cents are required",
        },
        { status: 400 },
      );
    }

    if (typeof amount_cents !== "number" || amount_cents <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount_cents must be a positive integer" },
        { status: 400 },
      );
    }

    // Verify competition exists
    const pool = getPool();
    const { rows: compRows } = await pool.query(
      `SELECT id, org_id FROM competitions WHERE id = $1 LIMIT 1`,
      [competition_id],
    );
    if (compRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Competition not found" },
        { status: 404 },
      );
    }

    // If authenticated via API key, verify org ownership
    if (ctx && compRows[0].org_id && ctx.orgId !== compRows[0].org_id) {
      return NextResponse.json(
        { ok: false, error: "API key does not belong to this competition's org" },
        { status: 403 },
      );
    }

    const paymentId = "pay_" + randomBytes(16).toString("hex");
    const cur = (currency ?? "usd").toLowerCase();

    // Attempt real Stripe session
    const stripe = await createStripeCheckoutSession({
      amount_cents,
      currency: cur,
      payment_id: paymentId,
      competition_id,
      wallet: wallet.toLowerCase(),
    });

    const payment: PaymentRecord = {
      payment_id: paymentId,
      competition_id,
      wallet: wallet.toLowerCase(),
      amount_cents,
      currency: cur,
      status: stripe ? "pending" : "mock",
      checkout_url: stripe?.checkout_url ?? null,
      stripe_session_id: stripe?.session_id ?? null,
      created_at: new Date().toISOString(),
    };

    await appendPayment(competition_id, payment);

    const responseData: Record<string, unknown> = {
      payment_id: payment.payment_id,
      status: payment.status,
      checkout_url: payment.checkout_url,
    };

    if (!stripe) {
      responseData.message =
        "Stripe is not configured. Set STRIPE_SECRET_KEY env var to enable real payments.";
    }

    return NextResponse.json(
      { ok: true, data: responseData },
      { status: 201 },
    );
  } catch (err) {
    console.error("[v1/payments POST]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/v1/payments — List payments for a competition             */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const competitionId = url.searchParams.get("competition_id");

    if (!competitionId) {
      return NextResponse.json(
        { ok: false, error: "competition_id query parameter is required" },
        { status: 400 },
      );
    }

    const payments = await loadPayments(competitionId);

    return NextResponse.json({ ok: true, data: payments });
  } catch (err) {
    console.error("[v1/payments GET]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
