// webapp/app/api/dashboard/route.ts
import { NextResponse } from "next/server"
import {
  createPublicClient,
  http,
  decodeEventLog,
  getAbiItem,
  type Abi,
  type AbiEvent,
  type Address,
} from "viem"
import { RPC_URL, lightchain } from "@/lib/lightchain"
import { ABI, ADDR } from "@/lib/contracts"

// ---- Types the client will receive ----
type Row = {
  id: string
  creator?: Address
  startTs?: string
  blockNumber: string
  txHash: `0x${string}`
  status: "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused"
  winnersClaimed?: string // count if we can infer from events
}

// KPIs based on rolled-up state in this window
type Kpis = {
  pending: number
  active: number
  unclaimed: number
  approved: number
  finalized: number
}

type ApiOut = {
  kpis: Kpis
  items: Row[]
  fromBlock: string
  toBlock: string
  hasMore: boolean
}

// ---- Helpers ----
const abi: Abi = ABI.ChallengePay
const address = ADDR.ChallengePay

function ev(abi: Abi, name: string): AbiEvent {
  // If your ABI doesn't contain some event names, this cast is safe only if present.
  // We'll guard at runtime below.
  return getAbiItem({ abi, name }) as AbiEvent
}

function safeDecodeCreated(l: any) {
  try {
    const dec = decodeEventLog({ abi, data: l.data, topics: l.topics })
    if (dec.eventName !== "ChallengeCreated") return null
    const args = dec.args as any
    // Try to extract common fields; if not present, leave undefined
    const id = args?.id as bigint
    const creator = (args?.creator ?? args?.owner) as Address | undefined
    const startTs =
      (typeof args?.startTs === "bigint" ? args.startTs : undefined) ??
      (typeof args?.challenge?.startTs === "bigint" ? args.challenge.startTs : undefined)
    return {
      id,
      creator,
      startTs: startTs as bigint | undefined,
    }
  } catch {
    return null
  }
}

function safeDecodeIdOnly(expectedName: string, l: any): { id?: bigint } {
  try {
    const dec = decodeEventLog({ abi, data: l.data, topics: l.topics })
    if (dec.eventName !== expectedName) return {}
    const args = dec.args as any
    return { id: args?.id as bigint }
  } catch {
    return {}
  }
}

