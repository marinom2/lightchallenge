/**
 * GET /api/me/reputation?address=0x...
 *
 * Returns the reputation profile for a wallet address.
 * Includes points, level, completions, victories.
 */

import { NextRequest, NextResponse } from "next/server";
import { getReputation } from "../../../../../offchain/db/achievements";

const LEVEL_NAMES: Record<number, string> = {
  1: "Newcomer",
  2: "Challenger",
  3: "Competitor",
  4: "Champion",
  5: "Legend",
};

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(
      { error: "address query param required" },
      { status: 400 }
    );
  }

  const rep = await getReputation(address);

  if (!rep) {
    return NextResponse.json({
      subject: address.toLowerCase(),
      points: 0,
      level: 1,
      levelName: LEVEL_NAMES[1],
      completions: 0,
      victories: 0,
    });
  }

  return NextResponse.json({
    ...rep,
    levelName: LEVEL_NAMES[rep.level] || `Level ${rep.level}`,
  });
}
