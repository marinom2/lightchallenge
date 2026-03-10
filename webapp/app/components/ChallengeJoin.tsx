// app/components/ChallengeJoin.tsx
"use client";

import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { parseEther } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { useToasts } from "@/lib/ui/toast";

type Props = {
  id: bigint;
  // on-chain view helpers
  status: "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";
  startTs?: number;   // seconds
  currency?: number;  // 0 = native, 1 = erc20 (optional now)
};

export default function ChallengeJoin({ id, status, startTs, currency = 0 }: Props) {
  const { address, isConnected } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { push: toast } = useToasts();

  const [amt, setAmt] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const now = Math.floor(Date.now() / 1000);
  const notStartedYet = typeof startTs === "number" ? now < startTs : true;

  // Simple joinability rule: must not be finalized/canceled/rejected; should start in the future
  // (If your contract allows joining after start, relax this)
  const canJoin = useMemo(() => {
    if (!notStartedYet) return false;
    if (status === "Rejected" || status === "Finalized" || status === "Canceled") return false;
    return true;
  }, [status, notStartedYet]);

  const isNative = currency === 0;

  async function join() {
    try {
      if (!isConnected) throw new Error("Connect your wallet first");
      if (!pc) throw new Error("Public client unavailable");
      if (!amt || Number(amt) <= 0) throw new Error("Enter a positive amount");

      setBusy(true);
      toast("Join submitted…");

      if (!isNative) {
        // TODO: implement ERC-20 approve + joinChallengeToken (needs token + amount)
        throw new Error("This challenge uses ERC-20. Please add token-join flow.");
      }

      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as Abi,
        address: ADDR.ChallengePay,
        functionName: "joinChallengeNative",
        args: [id],
        value: parseEther(amt), // LCAI native amount
      });

      toast("Join pending confirmation…");
      const r = await pc.waitForTransactionReceipt({ hash });
      if (r.status === "success") {
        toast("Joined successfully ✅");
        setAmt("");
      } else {
        toast("Join failed ❌");
      }
    } catch (e: any) {
      toast(e?.shortMessage || e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-[color:var(--text-muted)]">Join challenge</div>
      <div className="flex items-center gap-2">
        <input
          className="input w-40"
          inputMode="decimal"
          placeholder={isNative ? "Amount (LCAI)" : "Amount"}
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          disabled={!canJoin || busy}
        />
        <button
          className={`btn ${busy ? "btn-primary loading" : "btn-primary"}`}
          disabled={!canJoin || busy || !amt}
          onClick={join}
          title={canJoin ? "Join with your stake" : "Joining not available"}
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>

      {!isConnected && (
        <div className="text-xs text-[color:var(--text-muted)]">
          Connect your wallet to join.
        </div>
      )}
      {!canJoin && (
        <div className="text-xs text-[color:var(--text-muted)]">
          Joining is unavailable for this challenge (already started or not joinable).
        </div>
      )}
    </div>
  );
}