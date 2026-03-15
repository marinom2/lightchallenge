import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";
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

  const token = authHeader.slice(7); // strip "Bearer "
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
/*  POST /api/v1/competitions — Create competition                     */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      description,
      type: rawType,
      category,
      rules,
      prize_config,
      prize_distribution,
      settings,
      max_participants,
      registration_opens_at,
      registration_opens,
      registration_closes_at,
      registration_closes,
      starts_at,
      ends_at,
      org_id,
    } = body;

    if (!title || !rawType) {
      return NextResponse.json(
        { error: "title and type are required" },
        { status: 400 }
      );
    }

    // Map frontend type names to DB-valid types
    const TYPE_MAP: Record<string, string> = {
      single: "challenge",
      bracket: "bracket",
      round_robin: "league",
      circuit: "circuit",
      // Also allow direct DB types
      challenge: "challenge",
      league: "league",
      ladder: "ladder",
    };
    const type = TYPE_MAP[rawType] || rawType;

    // Merge prize_distribution into prize_config if provided
    const mergedPrizeConfig = prize_config || prize_distribution || null;

    // Resolve registration dates (accept both naming conventions)
    const regOpensAt = registration_opens_at || registration_opens || null;
    const regClosesAt = registration_closes_at || registration_closes || null;

    // Build settings with max_participants if provided
    const mergedSettings = {
      ...(settings || {}),
      ...(max_participants ? { max_participants } : {}),
    };

    // Determine org ownership
    let ownerOrgId = org_id ?? null;
    let ownerWallet: string | null = null;

    if (auth.type === "api_key") {
      ownerOrgId = ownerOrgId ?? auth.org_id;
    } else {
      ownerWallet = auth.wallet;
      // If org_id provided, verify wallet is member/owner of org
      if (ownerOrgId) {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT 1 FROM org_members WHERE org_id = $1 AND lower(wallet) = $2 AND role IN ('owner','admin') LIMIT 1`,
          [ownerOrgId, auth.wallet]
        );
        if (rows.length === 0) {
          return NextResponse.json(
            { error: "Not an admin of this organization" },
            { status: 403 }
          );
        }
      }
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO competitions (
        title, description, type, category, rules, prize_config, settings,
        registration_opens_at, registration_closes_at, starts_at, ends_at,
        org_id, created_by, status
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
        $8, $9, $10, $11,
        $12, $13, 'draft'
      ) RETURNING *`,
      [
        title,
        description ?? null,
        type,
        category ?? null,
        JSON.stringify(rules || {}),
        JSON.stringify(mergedPrizeConfig || {}),
        JSON.stringify(mergedSettings),
        regOpensAt,
        regClosesAt,
        starts_at ?? null,
        ends_at ?? null,
        ownerOrgId,
        ownerWallet,
      ]
    );

    return NextResponse.json({ ok: true, competition: rows[0] }, { status: 201 });
  } catch (e: any) {
    console.error("[v1/competitions POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/v1/competitions — List competitions                       */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const org_id = url.searchParams.get("org_id");
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

    const conditions: string[] = [];
    const values: any[] = [];

    if (org_id) {
      values.push(org_id);
      conditions.push(`org_id = $${values.length}`);
    }
    if (type) {
      values.push(type);
      conditions.push(`type = $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    values.push(limit, offset);
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT c.*,
        (SELECT count(*)::int FROM competition_registrations WHERE competition_id = c.id) AS participant_count,
        (c.settings->>'max_participants')::int AS max_participants
       FROM competitions c ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );

    const countRes = await pool.query(
      `SELECT count(*)::int as total FROM competitions ${whereClause}`,
      values.slice(0, values.length - 2) // exclude limit/offset
    );

    return NextResponse.json({
      competitions: rows,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (e: any) {
    console.error("[v1/competitions GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
