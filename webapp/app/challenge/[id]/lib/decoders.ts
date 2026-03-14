// webapp/app/challenge/[id]/lib/decoders.ts
// Chain data decoders and API normalizer — aligned with ChallengePay V1

import type { ApiOut, Status } from "./types";
import { STATUS_LABEL } from "./types";
import { isHexAddress, dedupeStrings } from "./utils";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Helpers that try a named property first, then fall back to positional
 * index into the raw struct array returned by wagmi/viem.
 */
function num(c: any, x: any, fallbackIdx?: number): number | null {
  const v = x ?? (fallbackIdx != null ? c[fallbackIdx] : undefined);
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function bigOrStr(c: any, x: any, fallbackIdx?: number): bigint | null {
  const v = x ?? (fallbackIdx != null ? c[fallbackIdx] : undefined);
  if (typeof v === "bigint") return v;
  if (typeof v === "string") {
    try { return BigInt(v); } catch { return null; }
  }
  return null;
}

function addr(c: any, x: any, fallbackIdx?: number): `0x${string}` | null {
  const v = x ?? (fallbackIdx != null ? c[fallbackIdx] : undefined);
  return isHexAddress(v) ? (v as `0x${string}`) : null;
}

export function decodeSnapshot(raw: unknown): { set: boolean; success?: boolean } {
  const s: any = raw ?? {};
  const setRaw = s.set ?? s[0];
  const okRaw = s.success ?? s[1];
  const set = Boolean(setRaw);
  const success = okRaw == null ? undefined : Boolean(okRaw);
  return { set, success };
}

/**
 * Decodes ChallengeView struct from ChallengePay V1.
 *
 * V1 ChallengeView positional layout:
 *  0: id, 1: kind, 2: status, 3: outcome,
 *  4: creator, 5: currency, 6: token, 7: stake,
 *  8: joinClosesTs, 9: startTs, 10: duration, 11: maxParticipants,
 *  12: pool, 13: participantsCount,
 *  14: verifier, 15: proofDeadlineTs,
 *  16: winnersCount, 17: winnersPool,
 *  18: paused, 19: canceled, 20: payoutsDone
 */
export function decodeChallenge(raw: unknown) {
  const c: any = raw ?? {};

  const statusIdx = (() => {
    const v = c.status ?? c[2];
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
    return 0;
  })();

  return {
    status: (STATUS_LABEL[statusIdx] as Status) ?? "Active",

    token: addr(c, c.token, 6) ?? (ZERO as `0x${string}`),
    currency: num(c, c.currency, 5),
    poolWei: bigOrStr(c, c.pool, 12),
    stakeWei: bigOrStr(c, c.stake, 7),

    joinClosesTs: num(c, c.joinClosesTs, 8),
    startTs: num(c, c.startTs, 9),
    duration: num(c, c.duration, 10),
    proofDeadlineTs: num(c, c.proofDeadlineTs, 15),

    maxParticipants: num(c, c.maxParticipants, 11),
    participantsCount: num(c, c.participantsCount, 13),

    verifier: addr(c, c.verifier, 14),
    winnersCount: num(c, c.winnersCount, 16),
    winnersPool: bigOrStr(c, c.winnersPool, 17),

    kind: num(c, c.kind, 1),
    outcome: num(c, c.outcome, 3),
    paused: (() => {
      const v = c.paused ?? c[18];
      return v === true || v === 1 || v === 1n;
    })(),
    canceled: (() => {
      const v = c.canceled ?? c[19];
      return v === true || v === 1 || v === 1n;
    })(),
    payoutsDone: (() => {
      const v = c.payoutsDone ?? c[20];
      return v === true || v === 1 || v === 1n;
    })(),
  };
}

export function normalizeApi(id: string, d: any, m: any | null): ApiOut {
  const timelineRaw = Array.isArray(d?.timeline) ? d.timeline : [];
  const status: Status = STATUS_LABEL.includes(d?.status) ? d.status : (d?.status as Status) ?? "Active";

  return {
    ...(d as ApiOut),
    id: d?.id ?? id,
    status,
    title: d?.title || m?.title || `Challenge #${id}`,
    description: d?.description || m?.description || "",
    category: d?.category || m?.category || null,
    game: d?.game ?? m?.game ?? null,
    mode: d?.mode ?? m?.mode ?? null,
    externalId: d?.externalId || m?.externalId,
    modelId: d?.modelId ?? m?.modelId ?? null,
    modelKind: d?.modelKind ?? m?.modelKind ?? null,
    modelHash: d?.modelHash ?? m?.modelHash ?? null,
    verifierUsed: d?.verifierUsed ?? m?.verifierUsed ?? null,
    proof: d?.proof ?? m?.proof ?? null,
    params: d?.params ?? m?.params ?? "",
    createdAt: d?.createdAt ?? m?.createdAt,
    tags: Array.from(new Set([...(dedupeStrings(d?.tags)), ...(dedupeStrings(m?.tags))])),
    timeline: timelineRaw,
  };
}
