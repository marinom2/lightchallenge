// webapp/app/api/rpc/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UPSTREAM =
  process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";

// Optional simple GET health check: /api/rpc?ping=1
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.has("ping")) {
    return NextResponse.json({ ok: true, upstream: UPSTREAM });
  }
  return NextResponse.json({ error: "Use POST JSON-RPC" }, { status: 405 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25_000); // 25s hard timeout

    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: ac.signal,
      // keepalive is ignored on Node but harmless:
      keepalive: true,
    }).catch((err) => {
      // Surface network-level errors
      console.error("[rpc proxy] fetch error:", err);
      throw err;
    });

    clearTimeout(t);

    const text = await res.text();

    // Pass-through status/headers; include upstream error body if not ok
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[rpc proxy] fatal:", err?.message || err);
    return NextResponse.json(
      {
        error: "RPC proxy error",
        details: String(err?.message ?? err),
        upstream: UPSTREAM,
      },
      { status: 502 }
    );
  }
}