// webapp/app/challenges/create/lib/chainRulesLoader.ts
"use client";

import type { Address, PublicClient } from "viem";
import { ADDR, ABI, ZERO_ADDR } from "@/lib/contracts";

export type ChainPolicyHints = {
  chainNow: number;
  minLeadSec: number;
  maxLeadSec: number | null;
  maxDurSec: number | null;
  paused: boolean;

  allowlistEnabled: boolean;
  tokenAllowed: boolean | null;

  autoApprovalSet: boolean;
  strategyPaused: boolean | null;
  strategyRequireCreatorAllowlist: boolean | null;
  strategyCreatorAllowed: boolean | null;
  strategyAllowNative: boolean | null;
  strategyMinLeadSec: number | null;
  strategyMaxDurSec: number | null;

  loadedAtMs: number;
};

function toNum(x: unknown, fallback = 0): number {
  try {
    if (typeof x === "bigint") return Number(x);
    if (typeof x === "number") return Number.isFinite(x) ? x : fallback;
    if (typeof x === "string" && x.trim() !== "") return Number(x);
  } catch {
    // noop
  }
  return fallback;
}

async function readOptional<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function loadChainPolicyHints(args: {
  pc: PublicClient;
  currencyType: "NATIVE" | "ERC20";
  token: Address | null;
  creator?: Address | null;
}): Promise<ChainPolicyHints> {
  const { pc, currencyType, token, creator } = args;

  if (!ADDR.ChallengePay || ADDR.ChallengePay === ZERO_ADDR) {
    throw new Error("ChallengePay address missing.");
  }

  const [minLeadBn, maxLeadBn, paused, latestBlock] = await Promise.all([
    pc.readContract({
      abi: ABI.ChallengePay,
      address: ADDR.ChallengePay,
      functionName: "minLeadTime",
    }) as Promise<bigint>,

    pc.readContract({
      abi: ABI.ChallengePay,
      address: ADDR.ChallengePay,
      functionName: "maxLeadTime",
    }) as Promise<bigint>,

    pc.readContract({
      abi: ABI.ChallengePay,
      address: ADDR.ChallengePay,
      functionName: "globalPaused",
    }) as Promise<boolean>,

    pc.getBlock(),
  ]);

  const chainNow = toNum((latestBlock as { timestamp?: bigint })?.timestamp, Math.floor(Date.now() / 1000));
  const minLeadSec = Math.max(0, toNum(minLeadBn, 0));
  const maxLeadSecRaw = toNum(maxLeadBn, 0);
  const maxLeadSec = maxLeadSecRaw > 0 ? maxLeadSecRaw : null;

  const allowlistEnabled = await readOptional(
    async () =>
      (await pc.readContract({
        abi: ABI.ChallengePay,
        address: ADDR.ChallengePay,
        functionName: "useTokenAllowlist",
      })) as boolean,
    false
  );

  let tokenAllowed: boolean | null = null;
  if (allowlistEnabled && currencyType === "ERC20") {
    if (!token || token === ZERO_ADDR) {
      tokenAllowed = false;
    } else {
      tokenAllowed = await readOptional(
        async () =>
          (await pc.readContract({
            abi: ABI.ChallengePay,
            address: ADDR.ChallengePay,
            functionName: "allowedToken",
            args: [token],
          })) as boolean,
        null
      );
    }
  }

  const maxDurBn = await readOptional(
    async () =>
      (await pc.readContract({
        abi: ABI.ChallengePay,
        address: ADDR.ChallengePay,
        functionName: "maxDuration",
      })) as bigint,
    0n
  );

  const maxDurSec = toNum(maxDurBn, 0) > 0 ? toNum(maxDurBn, 0) : null;

  const autoApprovalSet = ADDR.AutoApprovalStrategy !== ZERO_ADDR;

  let strategyPaused: boolean | null = null;
  let strategyRequireCreatorAllowlist: boolean | null = null;
  let strategyCreatorAllowed: boolean | null = null;
  let strategyAllowNative: boolean | null = null;
  let strategyMinLeadSec: number | null = null;
  let strategyMaxDurSec: number | null = null;

  if (autoApprovalSet) {
    const [sp, reqAllow, allowNative, sMinLead, sMaxDur] = await Promise.all([
      readOptional(
        async () =>
          (await pc.readContract({
            abi: ABI.AutoApprovalStrategy,
            address: ADDR.AutoApprovalStrategy,
            functionName: "paused",
          })) as boolean,
        null
      ),
      readOptional(
        async () =>
          (await pc.readContract({
            abi: ABI.AutoApprovalStrategy,
            address: ADDR.AutoApprovalStrategy,
            functionName: "requireCreatorAllowlist",
          })) as boolean,
        null
      ),
      readOptional(
        async () =>
          (await pc.readContract({
            abi: ABI.AutoApprovalStrategy,
            address: ADDR.AutoApprovalStrategy,
            functionName: "allowNative",
          })) as boolean,
        null
      ),
      readOptional(
        async () =>
          (await pc.readContract({
            abi: ABI.AutoApprovalStrategy,
            address: ADDR.AutoApprovalStrategy,
            functionName: "minLeadTime",
          })) as bigint,
        null as bigint | null
      ),
      readOptional(
        async () =>
          (await pc.readContract({
            abi: ABI.AutoApprovalStrategy,
            address: ADDR.AutoApprovalStrategy,
            functionName: "maxDuration",
          })) as bigint,
        null as bigint | null
      ),
    ]);

    strategyPaused = sp;
    strategyRequireCreatorAllowlist = reqAllow;
    strategyAllowNative = allowNative;
    strategyMinLeadSec = sMinLead == null ? null : toNum(sMinLead, 0);
    strategyMaxDurSec = sMaxDur == null ? null : toNum(sMaxDur, 0);

    if (creator && reqAllow) {
      strategyCreatorAllowed = await readOptional(
        async () =>
          (await pc.readContract({
            abi: ABI.AutoApprovalStrategy,
            address: ADDR.AutoApprovalStrategy,
            functionName: "creatorAllowed",
            args: [creator],
          })) as boolean,
        null
      );
    }
  }

  return {
    chainNow,
    minLeadSec,
    maxLeadSec,
    maxDurSec,
    paused: !!paused,
    allowlistEnabled: !!allowlistEnabled,
    tokenAllowed,
    autoApprovalSet,
    strategyPaused,
    strategyRequireCreatorAllowlist,
    strategyCreatorAllowed,
    strategyAllowNative,
    strategyMinLeadSec,
    strategyMaxDurSec,
    loadedAtMs: Date.now(),
  };
}