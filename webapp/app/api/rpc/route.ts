// webapp/app/api/rpc/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UPSTREAM =
  process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";

const SAFE_RPC_METHODS = new Set([
  "eth_call",
  "eth_getBalance",
  "eth_blockNumber",
  "eth_chainId",
  "eth_getLogs",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getCode",
  "net_version",
]);

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

    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!SAFE_RPC_METHODS.has(parsed.method)) {
      return NextResponse.json({ error: "Method not allowed" }, { status: 403 });
    }

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
  } catch (err) {
    console.error("[rpc proxy]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}