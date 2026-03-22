import { NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  decodeEventLog,
  getAbiItem,
  isAddress,
  isHex,
  type Abi,
  type AbiEvent,
  type Address,
} from "viem";
import { RPC_URL, lightchain } from "@/lib/lightchain";
import { ABI, ADDR } from "@/lib/contracts";
import type { Status } from "@/lib/types/status";

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

type SnapshotOut = {
  set: boolean;
  success: boolean;
  committedPool: string;
  forfeitedPool: string;
  cashback: string;
  forfeitedAfterCashback?: string;
  protocolAmt: string;
  creatorAmt: string;
  perCommittedBonusX: string;
  perCashbackX: string;
};

type TimelineRow = {
  name: string;
  label: string;
  tx: `0x${string}`;
  block: string;
  timestamp?: number;
  who?: `0x${string}`;
};

type ApiOut = {
  id: string;
  status: Status;
  outcome?: number;
  creator?: `0x${string}`;
  startTs?: string;
  endTs?: string;
  joinClosesTs?: string;
  createdBlock?: string;
  createdTx?: `0x${string}`;
  participantsCount?: number;
  winnersClaimed?: number;
  youJoined?: boolean;
  youAlreadyJoined?: boolean;
  title?: string;
  description?: string;
  params?: any;
  category?: string | null;
  verifier?: `0x${string}` | "dapp";
  tags?: string[];
  game?: string | null;
  mode?: string | null;
  createdAt?: number;
  externalId?: string;
  modelId?: string | null;
  modelKind?: "aivm" | null;
  modelHash?: `0x${string}` | null;
  verifierUsed?: `0x${string}` | null;
  proof?: {
    kind: "aivm";
    modelId: string;
    params: Record<string, any>;
    paramsHash: `0x${string}`;
    [key: string]: any;
  } | null;
  money?: { stakeWei?: string | null } | null;
  pool?: { committedWei?: string | null } | null;
  treasuryBalanceWei?: string | null;
  snapshot?: SnapshotOut;
  timeline: TimelineRow[];
  kindKey?: string | null;
  form?: Record<string, string | number>;
};

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || "https://ipfs.io/ipfs/";

const cpAbi: Abi = ABI.ChallengePay;
const mrAbi: Abi | undefined = (ABI.MetadataRegistry as any) ?? undefined;

const challengePay = (ADDR.ChallengePay ?? ZERO_ADDR) as `0x${string}`;
const metadataRegistry = (ADDR.MetadataRegistry ?? ZERO_ADDR) as `0x${string}`;

function ev(name: string): AbiEvent {
  return getAbiItem({ abi: cpAbi, name }) as AbiEvent;
}

/**
 * Maps on-chain ChallengePay V1 Status enum to string.
 * enum Status { Active=0, Finalized=1, Canceled=2 }
 */
function toStatus(n: number): Status {
  switch (n) {
    case 0:
      return "Active";
    case 1:
      return "Finalized";
    case 2:
      return "Canceled";
    default:
      return "Active";
  }
}

function isLogForId(l: any, id: bigint) {
  try {
    const dec = decodeEventLog({ abi: cpAbi, data: l.data, topics: l.topics }) as any;
    const a = dec?.args ?? {};
    const decId =
      a.id !== undefined
        ? BigInt(a.id)
        : a.challengeId !== undefined
        ? BigInt(a.challengeId)
        : null;
    return decId !== null && decId === id;
  } catch {
    return false;
  }
}

async function safeLogsForId(
  client: ReturnType<typeof createPublicClient>,
  id: bigint,
  name: string,
  fromBlock: bigint,
  toBlock: bigint
) {
  const event = ev(name);

  try {
    return await client.getLogs({
      address: challengePay,
      event,
      fromBlock,
      toBlock,
      args: { id },
    });
  } catch {
    const all = await client.getLogs({
      address: challengePay,
      event,
      fromBlock,
      toBlock,
    });

    return all.filter((l) => isLogForId(l, id));
  }
}

function toHttpUri(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    const cidAndPath = uri.slice("ipfs://".length);
    return `${IPFS_GATEWAY.replace(/\/$/, "")}/${cidAndPath.replace(/^ipfs\//, "")}`;
  }
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return null;
}

