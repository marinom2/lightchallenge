// webapp/app/components/JoinBetPanel.tsx
"use client";

import { useState, useMemo } from "react";
import { parseEther, type Address } from "viem";
import { useWriteContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";

type FnName = "joinChallenge" | "betOn";

export default function JoinBetPanel({
  id,
  canJoin,
  canBet,
  joinWindowOpen,
  maxReached,
}: {
  id: bigint;
  canJoin: boolean;
  canBet: boolean;
  joinWindowOpen: boolean;
  maxReached: boolean;
}) {
  const { writeContractAsync } = useWriteContract();
  const [joinAmt, setJoinAmt] = useState("");
  const [betAmt, setBetAmt] = useState("");
  const [betSide, setBetSide] = useState<1 | 2>(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const disabledReason = useMemo(() => {
    if (!joinWindowOpen) return "Join window closed";
    if (maxReached) return "Cap reached";
    return null;
  }, [joinWindowOpen, maxReached]);

  // Resolve & guard address ONCE so TypeScript narrows from Address | undefined → Address
  const challengePayAddress: Address | undefined = ADDR.ChallengePay;

  // Overloads (precise tuple types)
  async function tx(label: string, fn: "joinChallenge", args: [bigint], value: bigint): Promise<void>;
  async function tx(label: string, fn: "betOn", args: [bigint, 1 | 2], value: bigint): Promise<void>;
  async function tx(label: string, fn: FnName, args: [bigint] | [bigint, 1 | 2], value: bigint) {
    try {
      if (!challengePayAddress) {
        throw new Error("ChallengePay address missing from deployments");
      }
      setBusy(label);
      await writeContractAsync({
        address: challengePayAddress,     // ✅ now a narrowed `Address` (aka `0x${string}`)
        abi: ABI.ChallengePay,            // ✅ already a real Abi from contracts.ts
        functionName: fn,
        args,                             // ✅ properly typed tuples
        value,                            // payable value
      });
      setToast(`${label} submitted`);
    } catch (e: any) {
      setToast(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl p-4 border border-white/10 space-y-4">
      <div className="text-sm font-semibold">Join / Bet</div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Join */}
        <div className="space-y-2">
          <label className="text-xs text-muted">Join (success side)</label>
          <input
            className="w-full bg-[color:var(--soft-bg-6)] rounded-xl px-3 py-2"
            placeholder="0.0"
            value={joinAmt}
            onChange={(e) => setJoinAmt(e.target.value)}
          />
          <button
            disabled={!canJoin || !!disabledReason || busy === "join"}
            onClick={() => {
              const v = safeParse(joinAmt);
              if (v == null) {
                setToast("Enter a valid amount");
                return;
              }
              tx("join", "joinChallenge", [id], v);
            }}
            className="btn btn-ghost px-3 py-2 rounded-xl  hover:bg-[color:var(--soft-bg-12)] "
          >
            {busy === "join" ? "Joining..." : "Join"}
          </button>
          {disabledReason && <div className="text-xs text-yellow-400">{disabledReason}</div>}
        </div>

        {/* Bet */}
        <div className="space-y-2">
          <label className="text-xs text-muted">Bet (choose side)</label>
          <div className="flex gap-2">
            <button
              onClick={() => setBetSide(1)}
              className={`px-3 py-2 rounded-xl ${betSide === 1 ? "bg-[color:var(--soft-bg-12)]" : "bg-[color:var(--soft-bg-6)]"}`}
            >
              Success
            </button>
            <button
              onClick={() => setBetSide(2)}
              className={`px-3 py-2 rounded-xl ${betSide === 2 ? "bg-[color:var(--soft-bg-12)]" : "bg-[color:var(--soft-bg-6)]"}`}
            >
              Fail
            </button>
          </div>
          <input
            className="w-full bg-[color:var(--soft-bg-6)] rounded-xl px-3 py-2"
            placeholder="0.0"
            value={betAmt}
            onChange={(e) => setBetAmt(e.target.value)}
          />
          <button
            disabled={!canBet || !!disabledReason || busy === "bet"}
            onClick={() => {
              const v = safeParse(betAmt);
              if (v == null) {
                setToast("Enter a valid amount");
                return;
              }
              tx("bet", "betOn", [id, betSide], v);
            }}
            className="btn btn-ghost px-3 py-2 rounded-xl  hover:bg-[color:var(--soft-bg-12)] "
          >
            {busy === "bet" ? "Betting..." : "Bet"}
          </button>
        </div>
      </div>

      {toast && <div className="text-xs text-muted">{toast}</div>}
    </div>
  );
}

function safeParse(s: string) {
  try {
    return parseEther(s as `${number}`);
  } catch {
    return null;
  }
}