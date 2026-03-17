"use client";

import { useEffect, useState } from "react";

/** Fetches live LCAI/USD price from /api/token-price. Refreshes every 60s. */
export function useTokenPrice(): number | null {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;

    async function load() {
      try {
        const r = await fetch("/api/token-price", { cache: "no-store" });
        const j = await r.json();
        if (!dead && typeof j?.usd === "number") setPrice(j.usd);
      } catch {
        // keep stale value
      }
    }

    load();
    const interval = setInterval(load, 60_000);
    return () => { dead = true; clearInterval(interval); };
  }, []);

  return price;
}
