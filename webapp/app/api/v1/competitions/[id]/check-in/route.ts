import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import { createHash } from "crypto";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                       */
/* ------------------------------------------------------------------ */

async function authenticateApiKey(
  req: NextRequest
): Promise<{ org_id: string; scopes: string[] } | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer lc_")) return null;

  const token = authHeader.slice(7);
  const hash = createHash("sha256").update(token).digest("hex");

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT org_id, scopes FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL LIMIT 1`,
    [hash]
  );
  if (rows.length === 0) return null;
  return { org_id: rows[0].org_id, scopes: rows[0].scopes ?? [] };
}

async function authenticateWallet(
  req: NextRequest
): Promise<{ wallet: string } | null> {
  const wallet = req.headers.get("x-lc-address");
  if (!wallet) return null;
  return { wallet: wallet.toLowerCase() };
}

async function requireAuth(req: NextRequest): Promise<
  | { type: "api_key"; org_id: string; scopes: string[] }
  | { type: "wallet"; wallet: string }
  | null
> {
  const apiKey = await authenticateApiKey(req);
  if (apiKey) return { type: "api_key", ...apiKey };

  const walletAuth = await authenticateWallet(req);
  if (walletAuth) return { type: "wallet", ...walletAuth };

  return null;
}

/* ------------------------------------------------------------------ */
/*  POST /api/v1/competitions/[id]/check-in                            */
/* ------------------------------------------------------------------ */

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const auth = await requireAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = getPool();

    // Fetch competition
    const { rows: compRows } = await pool.query(
      `SELECT * FROM competitions WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (compRows.length === 0) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }

    const competition = compRows[0];

    if (competition.status !== "registration" && competition.status !== "active") {
      return NextResponse.json(
        { error: "Check-in is only available during registration or active status" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const wallet = body.wallet ?? (auth.type === "wallet" ? auth.wallet : null);

    if (!wallet) {
      return NextResponse.json({ error: "wallet is required" }, { status: 400 });
    }

    // Update registration
    const { rows, rowCount } = await pool.query(
      `UPDATE competition_registrations
       SET checked_in = true, checked_in_at = now(), updated_at = now()
       WHERE competition_id = $1 AND lower(wallet) = lower($2)
       RETURNING *`,
      [id, wallet]
    );

    if (!rowCount || rowCount === 0) {
      return NextResponse.json(
        { error: "Registration not found for this wallet" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, registration: rows[0] });
  } catch (e: any) {
    console.error("[v1/competitions/[id]/check-in POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
