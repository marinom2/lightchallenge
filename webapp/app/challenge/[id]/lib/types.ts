// webapp/app/challenge/[id]/lib/types.ts
// Shared types for the challenge detail page

import type { Status as _Status } from "@/lib/types/status";
export type Status = _Status;
export { STATUS_LABEL } from "@/lib/types/status";

export type SnapshotOut = {
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
  schedule?: {
    joinClosesTs?: number | string | null;
    startTs?: number | string | null;
    endTs?: number | string | null;
  } | null;
  money?: { stakeWei?: string | null } | null;
  meta?: { title?: string; description?: string } | null;
};

export type ApiOut = {
  id: string;
  status: Status;

  creator?: `0x${string}`;
  startTs?: string | number | null;
  endTs?: string | number | null;
  createdBlock?: string;
  createdTx?: `0x${string}`;
  winnersClaimed?: number;
  proofRequired?: boolean;
  proofOk?: boolean;

  kindKey?: string | null;
  category?: string | null;
  game?: string | null;
  mode?: string | null;

  title?: string;
  description?: string;
  params?: Record<string, any> | string;
  verifier?: string;
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
  } | null;

  money?: { stakeWei?: string | null } | null;
  pool?: { committedWei?: string | null } | null;

  snapshot?: SnapshotOut | null;
  timeline: Array<{
    name: string;
    label: string;
    tx: `0x${string}`;
    block: string;
    timestamp?: number;
    challengeId?: string | number;
    who?: `0x${string}`;
  }>;

  meta?: { title?: string; description?: string } | null;
  schedule?: {
    joinClosesTs?: number | string | null;
    startTs?: number | string | null;
    endTs?: number | string | null;
  } | null;

  createdAt?: number;
  tags?: string[];
};

export type TabKey = "details" | "economics" | "model" | "onchain" | "links" | "params";
