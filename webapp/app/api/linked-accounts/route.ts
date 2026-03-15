// webapp/app/api/linked-accounts/route.ts
//
// Unified lookup for linked accounts — supports both identity_bindings
// (steam, riot, epic) and linked_accounts (strava, fitbit, garmin).
import { NextRequest, NextResponse } from "next/server";
import { lookup, deleteBinding, type Platform } from "../../../../offchain/identity/registry";
import {
  getLinkedAccount,
  deleteLinkedAccount,
} from "../../../../offchain/db/linkedAccounts";

export const runtime = "nodejs";

/** Providers stored in public.linked_accounts (OAuth token flow). */
const OAUTH_PROVIDERS = new Set(["strava", "fitbit", "garmin"]);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet   = searchParams.get("wallet") as `0x${string}` | null;
    const platform = searchParams.get("platform") || "steam";
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

    // OAuth providers live in linked_accounts table
    if (OAUTH_PROVIDERS.has(platform)) {
      const row = await getLinkedAccount(wallet, platform);
      return NextResponse.json({
        binding: row
          ? {
              platform,
              wallet:     row.subject,
              platformId: row.external_id ?? row.subject,
              handle:     row.external_id ?? null,
              ts:         row.updated_at?.toISOString() ?? null,
            }
          : null,
      });
    }

    // Identity-binding providers (steam, riot, epic)
    const rec = await lookup(wallet, platform as Platform);
    return NextResponse.json({
      binding: rec
        ? {
            platform,
            wallet:     rec.wallet,
            platformId: rec.platformId,
            handle:     rec.handle ?? null,
            ts:         rec.ts,
          }
        : null,
    });
  } catch (e: any) {
    console.error("[linked-accounts GET]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet   = (searchParams.get("wallet") || "").toLowerCase();
    const platform = searchParams.get("platform") || "steam";
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ error: "bad_wallet" }, { status: 400 });
    }

    if (OAUTH_PROVIDERS.has(platform)) {
      await deleteLinkedAccount(wallet, platform);
      return NextResponse.json({ ok: true });
    }

    // Identity-binding providers require auth header
    const { verifyWallet, requireAuth } = await import("@/lib/auth");
    const authWallet = await verifyWallet(req);
    const authErr = requireAuth(authWallet, wallet);
    if (authErr) return authErr;

    await deleteBinding(wallet as `0x${string}`, platform as Platform);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[linked-accounts DELETE]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