function coerceParams(input: unknown): Record<string, any> | string | undefined {
  if (input == null) return undefined;
  if (typeof input === "object") return input as Record<string, any>;
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return undefined;

    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed as Record<string, any>;
    } catch {}

    return s;
  }
  return undefined;
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const idStr = ctx.params.id;

  if (!idStr || !/^\d+$/.test(idStr)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const id = BigInt(idStr);

  const url = new URL(req.url);
  const viewerRaw = (url.searchParams.get("viewer") || "").trim();
  const viewer = isAddress(viewerRaw as `0x${string}`)
    ? (viewerRaw as `0x${string}`)
    : null;

  try {
    if (!RPC_URL) {
      return NextResponse.json({ error: "RPC not configured" }, { status: 200 });
    }

    if (challengePay === ZERO_ADDR) {
      return NextResponse.json(
        { error: "ChallengePay not configured" },
        { status: 200 }
      );
    }

    const client = createPublicClient({
      chain: lightchain,
      transport: http(RPC_URL),
    });

    const latest = await client.getBlockNumber();
    const toBlock = latest;
    const rawSpan = url.searchParams.get("span");
    const span = BigInt(Math.min(Number(rawSpan) || 2000, 2000));
    const fromBlock = toBlock > span ? toBlock - span + 1n : 0n;

    /**
     * V1 ChallengeView struct layout:
     *  0: id, 1: kind, 2: status, 3: outcome,
     *  4: creator, 5: currency, 6: token, 7: stake,
     *  8: joinClosesTs, 9: startTs, 10: duration, 11: maxParticipants,
     *  12: pool, 13: participantsCount,
     *  14: verifier, 15: proofDeadlineTs,
     *  16: winnersCount, 17: winnersPool,
     *  18: paused, 19: canceled, 20: payoutsDone
     */
    const cv: any = await client.readContract({
      abi: cpAbi,
      address: challengePay,
      functionName: "getChallenge",
      args: [id],
    });

    const creator = (cv?.creator ?? cv?.[4]) as Address | undefined;
    const status = toStatus(Number(cv?.status ?? cv?.[2] ?? 0));
    const outcome = Number(cv?.outcome ?? cv?.[3] ?? 0);
    const startTs = cv?.startTs ?? cv?.[9] ? String(cv.startTs ?? cv[9]) : undefined;
    const duration = BigInt(cv?.duration ?? cv?.[10] ?? 0n);
    const endTs = startTs ? (BigInt(startTs) + duration).toString() : undefined;
    const joinClosesTs = cv?.joinClosesTs ?? cv?.[8] ? String(cv.joinClosesTs ?? cv[8]) : undefined;
    const stakeWei = BigInt(cv?.stake ?? cv?.[7] ?? 0n);
    const poolWei = BigInt(cv?.pool ?? cv?.[12] ?? 0n);
    // On-chain participantsCount includes the creator (auto-marked on staked create).
    // Subtract 1 so the count reflects only explicit joiners.
    const participantsCount = Math.max(0, Number(cv?.participantsCount ?? cv?.[13] ?? 0) - 1);

    const rawSnapshot: any = await client
      .readContract({
        abi: cpAbi,
        address: challengePay,
        functionName: "getSnapshot",
        args: [id],
      })
      .catch(() => null);

    /**
     * V1 SnapshotView:
     *  0: set, 1: success, 2: committedPool, 3: forfeitedPool,
     *  4: cashback, 5: forfeitedAfterCashback,
     *  6: protocolAmt, 7: creatorAmt,
     *  8: perCommittedBonusX, 9: perCashbackX
     */
    const snapshot: SnapshotOut | undefined = rawSnapshot
      ? {
          set: !!(rawSnapshot.set ?? rawSnapshot[0]),
          success: !!(rawSnapshot.success ?? rawSnapshot[1]),
          committedPool: (rawSnapshot.committedPool ?? rawSnapshot[2] ?? 0n).toString(),
          forfeitedPool: (rawSnapshot.forfeitedPool ?? rawSnapshot[3] ?? 0n).toString(),
          cashback: (rawSnapshot.cashback ?? rawSnapshot[4] ?? 0n).toString(),
          forfeitedAfterCashback: (rawSnapshot.forfeitedAfterCashback ?? rawSnapshot[5] ?? 0n).toString(),
          protocolAmt: (rawSnapshot.protocolAmt ?? rawSnapshot[6] ?? 0n).toString(),
          creatorAmt: (rawSnapshot.creatorAmt ?? rawSnapshot[7] ?? 0n).toString(),
          perCommittedBonusX: (rawSnapshot.perCommittedBonusX ?? rawSnapshot[8] ?? 0n).toString(),
          perCashbackX: (rawSnapshot.perCashbackX ?? rawSnapshot[9] ?? 0n).toString(),
        }
      : undefined;

    // V1 events only — no validator/peer/strategy/approval events
    const eventNames = [
      "ChallengeCreated",
      "Finalized",
      "Paused",
      "Canceled",
      "ProofSubmitted",
      "WinnerClaimed",
      "LoserClaimed",
      "RefundClaimed",
      "SnapshotSet",
      "Joined",
      "FeesBooked",
    ] as const;

    const perEvent = await Promise.all(
      eventNames.map(async (name) => ({
        name,
        logs: await safeLogsForId(client, id, name, fromBlock, toBlock),
      }))
    );

    const blockTs = new Map<bigint, number>();

    async function tsOf(blockNumber: bigint): Promise<number | undefined> {
      if (blockTs.has(blockNumber)) return blockTs.get(blockNumber);
      try {
        const blk = await client.getBlock({ blockNumber });
        const t = Number(blk.timestamp);
        blockTs.set(blockNumber, t);
        return t;
      } catch {
        return undefined;
      }
    }

    const timeline: TimelineRow[] = [];
    const seen = new Set<string>();

    let winnersClaimed = 0;
    let joinedTotal = 0n;
    const joinedAddresses = new Set<string>();

    function push(
      name: string,
      label: string,
      tx: `0x${string}`,
      blockNumber: bigint,
      timestamp?: number,
      who?: `0x${string}`
    ) {
      timeline.push({
        name,
        label,
        tx,
        block: blockNumber.toString(),
        timestamp,
        ...(who ? { who } : {}),
      });
    }

    for (const { logs } of perEvent) {
      for (const l of logs) {
        const key = `${l.transactionHash}:${l.logIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let dec: { eventName?: string; args?: any } | null = null;
        try {
          dec = decodeEventLog({ abi: cpAbi, data: l.data, topics: l.topics }) as any;
        } catch {
          continue;
        }

        if (!dec?.eventName) continue;

        const bn = l.blockNumber!;
        const tx = l.transactionHash as `0x${string}`;
        const t = await tsOf(bn);
        const args: any = dec.args ?? {};

        switch (dec.eventName) {
          case "ChallengeCreated":
            push("ChallengeCreated", "Challenge created", tx, bn, t);
            break;

          case "Finalized": {
            const o = Number(args.outcome ?? 0);
            const label =
              o === 1
                ? "Finalized: Success"
                : o === 2
                ? "Finalized: Fail"
                : "Finalized";
            push("Finalized", label, tx, bn, t);
            break;
          }

          case "Paused":
            push("Paused", args.paused ? "Paused" : "Unpaused", tx, bn, t);
            break;

          case "Canceled":
            push("Canceled", "Challenge canceled", tx, bn, t);
            break;

          case "ProofSubmitted":
            push(
              "ProofSubmitted",
              args.ok ? "Proof validated OK" : "Proof submitted",
              tx,
              bn,
              t
            );
            break;

          case "WinnerClaimed":
          case "LoserClaimed":
          case "RefundClaimed":
            winnersClaimed++;
            push(dec.eventName, "Reward claimed", tx, bn, t);
            break;

          case "SnapshotSet":
            push("SnapshotSet", "Snapshot taken", tx, bn, t);
            break;

          case "Joined": {
            const who =
              args?.who && isAddress(args.who)
                ? (args.who as `0x${string}`)
                : args?.user && isAddress(args.user)
                ? (args.user as `0x${string}`)
                : undefined;

            const amt =
              (typeof args?.amount === "bigint" && args.amount) ||
              (typeof args?.value === "bigint" && args.value) ||
              (typeof args?.stake === "bigint" && args.stake) ||
              0n;

            if (amt > 0n) joinedTotal += amt;

            const whoKey = who?.toLowerCase() ?? "";
            const isTopUp = whoKey ? joinedAddresses.has(whoKey) : false;
            if (whoKey) joinedAddresses.add(whoKey);

            push(
              isTopUp ? "ToppedUp" : "Joined",
              isTopUp ? "Topped up" : "Joined",
              tx, bn, t, who,
            );
            break;
          }

          case "FeesBooked":
            push("FeesBooked", "Fees booked", tx, bn, t);
            break;
        }
      }
    }

    timeline.sort((a, b) => Number(BigInt(a.block) - BigInt(b.block)));

    let youJoined: boolean | undefined;
    if (viewer) {
      youJoined = timeline.some(
        (t) =>
          (t.name === "Joined" || t.name === "ToppedUp") &&
          typeof t.who === "string" &&
          t.who.toLowerCase() === viewer.toLowerCase()
      );
    }

    const committedWei = (poolWei > 0n ? poolWei : stakeWei + joinedTotal).toString();

    let uri = "";
    if (metadataRegistry !== ZERO_ADDR && mrAbi) {
      uri = (await client
        .readContract({
          abi: mrAbi,
          address: metadataRegistry,
          functionName: "uri",
          args: [challengePay, id],
        })
        .catch(() => "")) as string;
    }

    const created = timeline.find((t) => t.name === "ChallengeCreated");

    const out: ApiOut = {
      id: idStr,
      status,
      outcome,
      creator: creator as any,
      startTs,
      endTs,
      joinClosesTs,
      createdBlock: created?.block,
      createdTx: created?.tx,
      participantsCount,
      winnersClaimed,
      youJoined,
      youAlreadyJoined: youJoined,
      money: { stakeWei: stakeWei.toString() },
      pool: { committedWei },
      treasuryBalanceWei: committedWei,
      snapshot,
      timeline,
      verifier: "dapp",
      tags: [],
    };

    const httpUri = toHttpUri(uri || "");
    if (httpUri) {
      try {
        const res = await fetch(httpUri, { cache: "no-store" });

        if (res.ok) {
          const meta = await res.json().catch(() => null);

          if (meta && typeof meta === "object") {
            const asAddr = (x: any): `0x${string}` | null => {
              if (typeof x !== "string") return null;
              const s = x.trim();
              if (!s || s === "true" || s === "false") return null;
              return isAddress(s as `0x${string}`) ? (s as `0x${string}`) : null;
            };

            const asBytes32 = (x: any): `0x${string}` | null => {
              if (typeof x !== "string") return null;
              const s = x.trim();
              if (!s || s === "true" || s === "false") return null;
              return isHex(s) && s.length === 66 ? (s as `0x${string}`) : null;
            };

            if ((meta as any).title) out.title = String((meta as any).title);
            if ((meta as any).description) {
              out.description = String((meta as any).description);
            }
            if ((meta as any).category) out.category = String((meta as any).category);

            const v = asAddr((meta as any).verifier);
            out.verifier = v ?? "dapp";

            const mh = asBytes32((meta as any).modelHash);
            if (mh) out.modelHash = mh;

            const vu = asAddr((meta as any).verifierUsed);
            if (vu) out.verifierUsed = vu;

            if (
              !out.verifierUsed &&
              typeof out.verifier === "string" &&
              out.verifier.startsWith("0x")
            ) {
              out.verifierUsed = out.verifier as `0x${string}`;
            }

            if ("params" in (meta as any)) {
              const coerced = coerceParams((meta as any).params);
              out.params = coerced !== undefined ? coerced : (meta as any).params;
            }

            if (Array.isArray((meta as any).tags)) {
              out.tags = (meta as any).tags.filter(Boolean);
            }
            if ("game" in (meta as any)) out.game = (meta as any).game ?? null;
            if ("mode" in (meta as any)) out.mode = (meta as any).mode ?? null;
            if (typeof (meta as any).createdAt === "number") {
              out.createdAt = (meta as any).createdAt;
            }
            if ((meta as any).externalId) {
              out.externalId = String((meta as any).externalId);
            }

            if ((meta as any).modelId !== undefined) out.modelId = (meta as any).modelId ?? null;
            if ((meta as any).modelKind !== undefined) {
              out.modelKind = (meta as any).modelKind ?? null;
            }
            if ((meta as any).proof !== undefined) out.proof = (meta as any).proof ?? null;

            const catLower = String(out.category ?? "").toLowerCase();
            if (
              (!catLower || !["gaming","fitness","social","custom","walking","running","cycling","hiking","swimming","strength","yoga","hiit","crossfit","rowing","calories","exercise","dota","lol","cs"].includes(catLower)) &&
              (out.game || out.mode)
            ) {
              out.category = "gaming";
            }

            const extras = [
              out.game ? String(out.game) : null,
              out.mode ? String(out.mode) : null,
              out.modelKind ? String(out.modelKind) : null,
            ].filter(Boolean) as string[];

            out.tags = Array.from(new Set([...(out.tags ?? []), ...extras]));

            if (typeof out.params === "string" && out.params.trim()) {
              const obj: Record<string, string | number> = {};
              out.params.split(";").forEach((pair: string) => {
                const [kRaw, vRaw] = pair.split("=");
                const k = (kRaw ?? "").trim();
                const v2 = (vRaw ?? "").trim();
                if (!k) return;
                const asNum = v2 !== "" && !Number.isNaN(Number(v2)) ? Number(v2) : v2;
                obj[k] = asNum;
              });
              if (Object.keys(obj).length) out.form = obj;
            }
          }
        }
      } catch {}
    }

    return NextResponse.json(out, {
      headers: { "Cache-Control": "public, max-age=5" },
    });
  } catch (e) {
    console.error("[challenge/id]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
