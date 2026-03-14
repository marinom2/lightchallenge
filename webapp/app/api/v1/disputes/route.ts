export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";
import {
  fileDispute,
  listDisputes,
  type DisputeStatus,
} from "../../../../../offchain/db/disputes";
import { createNotification } from "../../../../../offchain/db/notifications";

/* ------------------------------------------------------------------ */
/*  POST /api/v1/disputes — File a dispute                             */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const wallet = req.headers.get("x-lc-address");
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { match_id, competition_id, reason, evidence_url } = body;

    if (!match_id || !competition_id || !reason) {
      return NextResponse.json(
        { error: "match_id, competition_id, and reason are required" },
        { status: 400 }
      );
    }

    // Verify match exists and belongs to competition
    const pool = getPool();
    const { rows: matchRows } = await pool.query(
      `SELECT id FROM public.bracket_matches WHERE id = $1 AND competition_id = $2 LIMIT 1`,
      [match_id, competition_id]
    );
    if (matchRows.length === 0) {
      return NextResponse.json(
        { error: "Match not found in this competition" },
        { status: 404 }
      );
    }

    const dispute = await fileDispute(
      match_id,
      competition_id,
      wallet,
      reason,
      evidence_url ?? null
    );

    // Notify competition admins about the dispute
    const { rows: compRows } = await pool.query(
      `SELECT org_id, created_by FROM public.competitions WHERE id = $1 LIMIT 1`,
      [competition_id]
    );
    if (compRows.length > 0) {
      const comp = compRows[0];
      const adminWallets: string[] = [];

      if (comp.created_by) adminWallets.push(comp.created_by);

      if (comp.org_id) {
        const { rows: members } = await pool.query(
          `SELECT wallet FROM public.org_members WHERE org_id = $1 AND role IN ('owner', 'admin')`,
          [comp.org_id]
        );
        for (const m of members) {
          if (!adminWallets.includes(m.wallet.toLowerCase())) {
            adminWallets.push(m.wallet.toLowerCase());
          }
        }
      }

      for (const adminWallet of adminWallets) {
        await createNotification(
          adminWallet,
          "dispute_filed",
          "New match dispute filed",
          `A dispute has been filed for match ${match_id}: ${reason.slice(0, 100)}`,
          { dispute_id: dispute.id, match_id, competition_id }
        );
      }
    }

    return NextResponse.json({ ok: true, dispute }, { status: 201 });
  } catch (e: any) {
    console.error("[v1/disputes POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/v1/disputes — List disputes                               */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const competition_id = url.searchParams.get("competition_id") ?? undefined;
    const status = url.searchParams.get("status") as DisputeStatus | null;

    const disputes = await listDisputes(
      competition_id ?? null,
      status ?? null
    );

    return NextResponse.json({ ok: true, disputes });
  } catch (e: any) {
    console.error("[v1/disputes GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
