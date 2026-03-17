/**
 * GET  /api/me/profile?address=0x...  — Read user profile
 * PUT  /api/me/profile                — Update display name / bio (JSON body)
 *
 * Body for PUT: { wallet: "0x...", displayName?: string, bio?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getUserProfile,
  upsertUserProfile,
} from "../../../../../offchain/db/userProfiles";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json(
      { error: "address query param required" },
      { status: 400 }
    );
  }

  const profile = await getUserProfile(address);
  if (!profile) {
    // Return empty profile skeleton
    return NextResponse.json({
      wallet: address.toLowerCase(),
      display_name: null,
      bio: null,
      has_avatar: false,
      avatar_url: null,
    });
  }

  return NextResponse.json(profile);
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, displayName, bio } = body;

    if (!wallet || typeof wallet !== "string" || !wallet.startsWith("0x")) {
      return NextResponse.json(
        { error: "valid wallet address required" },
        { status: 400 }
      );
    }

    // Validate bio length
    if (bio && typeof bio === "string" && bio.length > 500) {
      return NextResponse.json(
        { error: "bio must be 500 characters or less" },
        { status: 400 }
      );
    }

    // Validate display name length
    if (displayName && typeof displayName === "string" && displayName.length > 50) {
      return NextResponse.json(
        { error: "display name must be 50 characters or less" },
        { status: 400 }
      );
    }

    const profile = await upsertUserProfile({ wallet, displayName, bio });
    return NextResponse.json(profile);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "internal error" },
      { status: 500 }
    );
  }
}
