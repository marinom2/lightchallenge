export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../../offchain/db/pool";
import {
  getDispute,
  resolveDispute,
  withdrawDispute,
} from "../../../../../../offchain/db/disputes";
import { createNotification } from "../../../../../../offchain/db/notifications";

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                       */
/* ------------------------------------------------------------------ */

async function isCompetitionAdmin(
  wallet: string,
  competitionId: string
): Promise<boolean> {
  const pool = getPool();
  const { rows: compRows } = await pool.query(
    `SELECT org_id, created_by FROM public.competitions WHERE id = $1 LIMIT 1`,
    [competitionId]
  );
  if (compRows.length === 0) return false;

  const comp = compRows[0];

  // Creator is always admin
  if (comp.created_by && comp.created_by.toLowerCase() === wallet.toLowerCase()) {
    return true;
  }

  // Check org membership
  if (comp.org_id) {
    const { rows } = await pool.query(
      `SELECT 1 FROM public.org_members
       WHERE org_id = $1 AND lower(wallet) = lower($2) AND role IN ('owner', 'admin')
       LIMIT 1`,
      [comp.org_id, wallet]
    );
    return rows.length > 0;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  GET /api/v1/disputes/[id] — Get dispute detail                     */
/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const dispute = await getDispute(id);

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, dispute });
  } catch (e: any) {
    console.error("[v1/disputes/[id] GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/v1/disputes/[id] — Resolve dispute (admin only)         */
/* ------------------------------------------------------------------ */

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const wallet = req.headers.get("x-lc-address");
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dispute = await getDispute(id);
    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Check admin access via org membership
    const admin = await isCompetitionAdmin(wallet, dispute.competition_id);
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { status, resolution_note } = body;

    const validStatuses = ["under_review", "resolved_upheld", "resolved_denied"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    if (!resolution_note) {
      return NextResponse.json(
        { error: "resolution_note is required" },
        { status: 400 }
      );
    }

    const updated = await resolveDispute(id, wallet, status, resolution_note);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update dispute" }, { status: 500 });
    }

    // Notify the filer about the resolution
    const statusLabel =
      status === "under_review"
        ? "under review"
        : status === "resolved_upheld"
          ? "upheld"
          : "denied";

    await createNotification(
      dispute.filed_by,
      "dispute_resolved",
      `Your dispute has been ${statusLabel}`,
      resolution_note.slice(0, 200),
      { dispute_id: id, match_id: dispute.match_id, status }
    );

    return NextResponse.json({ ok: true, dispute: updated });
  } catch (e: any) {
    console.error("[v1/disputes/[id] PATCH]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/v1/disputes/[id] — Withdraw dispute (filer only)       */
/* ------------------------------------------------------------------ */

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const wallet = req.headers.get("x-lc-address");
    if (!wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const withdrawn = await withdrawDispute(id, wallet);
    if (!withdrawn) {
      return NextResponse.json(
        { error: "Dispute not found, not yours, or not in open status" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, dispute: withdrawn });
  } catch (e: any) {
    console.error("[v1/disputes/[id] DELETE]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
