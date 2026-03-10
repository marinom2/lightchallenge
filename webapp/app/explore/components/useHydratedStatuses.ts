// app/explore/hooks/useHydratedStatuses.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address, Abi } from "viem";
import { usePublicClient } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";

type Status =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Finalized"
  | "Canceled"
  | "Paused";

// on-chain enum mapping (index -> UI label)
const STATUS_LABEL = [
  "Pending",
  "Approved",
  "Rejected",
  "Finalized",
  "Canceled",
  "Paused",
] as const;

export function useHydratedStatuses(ids: bigint[] | undefined) {
  const pc = usePublicClient();
  const [map, setMap] = useState<Map<string, Status>>(new Map());

  // de-dupe + cap so we don’t issue huge multicalls
  const uniqIds = useMemo(() => {
    const s = new Set<string>();
    (ids ?? []).forEach((i) => s.add(i.toString()));
    return Array.from(s).slice(0, 60);
  }, [ids]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!pc || uniqIds.length === 0) return;
      try {
        const contracts = uniqIds.map((id) => ({
          address: ADDR.ChallengePay as Address,
          abi: ABI.ChallengePay as Abi,
          functionName: "getChallenge" as const,
          args: [BigInt(id)],
        }));

        const res = await pc.multicall({ contracts, allowFailure: true });

        const next = new Map<string, Status>();
        res.forEach((r, idx) => {
          const key = uniqIds[idx];
          if (r.status !== "success" || !Array.isArray(r.result)) {
            next.set(key, "Pending");
            return;
          }
          // viem tuple: status usually at index 2 (or named .status depending on ABI coder)
          const raw = (r.result as any).status ?? (r.result as any)[2];
          const n = Number(raw);
          const label = (STATUS_LABEL[n] ?? "Pending") as Status;
          next.set(key, label);
        });

        if (!stop) setMap(next);
      } catch {
        // soft-fail: keep previous map
      }
    })();
    return () => {
      stop = true;
    };
  }, [pc, uniqIds]);

  return map;
}