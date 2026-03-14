/**
 * GET /api/achievements/{tokenId}
 *
 * Returns ERC-721 metadata JSON for a soulbound achievement token.
 * This is the tokenURI target — wallets and explorers fetch this.
 *
 * Reads from:
 *   - public.achievement_mints (token → challenge mapping)
 *   - public.challenges (title, description, category)
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "../../../../../offchain/db/pool";

type AchRow = {
  token_id: string;
  challenge_id: string;
  recipient: string;
  achievement_type: string;
  minted_at: string;
};

type ChalRow = {
  title: string | null;
  description: string | null;
  options: Record<string, unknown> | null;
};

const ACHIEVEMENT_LABELS: Record<string, string> = {
  completion: "Completion",
  victory: "Victory",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId } = await params;
  const id = parseInt(tokenId, 10);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: "Invalid token ID" }, { status: 400 });
  }

  const pool = getPool();

  // Fetch achievement mint
  const achRes = await pool.query<AchRow>(
    `SELECT token_id, challenge_id, recipient, achievement_type, minted_at
     FROM public.achievement_mints WHERE token_id = $1 LIMIT 1`,
    [id]
  );

  if (achRes.rows.length === 0) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const ach = achRes.rows[0];

  // Fetch challenge metadata
  const chalRes = await pool.query<ChalRow>(
    `SELECT title, description, options FROM public.challenges WHERE id = $1 LIMIT 1`,
    [ach.challenge_id]
  );

  const chal = chalRes.rows[0];
  const title = chal?.title || `Challenge #${ach.challenge_id}`;
  const label = ACHIEVEMENT_LABELS[ach.achievement_type] || ach.achievement_type;
  const category = (chal?.options as any)?.category || "general";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.lightchallenge.ai";

  const metadata = {
    name: `${label}: ${title}`,
    description: `${label} achievement for "${title}" on LightChallenge, verified by AIVM Proof of Inference.`,
    image: `${baseUrl}/api/achievements/${id}/image`,
    external_url: `${baseUrl}/challenge/${ach.challenge_id}`,
    attributes: [
      { trait_type: "Achievement", value: label },
      { trait_type: "Challenge ID", value: ach.challenge_id, display_type: "number" },
      { trait_type: "Category", value: category },
      {
        trait_type: "Verified At",
        value: Math.floor(new Date(ach.minted_at).getTime() / 1000),
        display_type: "date",
      },
    ],
  };

  return NextResponse.json(metadata, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
