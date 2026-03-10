// webapp/app/api/linked-accounts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { lookup, type Platform } from "../../../../offchain/identity/registry";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

// location used by the registry
const DIR = join(process.cwd(), "offchain", ".state");
const FILE = join(DIR, "identity_bindings.json");

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet") as `0x${string}` | null;
    const platform = (searchParams.get("platform") || "steam") as Platform;
    if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });

    const rec = lookup(wallet, platform);
    return NextResponse.json({
      binding: rec
        ? {
            platform,
            wallet: rec.wallet,
            platformId: rec.platformId,
            handle: rec.handle ?? null,
            ts: rec.ts,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = (searchParams.get("wallet") || "").toLowerCase();
    const platform = (searchParams.get("platform") || "steam") as Platform;
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json({ error: "bad_wallet" }, { status: 400 });
    }

    // hard delete from registry file
    await mkdir(DIR, { recursive: true }).catch(() => {});
    const raw = await readFile(FILE, "utf8").catch(() => "[]");
    const all: any[] = JSON.parse(raw);
    const out = all.filter(
      (e) => !(String(e.wallet).toLowerCase() === wallet && e.platform === platform)
    );
    await writeFile(FILE, JSON.stringify(out, null, 2));

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}