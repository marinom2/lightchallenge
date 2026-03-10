// app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  decodeEventLog,
  getAbiItem,
  type Abi,
  type AbiEvent,
  type Address,
} from "viem";
import { RPC_URL, lightchain } from "@/lib/lightchain";
import { ABI, ADDR } from "@/lib/contracts";

/* ────────────────────────────────────────────────────────────────────────────
 * Types (client-visible)
 * ──────────────────────────────────────────────────────────────────────────── */
type Status = "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";
const STATUS_LUT: Status[] = ["Pending", "Approved", "Rejected", "Finalized", "Canceled", "Paused"];

type Row = {
  id: string;
  creator?: Address;
  startTs?: string;
  blockNumber: string;
  txHash: `0x${string}`;
  status: Status;
  winnersClaimed?: string;
};

type Kpis = {
  pending: number;
  active: number;
  unclaimed: number;
  approved: number;
  finalized: number;
};

type ApiOut = {
  kpis: Kpis;
  items: Row[];
  fromBlock: string;
  toBlock: string;
  hasMore: boolean;

  // legacy compat
  range: { fromBlock: string; toBlock: string; span: string };
  recent: Array<{ id: string; creator?: Address; blockNumber: string; txHash: `0x${string}` }>;
  error?: string;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Setup + helpers
 * ──────────────────────────────────────────────────────────────────────────── */
const abi: Abi = ABI.ChallengePay;
const contractAddr = (ADDR.ChallengePay ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

function ev(name: string): AbiEvent | undefined {
  try { return getAbiItem({ abi, name }) as AbiEvent; } catch { return undefined; }
}

function toStatus(n: number | bigint | undefined): Status {
  const idx = typeof n === "bigint" ? Number(n) : Number(n ?? 0);
  return STATUS_LUT[idx] ?? "Pending";
}

function asAddr<T extends `0x${string}`>(x: unknown): T | undefined {
  if (typeof x === "string" && /^0x[0-9a-fA-F]{40}$/.test(x)) return x as T;
  return undefined;
}
function asBigInt(x: unknown, d: bigint = 0n) {
  if (typeof x === "bigint") return x;
  if (typeof x === "number") return BigInt(Math.trunc(x));
  if (typeof x === "string" && x) { try { return BigInt(x); } catch {} }
  return d;
}
function asNum(x: unknown, d = 0) {
  if (typeof x === "number") return x;
  if (typeof x === "bigint") return Number(x);
  if (typeof x === "string") { const n = Number(x); return Number.isFinite(n) ? n : d; }
  return d;
}

/** Extract status index from a viem tuple-with-names first; fall back to [2] */
function extractStatusIndex(result: any): number {
  if (result && typeof result.status !== "undefined") {
    const n = Number(result.status);
    if (Number.isFinite(n)) return n;
  }
  const alt = Number(result?.[2]);
  return Number.isFinite(alt) ? alt : 0;
}

/** Get logs but never throw if ABI or RPC borks; return [] instead. */
async function safeLogs(
  client: ReturnType<typeof createPublicClient>,
  opts: { address: `0x${string}`; event?: AbiEvent; fromBlock: bigint; toBlock: bigint; args?: Record<string, unknown> }
) {
  if (!opts.event) return [] as any[];
  try {
    return await client.getLogs(opts as any);
  } catch {
    try {
      const { address, event, fromBlock, toBlock } = opts;
      return await client.getLogs({ address, event, fromBlock, toBlock });
    } catch {
      return [] as any[];
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Handler
 * ──────────────────────────────────────────────────────────────────────────── */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const spanParam = url.searchParams.get("span");
  const toBlockParam = url.searchParams.get("toBlock");

  const DEFAULT_SPAN = 10_000n;
  const MAX_SPAN = 50_000n;
  let span = spanParam ? BigInt(spanParam) : DEFAULT_SPAN;
  if (span < 1n) span = DEFAULT_SPAN;
  if (span > MAX_SPAN) span = MAX_SPAN;

  // Early tolerant exit (keep UI alive)
  if (!RPC_URL || !contractAddr) {
    const empty: ApiOut = {
      kpis: { pending: 0, active: 0, unclaimed: 0, approved: 0, finalized: 0 },
      items: [],
      fromBlock: "0",
      toBlock: "0",
      hasMore: false,
      range: { fromBlock: "0", toBlock: "0", span: span.toString() },
      recent: [],
    };
    return NextResponse.json(empty, { status: 200 });
  }

  try {
    const client = createPublicClient({ chain: lightchain, transport: http(RPC_URL) });

    // Window
    const latest = await client.getBlockNumber();
    const toBlock = toBlockParam ? BigInt(toBlockParam) : latest;
    const fromBlock = toBlock > span ? toBlock - span : 0n;

    // Events we use
    const createdEv = ev("ChallengeCreated");
    const approvedEv = ev("StatusBecameApproved");
    const rejectedEv = ev("StatusBecameRejected");
    const finalizedEv = ev("Finalized");
    const canceledEv = ev("Canceled");
    const pausedEv = ev("Paused");

    // Claim-ish events (for KPI “unclaimed” heuristic)
    const winnerClaimedEv = ev("WinnerClaimed");
    const principalClaimedEv = ev("PrincipalClaimed");
    const validatorClaimedEv = ev("ValidatorClaimed");
    const rejectCreatorClaimedEv = ev("RejectCreatorClaimed");
    const rejectContributionClaimedEv = ev("RejectContributionClaimed");

    // Fetch logs in window
    const [
      createdLogs,
      approvedLogs,
      rejectedLogs,
      finalizedLogs,
      canceledLogs,
      pausedLogs,
      winnerLogs,
      principalLogs,
      validatorLogs,
      rejectCreatorLogs,
      rejectContributionLogs,
    ] = await Promise.all([
      safeLogs(client, { address: contractAddr, event: createdEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: approvedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: rejectedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: finalizedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: canceledEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: pausedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: winnerClaimedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: principalClaimedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: validatorClaimedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: rejectCreatorClaimedEv, fromBlock, toBlock }),
      safeLogs(client, { address: contractAddr, event: rejectContributionClaimedEv, fromBlock, toBlock }),
    ]);

    type State = {
      id: bigint;
      creator?: Address;
      startTs?: bigint;
      createdBlock?: bigint;
      createdTx?: `0x${string}`;
      status?: Status;
      approved?: boolean;
      rejected?: boolean;
      finalized?: boolean;
      canceled?: boolean;
      paused?: boolean;
      winnersClaimed?: number;
      lastBlock?: bigint;
    };
    const byId = new Map<bigint, State>();

    // Seed from ChallengeCreated
    for (const l of createdLogs) {
      try {
        const dec = decodeEventLog({ abi, data: l.data, topics: l.topics }) as any;
        const id = BigInt(dec.args?.id ?? dec.args?.challengeId ?? 0);
        if (id === 0n) continue;
        const s = byId.get(id) ?? { id, winnersClaimed: 0 };
        const challenger = asAddr<Address>(dec.args?.challenger);
        const startTs = asBigInt(dec.args?.startTs, 0n);
        if (challenger) s.creator = challenger;
        if (startTs !== 0n) s.startTs = startTs;
        s.createdBlock = l.blockNumber!;
        s.createdTx = l.transactionHash!;
        s.status = "Pending";
        s.lastBlock = l.blockNumber!;
        byId.set(id, s);
      } catch {}
    }

    // Apply status/claim logs (only inside the window)
    function applyLogs(logs: any[]) {
      for (const l of logs) {
        let dec: any;
        try { dec = decodeEventLog({ abi, data: l.data, topics: l.topics }) as any; } catch { continue; }
        const id = BigInt(dec.args?.id ?? dec.args?.challengeId ?? 0);
        if (id === 0n) continue;

        const s = byId.get(id) ?? { id, winnersClaimed: 0 };
        switch (dec.eventName) {
          case "StatusBecameApproved":
            s.approved = true; s.rejected = false; s.paused = false; s.status = "Approved"; break;
          case "StatusBecameRejected":
          case "ChallengeRejected": // (present in ABI)
            s.rejected = true; s.approved = false; s.status = "Rejected"; break;
          case "Finalized":
            s.finalized = true; s.status = "Finalized"; break;
          case "Canceled":
            s.canceled = true; s.status = "Canceled"; break;
          case "Paused": {
            const paused = Boolean(dec.args?.paused ?? dec.args?.p);
            s.paused = paused;
            if (paused) s.status = "Paused";
            break;
          }
          // Any of these means “someone claimed” → useful for unclaimed KPI
          case "WinnerClaimed":
          case "PrincipalClaimed":
          case "ValidatorClaimed":
          case "RejectCreatorClaimed":
          case "RejectContributionClaimed":
            s.winnersClaimed = (s.winnersClaimed ?? 0) + 1;
            break;
        }
        s.lastBlock = l.blockNumber!;
        byId.set(id, s);
      }
    }

    applyLogs(approvedLogs);
    applyLogs(rejectedLogs);
    applyLogs(finalizedLogs);
    applyLogs(canceledLogs);
    applyLogs(pausedLogs);
    applyLogs(winnerLogs);
    applyLogs(principalLogs);
    applyLogs(validatorLogs);
    applyLogs(rejectCreatorLogs);
    applyLogs(rejectContributionLogs);

    /* ────────────────────────────────────────────────────────────────────────
     * Canonical on-chain reads (named fields; multicall with per-id fallback)
     * ──────────────────────────────────────────────────────────────────────── */
    const ids = [...byId.keys()];
    const MAX_READS = 120; // screenful safety
    const slice = ids.slice(0, MAX_READS);

    // multicall
    try {
      const mc = await client.multicall({
        allowFailure: true,
        contracts: slice.map((id) => ({
          address: contractAddr,
          abi,
          functionName: "getChallenge" as const,
          args: [id] as const,
        })),
      });

      const needSingles: bigint[] = [];
      mc.forEach((r, i) => {
        const id = slice[i];
        if (r.status !== "success" || !r.result) {
          needSingles.push(id);
          return;
        }
        const res: any = r.result;
        const s = byId.get(id) ?? { id, winnersClaimed: 0 };
        const idx = extractStatusIndex(res);
        s.status = toStatus(idx);
        // named fields preferred
        const creator = asAddr<Address>(res?.challenger ?? res?.[4]);
        const startTs = asBigInt(res?.startTs ?? res?.[10], 0n);
        if (creator) s.creator = creator;
        if (startTs !== 0n) s.startTs = startTs;
        byId.set(id, s);
      });

      // fallback single reads
      for (const id of needSingles) {
        try {
          const res = (await client.readContract({
            abi,
            address: contractAddr,
            functionName: "getChallenge",
            args: [id],
          })) as any;
          const s = byId.get(id) ?? { id, winnersClaimed: 0 };
          const idx = extractStatusIndex(res);
          s.status = toStatus(idx);
          const creator = asAddr<Address>(res?.challenger ?? res?.[4]);
          const startTs = asBigInt(res?.startTs ?? res?.[10], 0n);
          if (creator) s.creator = creator;
          if (startTs !== 0n) s.startTs = startTs;
          byId.set(id, s);
        } catch { /* keep log-derived */ }
      }
    } catch {
      // total multicall failure → best effort singles (still limited by MAX_READS)
      await Promise.all(slice.map(async (id) => {
        try {
          const res = (await client.readContract({
            abi, address: contractAddr, functionName: "getChallenge", args: [id],
          })) as any;
          const s = byId.get(id) ?? { id, winnersClaimed: 0 };
          const idx = extractStatusIndex(res);
          s.status = toStatus(idx);
          const creator = asAddr<Address>(res?.challenger ?? res?.[4]);
          const startTs = asBigInt(res?.startTs ?? res?.[10], 0n);
          if (creator) s.creator = creator;
          if (startTs !== 0n) s.startTs = startTs;
          byId.set(id, s);
        } catch { /* ignore */ }
      }));
    }

    /* ────────────────────────────────────────────────────────────────────────
     * KPIs + rows
     * ──────────────────────────────────────────────────────────────────────── */
    const nowSec = Math.floor(Date.now() / 1000);
    let pending = 0, approved = 0, active = 0, finalized = 0, unclaimed = 0;

    const entries = [...byId.values()].sort((a, b) =>
      Number((b.createdBlock ?? b.lastBlock ?? 0n) - (a.createdBlock ?? a.lastBlock ?? 0n))
    );

    const rows: Row[] = [];
    for (const s of entries) {
      const status = s.status ?? "Pending";
      if (status === "Pending") pending++;
      if (status === "Approved") approved++;
      if (status === "Finalized") finalized++;

      // Active heuristic: approved + started + not paused/canceled/finalized
      if (status === "Approved" && !s.canceled && !s.finalized && !(s.paused ?? false)) {
        if (s.startTs && Number(s.startTs) <= nowSec) active++;
      }
      if (s.finalized && (s.winnersClaimed ?? 0) === 0) unclaimed++;

      rows.push({
        id: s.id.toString(),
        creator: s.creator,
        startTs: s.startTs ? s.startTs.toString() : undefined,
        blockNumber: (s.createdBlock ?? s.lastBlock ?? 0n).toString(),
        txHash: (s.createdTx ?? "0x") as `0x${string}`,
        status,
        winnersClaimed: s.winnersClaimed?.toString(),
      });
    }

    const recent = rows.map((r) => ({
      id: r.id,
      creator: r.creator,
      blockNumber: r.blockNumber,
      txHash: r.txHash,
    }));

    const out: ApiOut = {
      kpis: { pending, active, unclaimed, approved, finalized },
      items: rows,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      hasMore: fromBlock > 0n,
      range: { fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), span: span.toString() },
      recent,
    };

    return NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=5" } });
  } catch (e: any) {
    const empty: ApiOut = {
      kpis: { pending: 0, active: 0, unclaimed: 0, approved: 0, finalized: 0 },
      items: [],
      fromBlock: "0",
      toBlock: "0",
      hasMore: false,
      range: { fromBlock: "0", toBlock: "0", span: (10_000n).toString() },
      recent: [],
      error: e?.data?.message || e?.shortMessage || e?.message || String(e),
    };
    return NextResponse.json(empty, { status: 200 });
  }
}