function safeDecodeWinnerClaimed(l: any): { id?: bigint } {
  try {
    const dec = decodeEventLog({ abi, data: l.data, topics: l.topics })
    if (dec.eventName !== "WinnerClaimed") return {}
    const args = dec.args as any
    return { id: args?.challengeId as bigint } // sometimes named challengeId
  } catch {
    return {}
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const spanParam = url.searchParams.get("span")
  const toBlockParam = url.searchParams.get("toBlock")
  const span = spanParam ? BigInt(spanParam) : 10_000n

  try {
    if (!RPC_URL) {
      return NextResponse.json({ error: "Missing RPC_URL" }, { status: 500 })
    }

    const client = createPublicClient({
      chain: lightchain,
      transport: http(RPC_URL),
    })

    const latest = await client.getBlockNumber()
    const toBlock = toBlockParam ? BigInt(toBlockParam) : latest
    const fromBlock = toBlock > span ? toBlock - span : 0n

    // ---- Query logs per event (more reliable on some RPCs) ----
    // NOTE: If some of these events do not exist in your ABI, comment them out.
    const queries: { key: string; event?: AbiEvent }[] = [
      { key: "ChallengeCreated", event: ev(abi, "ChallengeCreated") },
      { key: "StatusBecameApproved", event: ev(abi, "StatusBecameApproved") },
      { key: "StatusBecameRejected", event: ev(abi, "StatusBecameRejected") },
      { key: "Finalized", event: ev(abi, "Finalized") },
      { key: "Canceled", event: ev(abi, "Canceled") },
      { key: "Paused", event: ev(abi, "Paused") },
      { key: "WinnerClaimed", event: ev(abi, "WinnerClaimed") },
      // If your contract uses different names, adjust above.
    ]

    const results = await Promise.all(
      queries.map(async ({ key, event }) => {
        if (!event) return { key, logs: [] as any[] }
        const logs = await client.getLogs({ address, event, fromBlock, toBlock })
        return { key, logs }
      })
    )

    // ---- Reduce per-challenge state ----
    type State = {
      id: bigint
      creator?: Address
      startTs?: bigint
      createdBlock?: bigint
      createdTx?: `0x${string}`
      status?: Row["status"]
      approved?: boolean
      rejected?: boolean
      finalized?: boolean
      canceled?: boolean
      paused?: boolean
      winnersClaimed?: number
      lastBlock?: bigint
    }

    const byId = new Map<bigint, State>()

    // Created
    for (const l of results.find(r => r.key === "ChallengeCreated")!.logs) {
      const info = safeDecodeCreated(l)
      if (!info?.id) continue
      const s = byId.get(info.id) ?? { id: info.id, winnersClaimed: 0 }
      if (info.creator) s.creator = info.creator
      if (info.startTs !== undefined) s.startTs = info.startTs
      s.createdBlock = l.blockNumber!
      s.createdTx = l.transactionHash!
      s.status = "Pending"
      s.lastBlock = l.blockNumber!
      byId.set(info.id, s)
    }

    // Status flips
    for (const l of results.find(r => r.key === "StatusBecameApproved")!.logs) {
      const { id } = safeDecodeIdOnly("StatusBecameApproved", l)
      if (!id) continue
      const s = byId.get(id) ?? { id, winnersClaimed: 0 }
      s.approved = true
      s.rejected = false
      s.status = "Approved"
      s.lastBlock = l.blockNumber!
      byId.set(id, s)
    }
    for (const l of results.find(r => r.key === "StatusBecameRejected")!.logs) {
      const { id } = safeDecodeIdOnly("StatusBecameRejected", l)
      if (!id) continue
      const s = byId.get(id) ?? { id, winnersClaimed: 0 }
      s.rejected = true
      s.approved = false
      s.status = "Rejected"
      s.lastBlock = l.blockNumber!
      byId.set(id, s)
    }
    for (const l of results.find(r => r.key === "Finalized")!.logs) {
      const { id } = safeDecodeIdOnly("Finalized", l)
      if (!id) continue
      const s = byId.get(id) ?? { id, winnersClaimed: 0 }
      s.finalized = true
      s.status = "Finalized"
      s.lastBlock = l.blockNumber!
      byId.set(id, s)
    }
    for (const l of results.find(r => r.key === "Canceled")!.logs) {
      const { id } = safeDecodeIdOnly("Canceled", l)
      if (!id) continue
      const s = byId.get(id) ?? { id, winnersClaimed: 0 }
      s.canceled = true
      s.status = "Canceled"
      s.lastBlock = l.blockNumber!
      byId.set(id, s)
    }
    for (const l of results.find(r => r.key === "Paused")!.logs) {
      const { id } = safeDecodeIdOnly("Paused", l)
      if (!id) continue
      const s = byId.get(id) ?? { id, winnersClaimed: 0 }
      s.paused = true
      s.status = "Paused"
      s.lastBlock = l.blockNumber!
      byId.set(id, s)
    }
    for (const l of results.find(r => r.key === "WinnerClaimed")!.logs) {
      const { id } = safeDecodeWinnerClaimed(l)
      if (!id) continue
      const s = byId.get(id) ?? { id, winnersClaimed: 0 }
      s.winnersClaimed = (s.winnersClaimed ?? 0) + 1
      s.lastBlock = l.blockNumber!
      byId.set(id, s)
    }

    // ---- Compute rows + KPIs ----
    const nowSec = Math.floor(Date.now() / 1000)
    let pending = 0
    let approved = 0
    let active = 0
    let finalized = 0
    let unclaimed = 0 // approximation: count challenges that are finalized but (winnersClaimed ?? 0) === 0

    const rows: Row[] = []
    const entries = [...byId.values()]
    // newest first by createdBlock (fallback to lastBlock)
    entries.sort((a, b) => Number((b.createdBlock ?? b.lastBlock ?? 0n) - (a.createdBlock ?? a.lastBlock ?? 0n)))

    for (const s of entries) {
      const status = s.status ?? "Pending"
      if (status === "Pending") pending++
      if (status === "Approved") approved++
      if (status === "Finalized") finalized++
      // Active heuristic: approved, not canceled/paused/finalized, and startTs <= now
      if (s.approved && !s.canceled && !s.paused && !s.finalized) {
        if (s.startTs && Number(s.startTs) <= nowSec) active++
      }
      if (s.finalized && (s.winnersClaimed ?? 0) === 0) unclaimed++

      rows.push({
        id: s.id.toString(),
        creator: s.creator,
        startTs: s.startTs ? s.startTs.toString() : undefined,
        blockNumber: (s.createdBlock ?? s.lastBlock ?? 0n).toString(),
        txHash: (s.createdTx ?? "0x") as `0x${string}`,
        status,
        winnersClaimed: s.winnersClaimed?.toString(),
      })
    }

    const out: ApiOut = {
      kpis: { pending, active, unclaimed, approved, finalized },
      items: rows,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      hasMore: fromBlock > 0n,
    }

    // cache for a few seconds to smooth the UI (you can tune this)
    return NextResponse.json(out, {
      headers: { "Cache-Control": "public, max-age=5" },
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          (e?.data && e?.data?.message) ||
          e?.shortMessage ||
          e?.message ||
          String(e),
        rpc: RPC_URL,
        hint:
          "If this persists, try reducing ?span=2000 or verify event names in ABI.",
      },
      { status: 500 }
    )
  }
}