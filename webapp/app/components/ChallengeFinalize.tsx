// app/components/ChallengeFinalize.tsx
"use client";

import * as React from "react";
import type { Abi } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";
import { useToasts } from "@/lib/ui/toast";

type Status = "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";

type Props = {
  id: bigint;
  /** Optional — if provided we’ll disable the button when already Finalized */
  status?: Status;
  /** Optional: called after a successful tx so parent can refresh */
  onFinalized?: () => void;
};

export default function ChallengeFinalize({ id, status, onFinalized }: Props) {
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { push } = useToasts();

  const [busy, setBusy] = React.useState(false);
  const alreadyFinal = status === "Finalized";
  const canFinalize = status === "Approved" || status === "Paused" || status === "Rejected" || status === "Pending";
  // Note: contract allows finalize in multiple states (e.g., Pending past deadlines → Rejected path)

  async function finalizeNow() {
    if (!pc) return push("No public client");
    try {
      setBusy(true);
      push(`Submitting finalize(${id.toString()})…`);

      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as unknown as Abi,
        address: ADDR.ChallengePay!,
        functionName: "finalize",
        args: [id],
      });

      push("Pending confirmation…");
      const r = await pc.waitForTransactionReceipt({ hash });
      if (r.status === "success") {
        push("Finalized ✅");
        onFinalized?.();
      } else {
        push("Finalize failed ❌");
      }
    } catch (e: any) {
      push(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-[color:var(--text-muted)]">
        Finalize challenge <span className="mono">#{id.toString()}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`btn ${busy ? "btn-primary loading" : "btn-primary"}`}
          onClick={finalizeNow}
          disabled={busy || alreadyFinal || !canFinalize}
          title={alreadyFinal ? "Already finalized" : !canFinalize ? "Not eligible to finalize yet" : "Finalize now"}
        >
          {busy ? "Finalizing…" : alreadyFinal ? "Finalized" : "Finalize"}
        </button>

        <span className="text-xs text-[color:var(--text-muted)]">
          A background keeper also runs auto-finalize. Use this if you want to force settlement now.
        </span>
      </div>
    </div>
  );
}