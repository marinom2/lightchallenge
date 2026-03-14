import type { Hex } from "viem";

type ChallengeProofRecord =
  | {
      kind: "aivm";
      backend?: "lightchain_aivm" | "lightchain_poi";
      modelId: string;
      params: Record<string, any>;
      paramsHash: Hex;
      benchmarkHash?: Hex | null;
      taskBinding?: {
        schemaVersion?: number;
        requestId?: string | null;
        taskId?: Hex | null;
      } | null;
      [key: string]: any;
    }
  | {
      kind: "zk" | "plonk";
      modelId: string;
      params: Record<string, any>;
      paramsHash: Hex;
      [key: string]: any;
    }
  | null;

function isHex(value?: string | null): value is Hex {
  return !!value && /^0x[0-9a-fA-F]+$/.test(value) && value.length >= 10;
}

export async function saveLocalMeta(payload: {
  id: string;
  title: string;
  description?: string;
  category?: string;
  params?: Record<string, any> | string;
  tags?: string[];
  game?: string | null;
  mode?: string | null;
  createdAt?: number;
  subject?: Hex;
  txHash?: Hex;
  externalId?: string;
  status?: "Active" | "Finalized" | "Canceled";
  modelId?: string | null;
  modelKind?: "aivm" | "zk" | "plonk" | null;
  verificationBackend?:
    | "lightchain_aivm"
    | "lightchain_poi"
    | "zk"
    | "plonk"
    | "api"
    | null;
  proof?: ChallengeProofRecord;
  modelHash?: Hex;
  verifier?: Hex;
  plonkVerifier?: Hex;
  verifierUsed?: Hex;
  paramsHash?: Hex | null;
  benchmarkHash?: Hex | null;
  timeline?: {
    joinClosesAt?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    proofDeadline?: string | null;
  };
  funds?: {
    stake?: string;
    currency?: {
      type: "NATIVE" | "ERC20";
      symbol?: string | null;
      address?: string | null;
    };
  };
  options?: {
    participantCap?: string;
    externalId?: string;
  };
  proofSource?: "API" | "HYBRID" | string;
  invites?: { roster: Array<{ id: string; team?: string | null; wallet?: string | null }> };
}) {
  const safeSubject = isHex(payload.subject ?? null) ? payload.subject : undefined;
  const safeTxHash = isHex(payload.txHash ?? null) ? payload.txHash : undefined;

  const res = await fetch("/api/challenges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      createdAt: payload.createdAt ?? Math.floor(Date.now() / 1000),
      subject: safeSubject,
      txHash: safeTxHash,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `POST /api/challenges failed (${res.status}): ${t || res.statusText}`
    );
  }

  return {
    location: res.headers.get("Location") || `/challenges/${payload.id}`,
    body: await res.json().catch(() => ({})),
  };
}

/**
 * No-op: AIVM pipeline is triggered automatically by the challengeDispatcher
 * worker polling the DB for challenges with passing verdicts.
 * Kept as a stub so callers don't need to be refactored.
 */
export async function triggerAivmPipeline(_challengeId: string) {
  // Intentionally empty — dispatcher handles this automatically.
}