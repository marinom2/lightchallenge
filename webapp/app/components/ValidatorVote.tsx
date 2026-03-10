// app/components/ValidatorVote.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { useToasts } from "@/lib/ui/toast";

/**
 * Minimal props you likely have from /api/challenge/[id]
 * If you later expose more from the API (like peerApprovals / needed),
 * you can show progress too.
 */
type Props = {
  id: bigint | string;
  // gating/eligibility
  canVote: boolean;         // caller is an eligible validator
  minStakeMet: boolean;     // meets min validator stake (or not)
  alreadyVoted?: boolean;   // if known (optional)
  deadlineTs?: number;      // unix seconds (optional; shows countdown)
  deadlinePassed?: boolean; // quick guard (optional)

  onVoted?: () => void;     // ask parent to refresh after a vote
};

export default function ValidatorVote({
  id,
  canVote,
  minStakeMet,
  alreadyVoted,
  deadlineTs,
  deadlinePassed,
  onVoted,
}: Props) {
  const challengeId = typeof id === "string" ? BigInt(id) : id;
  const { address } = useAccount();
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { push } = useToasts();

  const [busy, setBusy] = useState<null | "yes" | "no">(null);
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));

  // optional soft timer to keep countdown fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const passed = useMemo(() => {
    if (typeof deadlinePassed === "boolean") return deadlinePassed;
    if (deadlineTs && deadlineTs > 0) return now > deadlineTs;
    return false;
  }, [deadlinePassed, deadlineTs, now]);

  const disabled = useMemo(
    () => !canVote || !minStakeMet || !!alreadyVoted || passed || busy !== null,
    [canVote, minStakeMet, alreadyVoted, passed, busy]
  );

  const countdown = useMemo(() => {
    if (!deadlineTs || deadlineTs <= 0) return null;
    const diff = deadlineTs - now;
    const s = Math.abs(diff);
    const sec = s % 60;
    const m = Math.floor(s / 60) % 60;
    const h = Math.floor(s / 3600);
    return diff >= 0 ? `closes in ${h}h ${m}m ${sec}s` : `closed ${h}h ${m}m ${sec}s ago`;
  }, [deadlineTs, now]);

  async function cast(yes: boolean) {
    if (!pc) return push("No public client available");
    if (!address) return push("Connect a wallet eligible to vote");
    if (!canVote) return push("You are not eligible to vote on this challenge");

    try {
      setBusy(yes ? "yes" : "no");
      push(yes ? "Submitting Approve…" : "Submitting Reject…");

      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as unknown as Abi,
        address: ADDR.ChallengePay!,
        functionName: "approveChallenge",        
        args: [challengeId, yes] as [bigint, boolean],
      });

      push("Pending confirmation…");
      const r = await pc.waitForTransactionReceipt({ hash });
      if (r.status === "success") {
        push(yes ? "Approved ✅" : "Rejected ✅");
        onVoted?.();
      } else {
        push("Vote failed ❌");
      }
    } catch (e: any) {
      push(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div className="font-semibold">Validator vote</div>
      </header>
      <div className="panel-body space-y-2">
        <div className="flex gap-2">
          <button
            disabled={disabled}
            onClick={() => cast(true)}
            className={`btn ${busy === "yes" ? "loading btn-primary" : "btn-primary"}`}
            title="Approve this challenge"
          >
            {busy === "yes" ? "Approving…" : "Approve"}
          </button>
          <button
            disabled={disabled}
            onClick={() => cast(false)}
            className={`btn ${busy === "no" ? "loading btn-ghost" : "btn-ghost"}`}
            title="Reject this challenge"
          >
            {busy === "no" ? "Rejecting…" : "Reject"}
          </button>
        </div>

        {/* context hints */}
        {!canVote && (
          <div className="text-xs text-[color:var(--text-muted)]">
            Your wallet isn’t eligible to vote on this challenge.
          </div>
        )}
        {!minStakeMet && (
          <div className="text-xs tone-warn rounded px-2 py-1 border">
            Minimum validator stake not met.
          </div>
        )}
        {alreadyVoted && (
          <div className="text-xs text-[color:var(--text-muted)]">
            You already voted on this challenge.
          </div>
        )}
        {passed && (
          <div className="text-xs text-[color:var(--text-muted)]">
            Voting deadline has passed.
          </div>
        )}
        {countdown && !passed && (
          <div className="text-xs text-[color:var(--text-muted)]">
            {countdown}
          </div>
        )}
      </div>
    </section>
  );
}