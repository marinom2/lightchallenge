// app/components/StrategyStatusPill.tsx
"use client";

import { useEffect, useState } from "react";
import { ADDR, ABI, publicClient } from "@/lib/contracts";
import type { Address } from "viem";

export default function StrategyStatusPill() {
  const [status, setStatus] = useState<
    "checking" | "active" | "paused" | "restricted" | "error"
  >("checking");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const addr = ADDR.AutoApprovalStrategy as Address;
        if (!addr || addr === "0x0000000000000000000000000000000000000000") {
          setStatus("error");
          return;
        }
        const code = await publicClient.getBytecode({ address: addr });
        if (!code || code === "0x") {
          setStatus("error");
          return;
        }

        const paused = (await publicClient.readContract({
          abi: ABI.AutoApprovalStrategy,
          address: addr,
          functionName: "paused",
        })) as boolean;
        if (paused) {
          setStatus("paused");
          return;
        }

        const requireAllowlist = (await publicClient.readContract({
          abi: ABI.AutoApprovalStrategy,
          address: addr,
          functionName: "requireCreatorAllowlist",
        })) as boolean;
        if (requireAllowlist) {
          setStatus("restricted");
          return;
        }

        setStatus("active");
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const color =
    status === "active"
      ? "bg-green-500"
      : status === "paused"
      ? "bg-yellow-500"
      : status === "restricted"
      ? "bg-blue-500"
      : status === "checking"
      ? "bg-gray-400 animate-pulse"
      : "bg-red-500";

  const label =
    status === "checking"
      ? "Checking..."
      : status === "active"
      ? "Auto-Approve: ON"
      : status === "paused"
      ? "Strategy Paused"
      : status === "restricted"
      ? "Allowlist Mode"
      : "Not Found";

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium text-white ${color}`}
    >
      <span>{label}</span>
    </div>
  );
}