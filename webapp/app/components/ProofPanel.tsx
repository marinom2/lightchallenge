// webapp/components/ProofPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { type Hex } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { packZkProof } from "@/lib/zkPack";

type KindKey = "steps" | "running" | "dota";

export default function ProofPanel({
  id,
  verifier,
  requireZk = false,
  requireAivm = false,
  // For AIVM flows: pass the same kind/form you used at creation
  kindKey,
  form,
}: {
  id: bigint;
  verifier: `0x${string}`;
  requireZk?: boolean;
  requireAivm?: boolean;
  kindKey?: KindKey;
  form?: Record<string, any>;
}) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // If nothing is required, don't render the panel at all
  if (!requireZk && !requireAivm) return null;

  // --- “expected verifier” niceties -----------------------------------------
  const expectedAivm = (ADDR as any)?.AivmProofVerifier as `0x${string}` | undefined;
  const expectedZk   = (ADDR as any)?.ZkProofVerifier   as `0x${string}` | undefined;

  const isAivmMatch = useMemo(() => {
    if (!requireAivm || !expectedAivm) return true; // if we don't know, don't block UI
    return verifier.toLowerCase() === expectedAivm.toLowerCase();
  }, [requireAivm, verifier, expectedAivm]);

  const isZkMatch = useMemo(() => {
    if (!requireZk || !expectedZk) return true;
    return verifier.toLowerCase() === expectedZk.toLowerCase();
  }, [requireZk, verifier, expectedZk]);

  // ZK state
  const [modelHash, setModelHash] = useState<Hex>("0x");
  const [proofData, setProofData] = useState<Hex>("0x");
  const [publicSignals, setPublicSignals] = useState<string>("");

  // AIVM state
  const [evidenceText, setEvidenceText] = useState<string>("");

  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function submitZk() {
    try {
      setBusy("zk");
      if (!/^0x[0-9a-fA-F]{64}$/.test(modelHash)) throw new Error("modelHash must be 32 bytes hex (0x…64)");
      if (!/^0x[0-9a-fA-F]*$/.test(proofData)) throw new Error("proofData must be hex (0x…)");

      const pub = parseUint256Array(publicSignals);
      const packed = packZkProof(modelHash, proofData, pub);

      await writeContractAsync({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay,
        functionName: "submitProof",
        args: [id, packed],
      });

      setToast("ZK proof submitted");
    } catch (e: any) {
      setToast(e?.shortMessage || e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function submitAivm() {
    try {
      setBusy("aivm");
      if (!address) throw new Error("Connect wallet");
      if (!kindKey || !form) throw new Error("Missing challenge kind/form for AIVM");

      let evidence: any = {};
      if (evidenceText.trim()) {
        try { evidence = JSON.parse(evidenceText); }
        catch { throw new Error("Evidence must be valid JSON"); }
      }

      const res = await fetch("/api/proof/aivm/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: Number(id),
          subject: address,
          kindKey,
          form,
          evidence,
        }),
      });
      const out = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(out?.error || `Sign failed (${res.status})`);

      const { packed } = out as { packed: Hex };

      await writeContractAsync({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay,
        functionName: "submitProof",
        args: [id, packed],
      });

      setToast("AIVM proof submitted");
    } catch (e: any) {
      setToast(e?.shortMessage || e?.message || "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl p-4 border border-white/10 space-y-4 bg-white/5">
      <div className="text-sm font-semibold">Proofs</div>

      {requireZk && (
        <div className="space-y-2 opacity-100">
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span>ZK (PLONK)</span>
            {!isZkMatch && (
              <span className="rounded-md border border-white/15 px-2 py-[2px] text-[10px] text-amber-300">
                disabled (verifier mismatch)
              </span>
            )}
          </div>

          <input
            className="w-full bg-white/5 rounded-xl px-3 py-2"
            placeholder="modelHash 0x…32"
            value={modelHash}
            onChange={(e) => setModelHash(e.target.value as Hex)}
            disabled={!isZkMatch}
          />
          <input
            className="w-full bg-white/5 rounded-xl px-3 py-2"
            placeholder="proofData 0x…"
            value={proofData}
            onChange={(e) => setProofData(e.target.value as Hex)}
            disabled={!isZkMatch}
          />
          <input
            className="w-full bg-white/5 rounded-xl px-3 py-2"
            placeholder="publicSignals e.g. 123,456,0xabc…"
            value={publicSignals}
            onChange={(e) => setPublicSignals(e.target.value)}
            disabled={!isZkMatch}
          />
          <button
            disabled={busy === "zk" || !isZkMatch}
            onClick={submitZk}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            {busy === "zk" ? "Submitting…" : "Submit ZK Proof"}
          </button>
        </div>
      )}

      {requireAivm && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span>AIVM attestation (paste your health/game JSON below)</span>
            {!isAivmMatch && (
              <span className="rounded-md border border-white/15 px-2 py-[2px] text-[10px] text-amber-300">
                disabled (verifier mismatch)
              </span>
            )}
          </div>

          {/* hint if they forgot to pass kindKey/form */}
          {(!kindKey || !form) && isAivmMatch && (
            <div className="text-[11px] text-amber-300">
              Missing <code>kindKey</code>/<code>form</code> for AIVM — this challenge can’t be attested yet.
            </div>
          )}

          <textarea
            className="w-full bg-white/5 rounded-xl px-3 py-2 min-h-[120px]"
            placeholder='{"stepsByDay":[{"date":"2025-09-26","steps":7421}]}'
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            disabled={!isAivmMatch || !kindKey || !form}
          />
          <button
            disabled={busy === "aivm" || !isAivmMatch || !kindKey || !form}
            onClick={submitAivm}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            {busy === "aivm" ? "Submitting…" : "Get AIVM signature & Submit"}
          </button>
        </div>
      )}

      <div className="text-xs text-white/60 break-words">
        Verifier: <code>{verifier}</code>
      </div>

      {toast && <div className="text-xs text-white/80">{toast}</div>}
    </div>
  );
}

// utils
function parseUint256Array(input: string): bigint[] {
  const parts = input.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("0x") || p.startsWith("0X")) return BigInt(p);
    if (!/^\d+$/.test(p)) throw new Error(`Bad public signal: ${p}`);
    return BigInt(p);
  });
}