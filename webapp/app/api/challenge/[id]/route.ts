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

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

type Status =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Finalized"
  | "Canceled"
  | "Paused";

type SnapshotOut = {
  set: boolean;
  success: boolean;
  rightSide: number;
  eligibleValidators: number;
  committedPool: string;
  forfeitedPool: string;
  cashback: string;
  forfeitedAfterCashback?: string;
  charityAmt: string;
  protocolAmt: string;
  creatorAmt: string;
  validatorsAmt: string;
  perCommittedBonusX: string;
  perCashbackX: string;
  perValidatorAmt: string;
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
  creator?: `0x${string}`;
  startTs?: string;
  endTs?: string;
  approvalDeadline?: string;
  joinClosesTs?: string;
  peerDeadlineTs?: string;
  createdBlock?: string;
  createdTx?: `0x${string}`;
  winnersClaimed?: number;
  proofRequired?: boolean;
  proofOk?: boolean;
  autoApproved?: boolean;
  fastTracked?: boolean;
  strategy?: `0x${string}` | null;
  peerApprovals?: number;
  peerApprovalsNeeded?: number;
  youAlreadyVoted?: boolean;
  youAreEligibleValidator?: boolean;
  youMeetMinStake?: boolean;
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
  modelKind?: "aivm" | "zk" | "plonk" | null;
  modelHash?: `0x${string}` | null;
  plonkVerifier?: `0x${string}` | null;
  verifierUsed?: `0x${string}` | null;
  proof?: {
    kind: "aivm" | "zk" | "plonk";
    modelId: string;
    params: Record<string, any>;
    paramsHash: `0x${string}`;
    [key: string]: any;
  } | null;
  money?: { stakeWei?: string | null; bondWei?: string | null } | null;
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

function toStatus(n: number): Status {
  switch (n) {
    case 1:
      return "Approved";
    case 2:
      return "Rejected";
    case 3:
      return "Finalized";
    case 4:
      return "Canceled";
    case 5:
      return "Paused";
    default:
      return "Pending";
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

function pickBigIntDeep(obj: any, paths: Array<Array<string>>, fallback: bigint = 0n): bigint {
  for (const path of paths) {
    let cur: any = obj;
    for (const seg of path) {
      if (cur == null) {
        cur = undefined;
        break;
      }
      cur = cur[seg];
    }

    const v = cur;
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(v);
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return BigInt(v);
    }
  }
  return fallback;
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
    const span = BigInt(url.searchParams.get("span") ?? "10000");
    const fromBlock = toBlock > span ? toBlock - span + 1n : 0n;

    const cv: any = await client.readContract({
      abi: cpAbi,
      address: challengePay,
      functionName: "getChallenge",
      args: [id],
    });

    const creator = cv?.challenger as Address | undefined;
    const status = toStatus(Number(cv?.status ?? 0));
    const approvalDeadline = cv?.approvalDeadline
      ? String(cv.approvalDeadline)
      : undefined;
    const peerDeadlineTs = cv?.peerDeadlineTs
      ? String(cv.peerDeadlineTs)
      : undefined;
    const startTs = cv?.startTs ? String(cv.startTs) : undefined;
    const duration = BigInt(cv?.duration ?? 0n);
    const endTs = startTs ? (BigInt(startTs) + duration).toString() : undefined;

    const proofRequired = !!cv?.proofRequired;
    const proofOk = !!cv?.proofOk;
    const peerApprovals = Number(cv?.peerApprovals ?? 0);
    const peerApprovalsNeeded = Number(cv?.peerApprovalsNeeded ?? 0);
    const peers: Address[] = Array.isArray(cv?.peers) ? cv.peers : [];

    const rawSnapshot: any = await client
      .readContract({
        abi: cpAbi,
        address: challengePay,
        functionName: "getSnapshot",
        args: [id],
      })
      .catch(() => null);

    const snapshot: SnapshotOut | undefined = rawSnapshot
      ? {
          set: !!rawSnapshot.set,
          success: !!rawSnapshot.success,
          rightSide: Number(rawSnapshot.rightSide ?? 0),
          eligibleValidators: Number(rawSnapshot.eligibleValidators ?? 0),
          committedPool: (rawSnapshot.committedPool ?? 0n).toString(),
          forfeitedPool: (rawSnapshot.forfeitedPool ?? 0n).toString(),
          cashback: (rawSnapshot.cashback ?? 0n).toString(),
          forfeitedAfterCashback: (rawSnapshot.forfeitedAfterCashback ?? 0n).toString(),
          charityAmt: (rawSnapshot.charityAmt ?? 0n).toString(),
          protocolAmt: (rawSnapshot.protocolAmt ?? 0n).toString(),
          creatorAmt: (rawSnapshot.creatorAmt ?? 0n).toString(),
          validatorsAmt: (rawSnapshot.validatorsAmt ?? 0n).toString(),
          perCommittedBonusX: (rawSnapshot.perCommittedBonusX ?? 0n).toString(),
          perCashbackX: (rawSnapshot.perCashbackX ?? 0n).toString(),
          perValidatorAmt: (rawSnapshot.perValidatorAmt ?? 0n).toString(),
        }
      : undefined;

    const eventNames = [
      "ChallengeCreated",
      "ChallengeApproved",
      "StatusBecameApproved",
      "ChallengeRejected",
      "StatusBecameRejected",
      "Finalized",
      "Paused",
      "Canceled",
      "ProofSubmitted",
      "PrincipalClaimed",
      "ValidatorClaimed",
      "RejectCreatorClaimed",
      "RejectContributionClaimed",
      "CashbackClaimed",
      "StrategySet",
      "SnapshotSet",
      "ValidatorRejectClaimed",
      "PeerVoted",
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
    let strategy: `0x${string}` | null = null;
    let autoApproved = false;
    let fastTracked = false;

    const stakeWei = pickBigIntDeep(
      cv,
      [
        ["stakeWei"],
        ["stake"],
        ["creatorStake"],
        ["creatorStakeWei"],
        ["money", "stakeWei"],
        ["balances", "stakeWei"],
        ["funds", "stakeWei"],
      ],
      0n
    );

    const bondWei = pickBigIntDeep(
      cv,
      [
        ["bondWei"],
        ["proposalBond"],
        ["bond"],
        ["money", "bondWei"],
        ["balances", "bondWei"],
        ["funds", "bondWei"],
      ],
      0n
    );

    const committedOnChain = pickBigIntDeep(
      cv,
      [
        ["treasuryBalanceWei"],
        ["committedWei"],
        ["pool", "committedWei"],
        ["money", "committedWei"],
        ["balances", "committedWei"],
      ],
      0n
    );

    let joinedTotal = 0n;

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
            fastTracked = !!args.fastTracked;
            push(
              "ChallengeCreated",
              fastTracked ? "Created (Fast-Track)" : "Challenge created",
              tx,
              bn,
              t
            );
            break;

          case "StrategySet":
            if (args.strategy && args.strategy !== ZERO_ADDR) {
              strategy = args.strategy;
            }
            push("StrategySet", "Strategy attached", tx, bn, t);
            break;

          case "ChallengeApproved":
          case "StatusBecameApproved":
            autoApproved = true;
            push(dec.eventName, "Approved", tx, bn, t);
            break;

          case "StatusBecameRejected":
          case "ChallengeRejected":
            push(dec.eventName, "Rejected", tx, bn, t);
            break;

          case "Finalized": {
            const outcome = Number(args.outcome ?? 0);
            const label =
              outcome === 1
                ? "Finalized: Success"
                : outcome === 2
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

          case "PrincipalClaimed":
          case "ValidatorClaimed":
          case "RejectCreatorClaimed":
          case "RejectContributionClaimed":
          case "CashbackClaimed":
            winnersClaimed++;
            push(dec.eventName, "Reward claimed", tx, bn, t);
            break;

          case "SnapshotSet":
            push("SnapshotSet", "Snapshot taken", tx, bn, t);
            break;

          case "ValidatorRejectClaimed":
            push("ValidatorRejectClaimed", "Validator reject-claim", tx, bn, t);
            break;

          case "PeerVoted":
            push(
              "PeerVoted",
              args.pass ? "Peer voted: pass" : "Peer voted: fail",
              tx,
              bn,
              t
            );
            break;

          case "Joined": {
            const who =
              args?.who && isAddress(args.who)
                ? (args.who as `0x${string}`)
                : undefined;

            const amt =
              (typeof args?.amount === "bigint" && args.amount) ||
              (typeof args?.value === "bigint" && args.value) ||
              (typeof args?.stake === "bigint" && args.stake) ||
              0n;

            if (amt > 0n) joinedTotal += amt;
            push("Joined", "Joined", tx, bn, t, who);
            break;
          }

          case "FeesBooked":
            push("FeesBooked", "Fees booked", tx, bn, t);
            break;
        }
      }
    }

    timeline.sort((a, b) => Number(BigInt(a.block) - BigInt(b.block)));

    let youAlreadyVoted: boolean | undefined;
    let youAreEligibleValidator: boolean | undefined;
    let youMeetMinStake: boolean | undefined;
    let youJoined: boolean | undefined;

    if (viewer) {
      youAlreadyVoted = (await client
        .readContract({
          abi: cpAbi,
          address: challengePay,
          functionName: "voteLockedFor",
          args: [id, viewer],
        })
        .catch(() => undefined)) as boolean | undefined;

      youAreEligibleValidator = peers.some(
        (p) => p.toLowerCase() === viewer.toLowerCase()
      );

      const minStake = (await client
        .readContract({
          abi: cpAbi,
          address: challengePay,
          functionName: "minValidatorStake",
          args: [],
        })
        .catch(() => undefined)) as bigint | undefined;

      const yourStake = (await client
        .readContract({
          abi: cpAbi,
          address: challengePay,
          functionName: "validatorStake",
          args: [viewer],
        })
        .catch(() => undefined)) as bigint | undefined;

      if (minStake !== undefined && yourStake !== undefined) {
        youMeetMinStake = yourStake >= minStake;
      }

      youJoined = timeline.some(
        (t) =>
          t.name === "Joined" &&
          typeof t.who === "string" &&
          t.who.toLowerCase() === viewer.toLowerCase()
      );
    }

    let committed = committedOnChain;
    if (committed === 0n) committed = stakeWei + bondWei + joinedTotal;

    if (snapshot?.set && snapshot?.committedPool) {
      const snapCommitted = BigInt(snapshot.committedPool || "0");
      if (snapCommitted > committed) committed = snapCommitted;
    }

    const committedWei = committed.toString();

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
      creator: creator as any,
      startTs,
      endTs,
      approvalDeadline,
      joinClosesTs: approvalDeadline,
      peerDeadlineTs,
      createdBlock: created?.block,
      createdTx: created?.tx,
      winnersClaimed,
      proofRequired,
      proofOk,
      autoApproved,
      fastTracked,
      strategy,
      peerApprovals,
      peerApprovalsNeeded,
      youAlreadyVoted: viewer ? youAlreadyVoted : undefined,
      youAreEligibleValidator,
      youMeetMinStake,
      youJoined,
      youAlreadyJoined: youJoined,
      money: { stakeWei: stakeWei.toString(), bondWei: bondWei.toString() },
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

            const pv = asAddr((meta as any).plonkVerifier);
            if (pv) out.plonkVerifier = pv;

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
              (!catLower || !["gaming", "fitness", "social", "custom"].includes(catLower)) &&
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
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.data?.message || e?.shortMessage || e?.message || String(e) },
      { status: 200 }
    );
  }
}