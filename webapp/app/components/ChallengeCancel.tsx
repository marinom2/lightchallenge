"use client";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import type { Abi } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { Toasts } from "@/lib/ui/toast";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export default function ChallengeCancel({ id }: { id: bigint | string }) {
  const challengeId = typeof id === "string" ? BigInt(id) : id;
  const { address } = useAccount();
  const pc = usePublicClient();
  const { data: adminAddr } = useReadContract({
    address: (ADDR.ChallengePay ?? ZERO) as `0x${string}`,
    abi: ABI.ChallengePay,
    functionName: "admin",
  });

  const isAdmin = useMemo(
    () =>
      !!address &&
      !!adminAddr &&
      (adminAddr as string).toLowerCase() === address.toLowerCase(),
    [address, adminAddr]
  );

  const { writeContractAsync } = useWriteContract();
  const [pauseState, setPauseState] = useState(true);
  const [busy, setBusy] = useState<null | "pause" | "cancel">(null);

  useEffect(() => setPauseState(true), [id]);

  if (!isAdmin) {
    return (
      <div className="panel">
        <div className="panel-header"><div className="font-semibold">Cancel (Admin)</div></div>
        <div className="panel-body text-sm text-[color:var(--text-muted)]">
          Connect with an admin wallet to manage this challenge.
        </div>
      </div>
    );
  }

  async function run(kind: "pause" | "cancel") {
    try {
      if (!pc) throw new Error("No public client");
      setBusy(kind);

      const fn = kind === "pause" ? "pauseChallenge" : "cancelChallenge";
      const args = kind === "pause" ? [challengeId, pauseState] : [challengeId];

      pushInfo(`Submitting ${fn}…`);
      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as Abi,
        address: ADDR.ChallengePay!,
        functionName: fn as any,
        // @ts-ignore
        args,
      });

      const r = await pc.waitForTransactionReceipt({ hash });
      r.status === "success"
        ? pushOk(`${kind === "pause" ? (pauseState ? "Paused" : "Unpaused") : "Canceled"} OK`)
        : pushErr(`${kind} failed`);
    } catch (e: any) {
      pushErr(e?.shortMessage || e?.message || "Tx failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header"><div className="font-semibold">Cancel / Pause (Admin)</div></div>
      <div className="panel-body space-y-3">
        <div className="flex items-center gap-2">
          <label className="label">Pause?</label>
          <button
            type="button"
            onClick={() => setPauseState((v) => !v)}
            className={`switch ${pauseState ? "is-on" : ""}`}
            aria-pressed={pauseState}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => run("pause")}
            disabled={busy !== null}
            className="btn btn-ghost"
          >
            {busy === "pause" ? "Sending…" : pauseState ? "Pause" : "Unpause"}
          </button>
          <button
            onClick={() => run("cancel")}
            disabled={busy !== null}
            className="btn btn-ghost"
          >
            {busy === "cancel" ? "Sending…" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function pushOk(m: string) { safeToast("success", m); }
function pushErr(m: string) { safeToast("error", m); }
function pushInfo(m: string) { safeToast("info", m); }
function safeToast(type: "success" | "error" | "info", message: string) {
  try {
    // @ts-ignore
    if (Toasts?.[type]) return Toasts[type](message);
    // @ts-ignore
    if (Toasts?.push) return Toasts.push({ type, message });
    // @ts-ignore
    if (Toasts?.add) return Toasts.add({ type, message });
  } catch {}
  console.log(`[${type}]`, message);
}