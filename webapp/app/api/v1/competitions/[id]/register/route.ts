import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../../offchain/db/pool";
import { emitWebhookEvent } from "../../../../../../../offchain/workers/webhookDelivery";
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
/*  POST /api/v1/competitions/[id]/register                            */
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

    if (competition.status !== "registration") {
      return NextResponse.json(
        { error: "Competition is not accepting registrations (status: " + competition.status + ")" },
        { status: 409 }
      );
    }

    // Check max_participants from settings
    const maxParticipants = competition.settings?.max_participants;
    if (maxParticipants) {
      const { rows: countRows } = await pool.query(
        `SELECT count(*)::int AS cnt FROM competition_registrations WHERE competition_id = $1`,
        [id]
      );
      if (countRows[0].cnt >= maxParticipants) {
        return NextResponse.json(
          { error: "Competition is full (max: " + maxParticipants + ")" },
          { status: 409 }
        );
      }
    }

    const body = await req.json();
    const wallet = body.wallet ?? (auth.type === "wallet" ? auth.wallet : null);
    const team_id = body.team_id ?? null;
    const seed = body.seed ?? null;

    if (!wallet && !team_id) {
      return NextResponse.json(
        { error: "Either wallet or team_id is required" },
        { status: 400 }
      );
    }

    // Check for duplicate registration
    if (wallet) {
      const { rows: dupRows } = await pool.query(
        `SELECT 1 FROM competition_registrations WHERE competition_id = $1 AND lower(wallet) = lower($2) LIMIT 1`,
        [id, wallet]
      );
      if (dupRows.length > 0) {
        return NextResponse.json(
          { error: "Already registered" },
          { status: 409 }
        );
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO competition_registrations (competition_id, wallet, team_id, seed)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, wallet?.toLowerCase() ?? null, team_id, seed]
    );

    if (competition.org_id) {
      emitWebhookEvent(competition.org_id, "competition.registration", {
        competition_id: id,
        wallet: wallet ?? null,
        team_id: team_id ?? null,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, registration: rows[0] }, { status: 201 });
  } catch (e: any) {
    console.error("[v1/competitions/[id]/register POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/v1/competitions/[id]/register — List registrations        */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const pool = getPool();

    const { rows: compRows } = await pool.query(
      `SELECT 1 FROM competitions WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (compRows.length === 0) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }

    const { rows } = await pool.query(
      `SELECT * FROM competition_registrations
       WHERE competition_id = $1
       ORDER BY seed ASC NULLS LAST, registered_at ASC`,
      [id]
    );

    return NextResponse.json({ registrations: rows });
  } catch (e: any) {
    console.error("[v1/competitions/[id]/register GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
