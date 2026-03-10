import { ABI, ADDR, makeWalletClient } from "@/lib/contracts";
import { lightchain } from "@/lib/lightchain";
import type { Address, Hex } from "viem";

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

const ZERO: Address = "0x0000000000000000000000000000000000000000";

function isHex(value?: string | null): value is Hex {
  return !!value && /^0x[0-9a-fA-F]+$/.test(value) && value.length >= 10;
}

function isAddr(value?: string | null): value is Address {
  return !!value && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function getBaseUrlSafe(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }

  const envBase = (process.env.NEXT_PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (envBase) return envBase;
  return "";
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
  status?: "Pending" | "Approved" | "Rejected" | "Finalized";
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
    peerDeadline?: string | null;
  };
  funds?: {
    stake?: string;
    bond?: string;
    currency?: {
      type: "NATIVE" | "ERC20";
      symbol?: string | null;
      address?: string | null;
    };
  };
  options?: {
    participantCap?: string;
    charity?: { percent?: string; address?: string };
    externalId?: string;
  };
  peers?: string[];
  peerApprovalsNeeded?: number;
  proofSource?: "API" | "HYBRID" | "PEERS" | string;
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

export async function setRegistryUriHttp({
  id,
  account,
}: {
  id: bigint;
  account: Address;
}) {
  if (!isAddr(ADDR.MetadataRegistry) || ADDR.MetadataRegistry === ZERO) return;
  if (!isAddr(ADDR.ChallengePay) || ADDR.ChallengePay === ZERO) return;

  const base = getBaseUrlSafe();
  const envBase = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();

  const isLocal =
    base.includes("localhost") ||
    base.includes("127.0.0.1") ||
    base.includes("0.0.0.0");

  if (!base) {
    console.warn(
      "setRegistryUriHttp skipped: base URL unavailable (set NEXT_PUBLIC_BASE_URL in prod)."
    );
    return;
  }

  if (isLocal && !envBase) {
    console.warn(
      "setRegistryUriHttp skipped: refusing localhost URI without NEXT_PUBLIC_BASE_URL set."
    );
    return;
  }

  const uri = `${base}/api/challenges/meta/${id.toString()}`;
  const wallet = makeWalletClient({ account });

  try {
    await wallet.writeContract({
      address: ADDR.MetadataRegistry,
      abi: ABI.MetadataRegistry,
      functionName: "challengerSet",
      args: [ADDR.ChallengePay, id, uri],
      chain: lightchain,
    });
  } catch (e: any) {
    console.warn("setRegistryUriHttp failed:", e?.shortMessage || e?.message || e);
  }
}

export async function triggerAivmPipeline(challengeId: string) {
  try {
    const res = await fetch(`/api/challenges/${challengeId}/aivm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `triggerAivmPipeline failed (${res.status}): ${text || res.statusText}`
      );
    }
  } catch (e: any) {
    console.warn("triggerAivmPipeline failed:", e?.message || e);
  }
}