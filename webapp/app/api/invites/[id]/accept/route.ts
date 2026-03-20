/**
 * webapp/app/api/invites/[id]/accept/route.ts
 *
 * POST /api/invites/{id}/accept
 *
 * Accepts a challenge invite. Auth: wallet signature required.
 * For wallet invites, the authenticated wallet must match the invite's value.
 * For email/steam invites, any authenticated wallet can accept.
 *
 * Transitions invite status: sent → accepted
 * Notifies the inviter (if stored) that their invite was accepted.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWallet, requireAuth } from "@/lib/auth";
import { getPool } from "../../../../../../offchain/db/pool";
import { createNotification } from "../../../../../../offchain/db/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const inviteId = ctx.params.id;
  if (!inviteId || inviteId.length < 10) {
    return NextResponse.json({ error: "Invalid invite ID" }, { status: 400 });
  }

  // Auth: require authenticated wallet
  const wallet = await verifyWallet(req);
  const authErr = requireAuth(wallet);
  if (authErr) return authErr;

  const pool = getPool();

  try {
    // Fetch the invite
    const { rows } = await pool.query<{
      id: string;
      challenge_id: string;
      method: string;
      value: string;
      status: string;
      inviter_wallet: string | null;
    }>(
      `SELECT id, challenge_id, method, value, status, inviter_wallet
       FROM public.challenge_invites WHERE id = $1`,
      [inviteId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    const invite = rows[0];

    if (invite.status === "accepted") {
      return NextResponse.json({ ok: true, message: "Already accepted" });
    }

    if (invite.status !== "sent") {
      return NextResponse.json(
        { error: `Invite cannot be accepted (status: ${invite.status})` },
        { status: 409 }
      );
    }

    // For wallet invites, the accepting wallet must match the invite value
    if (
      invite.method === "wallet" &&
      wallet!.address.toLowerCase() !== invite.value.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "This invite is for a different wallet" },
        { status: 403 }
      );
    }

    // Update status → accepted
    await pool.query(
      `UPDATE public.challenge_invites SET status = 'accepted', updated_at = now() WHERE id = $1`,
      [inviteId]
    );

    // Notify the inviter (best-effort)
    if (invite.inviter_wallet) {
      try {
        const addr = wallet!.address.slice(0, 6) + "…" + wallet!.address.slice(-4);
        const titleRes = await pool.query<{ title: string }>(
          `SELECT title FROM public.challenges WHERE id = $1::bigint`,
          [invite.challenge_id]
        );
        const challengeTitle =
          titleRes.rows[0]?.title || `Challenge #${invite.challenge_id}`;

        await createNotification(
          invite.inviter_wallet.toLowerCase(),
          "invite_accepted",
          `Invite accepted — ${challengeTitle}`,
          `${addr} accepted your invite to "${challengeTitle}".`,
          {
            challengeId: invite.challenge_id,
            inviteId: invite.id,
            tier: `invite_accepted_${invite.id.slice(0, 8)}`,
            deepLink: `lightchallengeapp://challenge/${invite.challenge_id}`,
          },
          pool
        );
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({ ok: true, challengeId: invite.challenge_id });
  } catch (err) {
    console.error("[invites accept]", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
