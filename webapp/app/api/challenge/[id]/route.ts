// app/api/challenge/[id]/route.ts
import { NextResponse } from "next/server"
import {
  createPublicClient,
  http,
  decodeEventLog,
  getAbiItem,
  type Abi,
  type AbiEvent,
} from "viem"
import { RPC_URL, lightchain } from "@/lib/lightchain"
import { ABI, ADDR } from "@/lib/contracts"
import fs from "fs/promises"
import path from "path"

// If you're on Next.js >= 13, this ensures Node runtime (fs is not edge-compatible)
export const runtime = "nodejs"

// Response shape expected by app/challenge/[id]/page.tsx
type ApiOut = {
  id: string
  status: "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused"
  creator?: `0x${string}`
  startTs?: string
  createdBlock?: string
  createdTx?: `0x${string}`
  winnersClaimed?: number
  proofRequired?: boolean
  proofOk?: boolean
  // merged metadata (optional)
  title?: string
  description?: string
  params?: string
  category?: string
  verifier?: string
  timeline: {
    name: string
    label: string
    tx: `0x${string}`
    block: string
    timestamp?: number
  }[]
}

const abi: Abi = ABI.ChallengePay
const address = ADDR.ChallengePay

function ev(name: string): AbiEvent {
  return getAbiItem({ abi, name }) as AbiEvent
}

function toStatus(n: number): ApiOut["status"] {
  switch (n) {
    case 0: return "Pending"
    case 1: return "Approved"
    case 2: return "Rejected"
    case 3: return "Finalized"
    case 4: return "Canceled"
    default: return "Pending"
  }
}

