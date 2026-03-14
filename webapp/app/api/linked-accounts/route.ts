// webapp/app/api/linked-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { lookup, deleteBinding, type Platform } from "../../../../offchain/identity/registry";
import { verifyWallet, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet   = searchParams.get("wallet") as `0x${string}` | null;
    const platform = (searchParams.get("platform") || "steam") as Platform;
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

    const rec = await lookup(wallet, platform);
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
    const platform = (searchParams.get("platform") || "steam") as Platform;
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ error: "bad_wallet" }, { status: 400 });
    }

    // Auth: verify wallet matches the wallet query param
    const authWallet = await verifyWallet(req);
    const authErr = requireAuth(authWallet, wallet);
    if (authErr) return authErr;

    await deleteBinding(wallet as `0x${string}`, platform);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[linked-accounts DELETE]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
