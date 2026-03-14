/**
 * POST /api/reminders
 *
 * Create a reminder notification request.
 * Body: { email: string, challengeId: string, type: "proof_window_open" | "proof_closing_soon" | "verification_complete" }
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { sslConfig } from "../../../../offchain/db/sslConfig";
import { verifyWallet, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["proof_window_open", "proof_closing_soon", "verification_complete"];

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is missing");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
});

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function POST(req: NextRequest) {
  try {
    // Auth: require any authenticated wallet (no subject check)
    const authWallet = await verifyWallet(req);
    const authErr = requireAuth(authWallet);
    if (authErr) return authErr;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { email, challengeId, type } = body as {
      email?: string;
      challengeId?: string;
      type?: string;
    };

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!challengeId || !/^\d+$/.test(String(challengeId))) {
      return NextResponse.json({ error: "Valid challengeId is required" }, { status: 400 });
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    await pool.query(
      `
      INSERT INTO public.reminders (email, challenge_id, type)
      VALUES (lower($1), $2::bigint, $3)
      ON CONFLICT (lower(email), challenge_id, type) DO NOTHING
      `,
      [email.trim(), challengeId, type]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[reminders]", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
