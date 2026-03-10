// app/api/_utils/challengeEvents.ts
import { decodeEventLog, type Abi, type Log, type Address } from "viem";
import { ABI } from "@/lib/contracts";

export type Status =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Finalized"
  | "Canceled"
  | "Paused";

export type ChallengeState = {
  id: bigint;
  creator?: Address;
  status: Status;
  proofRequired?: boolean;
  proofOk?: boolean;
  winnersClaimed?: number;
  createdBlock?: bigint;
  createdTx?: `0x${string}`;
  startTs?: bigint;
  timeline: Array<{
    name: string;
    label: string;
    tx: `0x${string}`;
    block: string;
    timestamp?: number;
  }>;
};

const abi: Abi = ABI.ChallengePay;
export const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

export const ALL_EVENT_NAMES = [
  "ChallengeCreated",
  "StatusBecameApproved",
  "StatusBecameRejected",
  "ChallengeRejected",
  "Finalized",
  "Paused",
  "Canceled",
  "ProofSubmitted",
  "WinnerClaimed",
  "PrincipalClaimed",
  "ValidatorClaimed",
  "RejectCreatorClaimed",
  "RejectContributionClaimed",
  "StrategySet",
  "SnapshotSet",
  "CashbackClaimed",
  "ValidatorRejectClaimed",
  "PeerVoted",
  "Joined",
  "FeesBooked",
] as const;

export function toStatus(n: number): Status {
  switch (n) {
    case 1: return "Approved";
    case 2: return "Rejected";
    case 3: return "Finalized";
    case 4: return "Canceled";
    default: return "Pending";
  }
}

export function decodeSafe(l: Log): { eventName?: string; args?: any } | null {
  try {
    const d = decodeEventLog({ abi, data: l.data, topics: l.topics }) as unknown as {
      eventName?: string; args?: any
    };
    return d?.eventName ? d : null;
  } catch {
    return null;
  }
}

export function safeDecodeId(l: Log): bigint | undefined {
  const dec = decodeSafe(l);
  if (!dec) return;
  const a: any = dec.args;
  const raw = a?.id ?? a?.challengeId ?? a?.challenge?.id;
  try { return raw !== undefined ? BigInt(raw) : undefined; } catch { return; }
}

export function safeDecodeCreated(l: Log): {
  id?: bigint; creator?: Address; startTs?: bigint;
} | null {
  const d = decodeSafe(l);
  if (!d || d.eventName !== "ChallengeCreated") return null;
  try {
    const a: any = d.args;
    const id = BigInt(a.id);
    const creator = (a.challenger ?? a.creator) as Address | undefined;
    const startTs =
      typeof a.startTs === "bigint"
        ? a.startTs
        : typeof a.challenge?.startTs === "bigint"
        ? a.challenge.startTs
        : undefined;
    return { id, creator, startTs };
  } catch {
    return null;
  }
}

export function createEmptyState(id: bigint, base: Status = "Pending"): ChallengeState {
  return { id, status: base, timeline: [], winnersClaimed: 0 };
}

/** Apply a decoded event to state (assumes event belongs to this id). */
export function applyEventToState(
  s: ChallengeState,
  dec: { eventName: string; args: any },
  l: Log
) {
  const bn = l.blockNumber!;
  const tx = l.transactionHash as `0x${string}`;

  switch (dec.eventName) {
    case "ChallengeCreated": {
      if (!s.createdBlock) s.createdBlock = bn;
      if (!s.createdTx) s.createdTx = tx;
      s.status = "Pending";
      s.timeline.push({ name: "ChallengeCreated", label: "Challenge created", tx, block: bn.toString() });
      break;
    }
    case "StatusBecameApproved":
      s.status = "Approved";
      s.timeline.push({ name: "StatusBecameApproved", label: "Approved by validators", tx, block: bn.toString() });
      break;

    case "StatusBecameRejected":
    case "ChallengeRejected":
      s.status = "Rejected";
      s.timeline.push({ name: "StatusBecameRejected", label: "Rejected by validators", tx, block: bn.toString() });
      break;

    case "Finalized": {
      s.status = "Finalized";
      const outcome = Number(dec.args?.outcome ?? 0);
      const label = outcome === 1 ? "Finalized: Success" : outcome === 2 ? "Finalized: Fail" : "Finalized";
      s.timeline.push({ name: "Finalized", label, tx, block: bn.toString() });
      break;
    }

    case "Paused": {
      const paused = Boolean(dec.args?.paused ?? dec.args?.p);
      s.status = paused ? "Paused" : s.status;
      s.timeline.push({ name: "Paused", label: paused ? "Paused" : "Unpaused", tx, block: bn.toString() });
      break;
    }

    case "Canceled":
      s.status = "Canceled";
      s.timeline.push({ name: "Canceled", label: "Challenge canceled", tx, block: bn.toString() });
      break;

    case "ProofSubmitted":
      s.proofRequired = true;
      if (dec.args?.ok) s.proofOk = true;
      s.timeline.push({
        name: "ProofSubmitted",
        label: dec.args?.ok ? "Proof validated OK" : "Proof submitted (pending)",
        tx, block: bn.toString(),
      });
      break;

    case "WinnerClaimed":
    case "PrincipalClaimed":
    case "ValidatorClaimed":
    case "RejectCreatorClaimed":
    case "RejectContributionClaimed":
      s.winnersClaimed = (s.winnersClaimed ?? 0) + 1;
      s.timeline.push({ name: dec.eventName, label: "Reward claimed", tx, block: bn.toString() });
      break;

    case "StrategySet":
      s.timeline.push({ name: "StrategySet", label: "Strategy attached", tx, block: bn.toString() });
      break;

    case "SnapshotSet":
      s.timeline.push({ name: "SnapshotSet", label: "Snapshot taken", tx, block: bn.toString() });
      break;

    case "CashbackClaimed":
      s.timeline.push({ name: "CashbackClaimed", label: "Cashback claimed", tx, block: bn.toString() });
      break;

    case "ValidatorRejectClaimed":
      s.timeline.push({ name: "ValidatorRejectClaimed", label: "Validator reject-claim", tx, block: bn.toString() });
      break;

    case "PeerVoted":
      s.timeline.push({ name: "PeerVoted", label: (dec.args?.pass ? "Peer voted: pass" : "Peer voted: fail"), tx, block: bn.toString() });
      break;

    case "Joined":
      s.timeline.push({ name: "Joined", label: "Joined", tx, block: bn.toString() });
      break;

    case "FeesBooked":
      s.timeline.push({ name: "FeesBooked", label: "Fees booked", tx, block: bn.toString() });
      break;
  }
}

/** Choose the visible status: prefer state.status (latest event), else base. */
export function normalizeStatus(base: Status, s: ChallengeState): Status {
  return s.status ?? base;
}