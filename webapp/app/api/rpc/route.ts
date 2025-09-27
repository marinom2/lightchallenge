// webapp/app/api/rpc/route.ts
import { NextRequest, NextResponse } from "next/server"

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://light-testnet-rpc.lightchain.ai"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      // keepalive helps with slow networks
      cache: "no-store",
    })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: "RPC proxy error", details: String(err?.message ?? err) },
      { status: 502 },
    )
  }
}