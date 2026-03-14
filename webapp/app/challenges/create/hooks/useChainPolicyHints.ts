// webapp/app/challenges/create/hooks/useChainPolicyHints.ts
"use client";

import * as React from "react";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import type { ChainPolicyHints } from "../lib/chainRulesLoader";
import { loadChainPolicyHints } from "../lib/chainRulesLoader";

type Args = {
  currencyType: "NATIVE" | "ERC20";
  token: Address | null;
};

function makeEmptyHints(): ChainPolicyHints {
  return {
    chainNow: Math.floor(Date.now() / 1000),
    minLeadSec: 0,
    maxLeadSec: null,
    maxDurSec: null,
    paused: false,
    allowlistEnabled: false,
    tokenAllowed: null,
    loadedAtMs: 0,
  };
}

export function useChainPolicyHints(args: Args) {
  const pc = usePublicClient();
  const { address } = useAccount();

  const [hints, setHints] = React.useState<ChainPolicyHints | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!pc) {
      setHints(makeEmptyHints());
      setError("Public client not available.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await loadChainPolicyHints({
        pc,
        currencyType: args.currencyType,
        token: args.token,
        creator: address ?? null,
      });
      setHints(res);
    } catch (e: any) {
      setHints(makeEmptyHints());
      setError(e?.shortMessage || e?.message || "Failed to load chain policy.");
    } finally {
      setLoading(false);
    }
  }, [pc, args.currencyType, args.token, address]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return {
    hints,
    loading,
    error,
    paused: hints?.paused ?? false,
    reload: load,
  };
}