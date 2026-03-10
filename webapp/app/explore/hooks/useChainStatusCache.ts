"use client";
import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";

export type Status =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Finalized"
  | "Canceled"
  | "Paused";

const STATUS_LABEL: Status[] = [
  "Pending",
  "Approved",
  "Rejected",
  "Finalized",
  "Canceled",
  "Paused",
];

export default function useChainStatusCache(ids: bigint[] = [], intervalMs = 10000) {
  const pc = usePublicClient();
  const [map, setMap] = useState<Record<string, Status>>({});

  const uniqIds = useMemo(() => {
    const s = new Set<string>();
    (ids ?? []).forEach((i) => s.add(i.toString()));
    return Array.from(s).slice(0, 60); // cap: avoid giant multicalls
  }, [ids]);

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!pc || uniqIds.length === 0) return;
      try {
        const contracts = uniqIds.map((id) => ({
          address: ADDR.ChallengePay as `0x${string}`,
          abi: ABI.ChallengePay,
          functionName: "getChallenge" as const,
          args: [BigInt(id)],
        }));
        const res = await pc.multicall({ contracts, allowFailure: true });
        if (stop) return;

        const next: Record<string, Status> = {};
        res.forEach((r, i) => {
          if (r.status !== "success" || r.result == null) return;

          // Try common struct/tuple shapes defensively
          const result: any = r.result;
          const raw =
            result?.status ??
            result?.[0]?.status ??
            result?.[2] ??
            0;

          const idx = Number(raw);
          const label = STATUS_LABEL[idx] ?? "Pending";
          next[uniqIds[i]] = label;
        });

        if (!stop && Object.keys(next).length) setMap(next);
      } catch {
        // soft-fail
      }
    })();

    const t = setInterval(() => {
      // trigger refresh
      setMap((m) => ({ ...m }));
    }, intervalMs);

    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [pc, uniqIds, intervalMs]);

  return map;
}