"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Trophy, Award } from "lucide-react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ABI, ADDR, ZERO_ADDR } from "@/lib/contracts";

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { if (i === attempts - 1) throw e; await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  }
  throw new Error("unreachable");
}

type Props = {
  challengeId: number;
  address: string | undefined;
  isFinalized: boolean;
  isParticipant: boolean;
  isWinner: boolean;
};

type MintState = {
  completion: "idle" | "pending" | "done";
  victory: "idle" | "pending" | "done";
};

export default function AchievementClaim({
  challengeId,
  address,
  isFinalized,
  isParticipant,
  isWinner,
}: Props) {
  const [mintState, setMintState] = useState<MintState>({
    completion: "idle",
    victory: "idle",
  });
  const [checkedChain, setCheckedChain] = useState(false);

  const achAddr = ADDR.ChallengeAchievement;
  const abi = ABI.ChallengeAchievement;
  const configured = achAddr && achAddr !== ZERO_ADDR && abi;

  // Check what's already minted on-chain
  useEffect(() => {
    if (!configured || !address || !isFinalized) return;

    (async () => {
      try {
        const { createPublicClient, http } = await import("viem");
        const client = createPublicClient({
          chain: {
            id: 504,
            name: "lightchain",
            nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
            rpcUrls: { default: { http: ["/api/rpc"] } },
          },
          transport: http("/api/rpc"),
        });

        const [compMinted, vicMinted] = await Promise.all([
          client.readContract({
            address: achAddr as `0x${string}`,
            abi,
            functionName: "hasMinted",
            args: [BigInt(challengeId), address as `0x${string}`, 0],
          }) as Promise<boolean>,
          client.readContract({
            address: achAddr as `0x${string}`,
            abi,
            functionName: "hasMinted",
            args: [BigInt(challengeId), address as `0x${string}`, 1],
          }) as Promise<boolean>,
        ]);

        setMintState((s) => ({
          completion: compMinted ? "done" : s.completion,
          victory: vicMinted ? "done" : s.victory,
        }));
      } catch {
        // Contract may not be deployed yet; ignore
      } finally {
        setCheckedChain(true);
      }
    })();
  }, [configured, address, challengeId, isFinalized, achAddr, abi]);

  const { writeContract, data: txHash, isPending } = useWriteContract();

  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [activeType, setActiveType] = useState<"completion" | "victory" | null>(
    null
  );

  // After tx confirmation, update state and persist to DB
  useEffect(() => {
    if (!txConfirmed || !activeType || !address) return;
    setMintState((s) => ({ ...s, [activeType]: "done" }));

    // Best-effort DB persist with retry (indexer is the backup)
    withRetry(() =>
      fetch("/api/me/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: 0, // Will be corrected by indexer
          challengeId,
          recipient: address,
          achievementType: activeType,
          txHash,
        }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
    ).catch(() => {});

    setActiveType(null);
  }, [txConfirmed, activeType, address, challengeId, txHash]);

  const claim = useCallback(
    (type: "completion" | "victory") => {
      if (!configured || !address) return;
      setActiveType(type);

      writeContract({
        address: achAddr as `0x${string}`,
        abi,
        functionName:
          type === "completion" ? "claimCompletion" : "claimVictory",
        args: [BigInt(challengeId)],
      });
    },
    [configured, address, achAddr, abi, challengeId, writeContract]
  );

  // Don't show if not configured, not finalized, or not a participant
  if (!configured || !isFinalized || !isParticipant || !address) return null;
  if (!checkedChain) return null;

  // If everything is already claimed, show summary
  const allDone =
    mintState.completion === "done" &&
    (isWinner ? mintState.victory === "done" : true);

  if (allDone) {
    return (
      <div className="rounded-xl border border-(--border-subtle) bg-(--surface-card) p-4 mt-4">
        <div className="flex items-center gap-2 text-sm text-(--text-muted)">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Achievements claimed</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-(--border-subtle) bg-(--surface-card) p-4 mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-400" />
        <span className="font-medium text-sm">Achievements</span>
      </div>

      {/* Completion */}
      {mintState.completion !== "done" && (
        <button
          className="btn btn-secondary w-full flex items-center justify-center gap-2"
          disabled={isPending || mintState.completion === "pending"}
          onClick={() => claim("completion")}
        >
          <Award className="w-4 h-4" />
          {isPending && activeType === "completion"
            ? "Minting…"
            : "Claim Completion"}
        </button>
      )}

      {/* Victory — only for winners */}
      {isWinner && mintState.victory !== "done" && (
        <button
          className="btn btn-primary w-full flex items-center justify-center gap-2"
          disabled={isPending || mintState.victory === "pending"}
          onClick={() => claim("victory")}
        >
          <Trophy className="w-4 h-4" />
          {isPending && activeType === "victory"
            ? "Minting…"
            : "Claim Victory"}
        </button>
      )}

      <p className="text-xs text-(--text-muted)">
        Soulbound tokens — non-transferable proof of your accomplishment.
      </p>
    </div>
  );
}
