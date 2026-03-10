// app/validators/hooks/useSteamBinding.ts
"use client";

import { useAccount } from "wagmi";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export type SteamBinding = {
  platform: "steam";
  wallet: `0x${string}`;
  platformId: string;   // steam64
  handle: string | null;
  ts: number;
} | null;

export function useSteamBinding() {
  const { address, isConnected } = useAccount();
  const search = useSearchParams();
  const steamStatus = search.get("steam"); // ?steam=ok after return

  const [binding, setBinding] = useState<SteamBinding>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setBinding(null);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/linked-accounts?wallet=${address}&platform=steam`,
          { cache: "no-store", signal: ctrl.signal }
        );
        const j = await r.json().catch(() => ({}));
        setBinding((j?.binding ?? null) as SteamBinding);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setBinding(null);
        setError(e?.message || "Failed to load Steam link");
      } finally {
        setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [isConnected, address, steamStatus]);

  return { binding, loading, error, address };
}