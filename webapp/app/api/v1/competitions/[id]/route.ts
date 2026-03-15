import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";
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

async function canManageCompetition(
  auth: { type: "api_key"; org_id: string; scopes: string[] } | { type: "wallet"; wallet: string },
  competition: any
): Promise<boolean> {
  if (auth.type === "api_key") {
    return auth.org_id === competition.org_id;
  }
  // Wallet auth: must be creator or org admin
  if (competition.created_by && competition.created_by.toLowerCase() === auth.wallet) {
    return true;
  }
  if (competition.org_id) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT 1 FROM org_members WHERE org_id = $1 AND lower(wallet) = $2 AND role IN ('owner','admin') LIMIT 1`,
      [competition.org_id, auth.wallet]
    );
    return rows.length > 0;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  GET /api/v1/competitions/[id]                                      */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const pool = getPool();

    const { rows } = await pool.query(
      `SELECT c.*,
        (SELECT count(*)::int FROM competition_registrations WHERE competition_id = c.id) AS participant_count,
        (SELECT count(*)::int FROM bracket_matches WHERE competition_id = c.id) AS match_count,
        (c.settings->>'max_participants')::int AS max_participants
       FROM competitions c
       WHERE c.id = $1
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }

    return NextResponse.json({ competition: rows[0] });
  } catch (e: any) {
    console.error("[v1/competitions/[id] GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/v1/competitions/[id] — Update (draft only)              */
/* ------------------------------------------------------------------ */

export async function PATCH(
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
    const { rows: existing } = await pool.query(
      `SELECT * FROM competitions WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }

    const competition = existing[0];

    if (!(await canManageCompetition(auth, competition))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (competition.status !== "draft") {
      return NextResponse.json(
        { error: "Can only update competitions in draft status" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const updatable = [
      "title", "description", "type", "category", "status",
      "registration_opens_at", "registration_closes_at", "starts_at", "ends_at",
    ];
    const jsonUpdatable = ["rules", "prize_config", "settings"];

    const sets: string[] = [];
    const values: any[] = [];

    for (const key of updatable) {
      if (body[key] !== undefined) {
        values.push(body[key]);
        sets.push(`${key} = $${values.length}`);
      }
    }
    for (const key of jsonUpdatable) {
      if (body[key] !== undefined) {
        values.push(JSON.stringify(body[key]));
        sets.push(`${key} = $${values.length}::jsonb`);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    sets.push("updated_at = now()");
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE competitions SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );

    return NextResponse.json({ ok: true, competition: rows[0] });
  } catch (e: any) {
    console.error("[v1/competitions/[id] PATCH]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/v1/competitions/[id] — Cancel                          */
/* ------------------------------------------------------------------ */

export async function DELETE(
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
    const { rows: existing } = await pool.query(
      `SELECT c.*, (SELECT count(*)::int FROM competition_registrations WHERE competition_id = c.id) AS reg_count
       FROM competitions c WHERE c.id = $1 LIMIT 1`,
      [id]
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }

    const competition = existing[0];

    if (!(await canManageCompetition(auth, competition))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (competition.status !== "draft" && competition.reg_count > 0) {
      return NextResponse.json(
        { error: "Cannot cancel a competition with registrations unless it is in draft status" },
        { status: 409 }
      );
    }

    const { rows } = await pool.query(
      `UPDATE competitions SET status = 'canceled', updated_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );

    return NextResponse.json({ ok: true, competition: rows[0] });
  } catch (e: any) {
    console.error("[v1/competitions/[id] DELETE]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
