// app/api/blocks/route.ts
import { NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { lightchain, RPC_URL } from "@/lib/lightchain"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean).slice(0, 50)
    if (ids.length === 0) return NextResponse.json({})
    const client = createPublicClient({ chain: lightchain, transport: http(RPC_URL) })
    const out: Record<string, number> = {}
    await Promise.all(ids.map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: BigInt(bn) })
        out[bn] = Number(block.timestamp)
      } catch {}
    }))
    return NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=10" } })
  } catch (e) {
    console.error("[blocks]", e)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}