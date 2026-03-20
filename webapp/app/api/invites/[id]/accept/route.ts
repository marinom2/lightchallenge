/**
 * webapp/app/api/invites/[id]/accept/route.ts
 *
 * POST /api/invites/{id}/accept
 *
 * Returns invite details so the client can navigate the user to the real
 * challenge join flow. Does NOT mark the invite as "joined" — that happens
 * automatically when the participant POST fires after a successful on-chain
 * join transaction.
 *
 * For wallet invites, the authenticated wallet must match the invite's value.
 * For email/steam invites, any authenticated wallet can accept.
 *
 * Also available as GET (unauthenticated) — returns basic invite info for
 * preview purposes (e.g., email deep links).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyWallet, requireAuth } from "@/lib/auth";
import { getPool } from "../../../../../../offchain/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InviteRow = {
  id: string;
  challenge_id: string;
  method: string;
  value: string;
  status: string;
  inviter_wallet: string | null;
};

/**
 * GET /api/invites/{id}/accept
 *
 * Unauthenticated preview — returns basic invite + challenge info
 * so the frontend can show "You've been invited to X" before the user
 * connects a wallet.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } }
) {
  const inviteId = ctx.params.id;
  if (!inviteId || inviteId.length < 10) {
    return NextResponse.json({ error: "Invalid invite ID" }, { status: 400 });
  }

  const pool = getPool();

  try {
    const { rows } = await pool.query<InviteRow>(
      `SELECT id, challenge_id, method, value, status, inviter_wallet
       FROM public.challenge_invites WHERE id = $1`,
      [inviteId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    const invite = rows[0];

    // Fetch challenge title for preview
    const chRes = await pool.query<{ title: string }>(
      `SELECT title FROM public.challenges WHERE id = $1::bigint`,
      [invite.challenge_id]
    );
    const challengeTitle = chRes.rows[0]?.title || `Challenge #${invite.challenge_id}`;

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        challengeId: invite.challenge_id,
        method: invite.method,
        status: invite.status,
      },
      challengeTitle,
    });
  } catch (err) {
    console.error("[invites accept GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/invites/{id}/accept
 *
 * Authenticated — validates the invite, returns the challenge ID so the
 * client routes the user into the real join flow.
 *
 * The invite is NOT marked as "joined" here. That happens in the participant
 * POST endpoint after the on-chain join tx succeeds.
 */
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
    const { rows } = await pool.query<InviteRow>(
      `SELECT id, challenge_id, method, value, status, inviter_wallet
       FROM public.challenge_invites WHERE id = $1`,
      [inviteId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    const invite = rows[0];

    // Already joined — success, just return the challenge ID
    if (invite.status === "joined") {
      return NextResponse.json({
        ok: true,
        alreadyJoined: true,
        challengeId: invite.challenge_id,
      });
    }

    // Terminal states
    if (invite.status === "expired" || invite.status === "failed") {
      return NextResponse.json(
        { error: `Invite is ${invite.status}` },
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

    // Return challenge info — the client navigates to /challenge/{id}?invite={inviteId}
    // where the normal join flow handles the on-chain tx
    return NextResponse.json({
      ok: true,
      challengeId: invite.challenge_id,
      inviteId: invite.id,
      // Tell the client to navigate to the join flow
      joinUrl: `/challenge/${invite.challenge_id}?invite=${invite.id}`,
    });
  } catch (err) {
    console.error("[invites accept POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
