/**
 * GET /api/me/achievements?address=0x...
 *
 * Returns all achievement mints for a wallet address, with challenge metadata.
 *
 * POST /api/me/achievements
 *
 * Records a new achievement mint (called by frontend after on-chain tx).
 * Body: { tokenId, challengeId, recipient, achievementType, txHash, blockNumber }
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";
import {
  upsertAchievementMint,
  recomputeReputation,
} from "../../../../../offchain/db/achievements";
import { verifyWallet, requireAuth } from "@/lib/auth";

type AchWithMeta = {
  token_id: string;
  challenge_id: string;
  recipient: string;
  achievement_type: string;
  tx_hash: string | null;
  minted_at: string;
  title: string | null;
  description: string | null;
};

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(
      { error: "address query param required" },
      { status: 400 }
    );
  }

  const pool = getPool();
  const res = await pool.query<AchWithMeta>(
    `SELECT
       a.token_id, a.challenge_id, a.recipient,
       a.achievement_type, a.tx_hash, a.minted_at,
       c.title, c.description
     FROM public.achievement_mints a
     LEFT JOIN public.challenges c ON c.id = a.challenge_id
     WHERE lower(a.recipient) = lower($1::text)
     ORDER BY a.minted_at DESC`,
    [address]
  );

  return NextResponse.json({ achievements: res.rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tokenId, challengeId, recipient, achievementType, txHash, blockNumber } = body;

  if (!tokenId || !challengeId || !recipient || !achievementType) {
    return NextResponse.json(
      { error: "tokenId, challengeId, recipient, achievementType required" },
      { status: 400 }
    );
  }

  const VALID_TYPES = [
    "completion", "victory", "streak", "first_win", "participation",
    "top_scorer", "undefeated", "comeback", "speedrun", "social",
    "early_adopter", "veteran", "perfectionist", "explorer",
  ];
  if (!VALID_TYPES.includes(achievementType)) {
    return NextResponse.json(
      { error: `achievementType must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Auth: verify wallet matches the achievement recipient
  const authWallet = await verifyWallet(req);
  const authErr = requireAuth(authWallet, recipient);
  if (authErr) return authErr;

  try {
    const mint = await upsertAchievementMint({
      tokenId,
      challengeId,
      recipient,
      achievementType,
      txHash,
      blockNumber,
    });

    // Recompute reputation after mint
    const rep = await recomputeReputation(recipient);

    return NextResponse.json({ ok: true, mint, reputation: rep });
  } catch (e) {
    console.error("[me/achievements POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