// Precise tuple type matching ChallengeView in ChallengePay.sol
type ChallengeViewTuple = readonly [
  bigint,                     // id
  number,                     // kind
  number,                     // status
  number,                     // outcome
  `0x${string}`,              // challenger
  `0x${string}`,              // daoTreasury
  number,                     // currency
  bigint,                     // stake
  bigint,                     // proposalBond
  bigint,                     // approvalDeadline
  bigint,                     // startTs
  bigint,                     // maxParticipants
  bigint,                     // yesWeight
  bigint,                     // noWeight
  bigint,                     // partWeight
  readonly `0x${string}`[],   // peers
  number,                     // peerApprovalsNeeded
  bigint,                     // peerApprovals
  bigint,                     // peerRejections
  number,                     // charityBps
  `0x${string}`,              // charity
  bigint,                     // poolSuccess
  bigint,                     // poolFail
  boolean,                    // proofRequired
  `0x${string}`,              // verifier
  boolean,                    // proofOk
  bigint                      // participantsCount
]

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const idStr = ctx.params.id
  if (!idStr || !/^\d+$/.test(idStr)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 })
  }
  const id = BigInt(idStr)

  try {
    if (!RPC_URL) {
      return NextResponse.json({ error: "Missing RPC_URL" }, { status: 500 })
    }

    const client = createPublicClient({
      chain: lightchain,
      transport: http(RPC_URL),
    })

    const latest = await client.getBlockNumber()

    // 1) Read the on-chain view (typed)
    const cv = (await client.readContract({
      abi,
      address,
      functionName: "getChallenge",
      args: [id],
    })) as unknown as ChallengeViewTuple

    const statusBase = toStatus(Number(cv[2]))
    const creator = cv[4]
    const startTs = cv[10]?.toString() || undefined
    const proofRequired = Boolean(cv[22])
    const proofOk = Boolean(cv[24])

    // 2) Pull per-id logs for timeline / created tx / winnersClaimed
    const queries = [
      { key: "ChallengeCreated", event: ev("ChallengeCreated") },
      { key: "StatusBecameApproved", event: ev("StatusBecameApproved") },
      { key: "StatusBecameRejected", event: ev("StatusBecameRejected") },
      { key: "Finalized", event: ev("Finalized") },
      { key: "Paused", event: ev("Paused") },
      { key: "Canceled", event: ev("Canceled") },
      { key: "ProofSubmitted", event: ev("ProofSubmitted") },
      { key: "SnapshotSet", event: ev("SnapshotSet") },
      { key: "WinnerClaimed", event: ev("WinnerClaimed") },
      { key: "LoserCashbackClaimed", event: ev("LoserCashbackClaimed") },
      { key: "ValidatorClaimed", event: ev("ValidatorClaimed") },
      { key: "ValidatorRejectClaimed", event: ev("ValidatorRejectClaimed") },
      { key: "PeerVoted", event: ev("PeerVoted") },
      { key: "Joined", event: ev("Joined") },
      { key: "BetPlaced", event: ev("BetPlaced") },
      { key: "FeesPaid", event: ev("FeesPaid") },
    ] as const

    const results = await Promise.all(
      queries.map(async ({ key, event }) => {
        const logs = await client.getLogs({
          address,
          event,
          args: { id },
          fromBlock: 0n,
          toBlock: latest,
        }).catch(async () => {
          // fallback if RPC can't filter by indexed arg
          const all = await client.getLogs({ address, event, fromBlock: 0n, toBlock: latest })
          return all.filter((l) => {
            try {
              const dec = decodeEventLog({ abi, data: l.data, topics: l.topics })
              const a: any = dec.args
              return (a?.id !== undefined && BigInt(a.id) === id) ||
                     (a?.challengeId !== undefined && BigInt(a.challengeId) === id)
            } catch { return false }
          })
        })
        return { key, logs }
      })
    )

    const blocks = new Map<bigint, number>()
    async function tsOf(blockNumber: bigint): Promise<number | undefined> {
      if (blocks.has(blockNumber)) return blocks.get(blockNumber)
      try {
        const blk = await client.getBlock({ blockNumber })
        const t = Number(blk.timestamp)
        blocks.set(blockNumber, t)
        return t
      } catch { return undefined }
    }

    type TL = ApiOut["timeline"][number]
    const timeline: TL[] = []
    let createdBlock: bigint | undefined
    let createdTx: `0x${string}` | undefined
    let winnersClaimed = 0
    let forcedStatus: ApiOut["status"] | null = null

    function push(name: string, label: string, tx: `0x${string}`, blockNumber: bigint, timestamp?: number) {
      timeline.push({ name, label, tx, block: blockNumber.toString(), timestamp })
    }

    for (const r of results) {
      for (const l of r.logs) {
        const dec = decodeEventLog({ abi, data: l.data, topics: l.topics })
        const bn = l.blockNumber!
        const tx = l.transactionHash as `0x${string}`
        const t = await tsOf(bn)

        switch (r.key) {
          case "ChallengeCreated":
            createdBlock = bn
            createdTx = tx
            push("ChallengeCreated", "Created", tx, bn, t)
            break
          case "StatusBecameApproved":
            push("StatusBecameApproved", "Approved", tx, bn, t)
            break
          case "StatusBecameRejected":
            push("StatusBecameRejected", "Rejected", tx, bn, t)
            break
          case "Finalized": {
            const outcome = Number((dec.args as any)?.outcome ?? 0)
            const label = outcome === 1 ? "Finalized: Success" :
                          outcome === 2 ? "Finalized: Fail"    : "Finalized"
            push("Finalized", label, tx, bn, t)
            break
          }
          case "Paused": {
            const p = Boolean((dec.args as any)?.paused ?? (dec.args as any)?.p)
            push("Paused", p ? "Paused" : "Unpaused", tx, bn, t)
            if (p) forcedStatus = "Paused"
            break
          }
          case "Canceled":
            push("Canceled", "Canceled", tx, bn, t)
            forcedStatus = "Canceled"
            break
          case "ProofSubmitted": {
            const ok = Boolean((dec.args as any)?.ok)
            push("ProofSubmitted", ok ? "Proof OK" : "Proof failed", tx, bn, t)
            break
          }
          case "SnapshotSet":
            push("SnapshotSet", "Snapshot taken", tx, bn, t)
            break
          case "WinnerClaimed":
            winnersClaimed += 1
            push("WinnerClaimed", "Winner claimed", tx, bn, t)
            break
          case "LoserCashbackClaimed":
            push("LoserCashbackClaimed", "Loser cashback claimed", tx, bn, t)
            break
          case "ValidatorClaimed":
            push("ValidatorClaimed", "Validator reward claimed", tx, bn, t)
            break
          case "ValidatorRejectClaimed":
            push("ValidatorRejectClaimed", "Validator reject-claim", tx, bn, t)
            break
          case "PeerVoted": {
            const pass = Boolean((dec.args as any)?.pass)
            push("PeerVoted", pass ? "Peer voted: pass" : "Peer voted: fail", tx, bn, t)
            break
          }
          case "Joined":
            push("Joined", "Joined", tx, bn, t)
            break
          case "BetPlaced": {
            const oc = Number((dec.args as any)?.outcome ?? 0)
            const lbl = oc === 1 ? "Bet on Success" : oc === 2 ? "Bet on Fail" : "Bet"
            push("BetPlaced", lbl, tx, bn, t)
            break
          }
          case "FeesPaid":
            push("FeesPaid", "Fees distributed", tx, bn, t)
            break
        }
      }
    }

    timeline.sort((a, b) => {
      const A = BigInt(a.block), B = BigInt(b.block)
      return A < B ? -1 : A > B ? 1 : 0
    })

    const out: ApiOut = {
      id: idStr,
      status: forcedStatus ?? statusBase,
      creator,
      startTs,
      createdBlock: createdBlock?.toString(),
      createdTx,
      winnersClaimed,
      proofRequired,
      proofOk,
      timeline,
    }

    // --- Merge off-chain metadata (title/description/params/category/verifier) ---
    try {
      // Adjust this path if you placed the file elsewhere.
      // In our earlier steps we wrote to:  webapp/public/challenges.json
      const metaPath = path.join(process.cwd(), "webapp/public/challenges.json")
      const raw = await fs.readFile(metaPath, "utf-8").catch(() => "[]")
      const all: any[] = JSON.parse(raw)
      const m = all.find((x) => x.id === idStr)
      if (m) {
        out.title = m.title
        out.description = m.description
        out.params = m.params
        out.category = m.category
        out.verifier = m.verifier
      }
    } catch {
      // ignore metadata errors
    }
    // ---------------------------------------------------------------------------

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
        hint: "Verify ABI/event names and that the RPC supports filtering by indexed args.",
      },
      { status: 500 }
    )
  }
}