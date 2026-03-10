// app/components/ChallengeClaims.tsx
"use client";

import { useMemo, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { useToasts } from "@/lib/ui/toast";

type Status = "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";

export type SnapshotOut = {
  set: boolean;
  success: boolean;
  rightSide: number;
  eligibleValidators: number;
  committedPool: string;
  forfeitedPool: string;
  cashback: string;
  forfeitedAfterCashback?: string;
  charityAmt: string;
  protocolAmt: string;
  creatorAmt: string;
  validatorsAmt: string;
  perCommittedBonusX: string;
  perCashbackX: string;
  perValidatorAmt: string;
};

type Props = {
  id: bigint | string;
  status: Status;
  snapshot?: SnapshotOut; // optional but helps us hide irrelevant buttons
  // optionally allow hiding certain buttons (e.g., on a public page)
  show?: { winner?: boolean; loser?: boolean; validator?: boolean };
  onChanged?: () => void; // call to refresh parent (optional)
};

export default function ChallengeClaims({ id, status, snapshot, show, onChanged }: Props) {
  const challengeId = typeof id === "string" ? BigInt(id) : id;
  const pc = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { push } = useToasts();

  // Only claimable once the challenge is finalized
  const isFinalized = status === "Finalized";

  // Basic heuristics to de-clutter UI
  const showWinner = (show?.winner ?? true) && isFinalized;
  const showLoser  = (show?.loser ?? true)  && isFinalized && (BigInt(snapshot?.cashback ?? "0") > 0n);
  const showValidator = (show?.validator ?? true) && isFinalized;

  const somethingToShow = useMemo(() => showWinner || showLoser || showValidator, [showWinner, showLoser, showValidator]);

  const [busy, setBusy] = useState<null | "winner" | "loser" | "validator">(null);

  async function run(kind: "winner" | "loser" | "validator") {
    try {
      if (!pc) throw new Error("No public client available");
      setBusy(kind);

      const fn =
        kind === "winner"
          ? "claimWinner"
          : kind === "loser"
          ? "claimLoserCashback"
          : "claimValidator";

      push(`${pretty(kind)}: submitting…`);
      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as Abi,
        address: ADDR.ChallengePay!,
        functionName: fn as any,
        args: [challengeId],
      });

      push(`${pretty(kind)}: pending confirmation…`);
      const r = await pc.waitForTransactionReceipt({ hash });
      if (r.status === "success") {
        push(`${pretty(kind)}: confirmed ✅`);
        onChanged?.();
      } else {
        push(`${pretty(kind)}: failed ❌`);
      }
    } catch (e: any) {
      push(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="font-semibold">Claim Rewards</div></div>
      <div className="panel-body">
        {!somethingToShow ? (
          <div className="text-sm text-[color:var(--text-muted)]">
            {isFinalized
              ? "No claimable rewards are available."
              : "Claims become available once the challenge is finalized."}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {showWinner && (
                <button
                  onClick={() => run("winner")}
                  disabled={busy !== null}
                  className={`btn ${busy === "winner" ? "loading btn-primary" : "btn-primary"}`}
                >
                  {busy === "winner" ? "Claiming…" : "Claim Winner"}
                </button>
              )}
              {showLoser && (
                <button
                  onClick={() => run("loser")}
                  disabled={busy !== null}
                  className={`btn ${busy === "loser" ? "loading btn-ghost" : "btn-ghost"}`}
                >
                  {busy === "loser" ? "Claiming…" : "Claim Loser Cashback"}
                </button>
              )}
              {showValidator && (
                <button
                  onClick={() => run("validator")}
                  disabled={busy !== null}
                  className={`btn ${busy === "validator" ? "loading btn-ghost" : "btn-ghost"}`}
                >
                  {busy === "validator" ? "Claiming…" : "Claim Validator"}
                </button>
              )}
            </div>
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              Available claim types depend on the final outcome and your participation.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function pretty(kind: "winner" | "loser" | "validator") {
  return kind === "winner" ? "Winner claim" : kind === "loser" ? "Loser cashback" : "Validator claim";
}