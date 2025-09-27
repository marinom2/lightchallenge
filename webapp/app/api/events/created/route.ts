import { NextResponse } from "next/server"
import { createPublicClient, http } from "viem"
import { lightchain } from "@/lib/lightchain"
import { ADDR, ABI } from "@/lib/contracts"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const fromBlock = from ? BigInt(from) : 0n
  const toBlock = to ? BigInt(to) : (await getLatest()) // head by default

  const client = createPublicClient({ chain: lightchain, transport: http(lightchain.rpcUrls.default.http[0]!) })

  const logs = await client.getLogs({
    address: ADDR.ChallengePay,
    event: {
      type: "event",
      name: "ChallengeCreated",
      inputs: [
        { indexed: true, name: "id", type: "uint256" },
        { indexed: true, name: "creator", type: "address" },
        { indexed: false, name: "stake", type: "uint256" },
      ],
    } as any,
    fromBlock,
    toBlock,
  })

  const data = logs.map((l) => ({
    blockNumber: l.blockNumber,
    tx: l.transactionHash,
    // @ts-ignore
    args: l.args,
  }))

  const res = NextResponse.json({ data })
  res.headers.set("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60")
  return res
}

async function getLatest() {
  const res = await fetch(lightchain.rpcUrls.default.http[0]!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  })
  const j = await res.json()
  return BigInt(j.result)
}