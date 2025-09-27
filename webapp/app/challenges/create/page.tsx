// webapp/components/ProofPanel.tsx
"use client";

import { useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { type Hex } from "viem";
import { ABI, ADDR } from "@/lib/contracts";
import { packZkProof } from "@/lib/zkPack";

type KindKey = "steps" | "running" | "dota";

/**
 * Handles ZK (PLONK) and AIVM attestation flows.
 * - ZK: user pastes modelHash / proofData / publicSignals; we ABI-pack and submit.
 * - AIVM: user pastes evidence JSON; we POST to /api/proof/aivm/sign which
 *         signs + packs for AivmProofVerifier, then we call submitProof.
 */
export default function ProofPanel({
  id,
  verifier,
  requireZk = false,
  requireAivm = false,
  // For AIVM: pass the same kind/form you used when creating the challenge
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

  // Normalized (lowercase) address helpers
  const vLower = verifier?.toLowerCase?.() ?? "";
  const zkLower = (ADDR.ZkProofVerifier as string | undefined)?.toLowerCase?.() ?? "";
  const aivmLower = (ADDR.AivmProofVerifier as string | undefined)?.toLowerCase?.() ?? "";
  const multisigLower = ((ADDR as any).MultiSigProofVerifier as string | undefined)?.toLowerCase?.() ?? "";

  const isZkVerifier = useMemo(() => !!zkLower && vLower === zkLower, [vLower, zkLower]);
  const isAivmVerifier = useMemo(() => !!aivmLower && vLower === aivmLower, [vLower, aivmLower]);
  const isMultiSigVerifier = useMemo(() => !!multisigLower && vLower === multisigLower, [vLower, multisigLower]);

  // Niceties: disable sections if verifier mismatch
  const zkSectionDisabled = requireZk && !isZkVerifier;
  const aivmSectionDisabled = requireAivm && !isAivmVerifier;

  // AIVM nicety: hint when config is missing (only when required)
  const aivmConfigMissing = requireAivm && (!kindKey || !form);

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
      if (zkSectionDisabled) throw new Error("This challenge is not using the ZK verifier.");
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
      if (aivmSectionDisabled) throw new Error("This challenge is not using the AIVM verifier.");
      if (!address) throw new Error("Connect wallet");
      if (aivmConfigMissing) throw new Error("Missing challenge kind/form for AIVM");

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

      {/* Optional FYI for Multi-Sig verifiers */}
      {isMultiSigVerifier && (
        <div className="text-xs text-white/70">
          This challenge uses a Multi-Sig verifier. No user submission is required here.
        </div>
      )}

      {/* ZK (PLONK) section */}
      {requireZk && (
        <fieldset
          className={`space-y-2 ${zkSectionDisabled ? "opacity-50 pointer-events-none" : ""}`}
          disabled={zkSectionDisabled}
        >
          <div className="text-xs text-white/70">
            ZK (PLONK)
            {zkSectionDisabled && (
              <span className="ml-2 text-amber-300">
                • Disabled: challenge is not using the configured ZK verifier.
              </span>
            )}
          </div>
          <input
            className="w-full bg-white/5 rounded-xl px-3 py-2"
            placeholder="modelHash 0x…32"
            value={modelHash}
            onChange={(e) => setModelHash(e.target.value as Hex)}
          />
          <input
            className="w-full bg-white/5 rounded-xl px-3 py-2"
            placeholder="proofData 0x…"
            value={proofData}
            onChange={(e) => setProofData(e.target.value as Hex)}
          />
          <input
            className="w-full bg-white/5 rounded-xl px-3 py-2"
            placeholder="publicSignals e.g. 123,456,0xabc…"
            value={publicSignals}
            onChange={(e) => setPublicSignals(e.target.value)}
          />
          <button
            disabled={busy === "zk" || zkSectionDisabled}
            onClick={submitZk}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            {busy === "zk" ? "Submitting…" : "Submit ZK Proof"}
          </button>
        </fieldset>
      )}

      {/* AIVM section */}
      {requireAivm && (
        <fieldset
          className={`space-y-2 ${aivmSectionDisabled ? "opacity-50 pointer-events-none" : ""}`}
          disabled={aivmSectionDisabled}
        >
          <div className="text-xs text-white/70">
            AIVM attestation (paste your health/game JSON below)
            {aivmSectionDisabled && (
              <span className="ml-2 text-amber-300">
                • Disabled: challenge is not using the configured AIVM verifier.
              </span>
            )}
          </div>
          {aivmConfigMissing && (
            <div className="text-xs text-amber-300">
              Missing <code>kindKey</code> / <code>form</code> for AIVM flow. This usually comes from how the
              challenge was created. Without it, we can’t request the AIVM signature.
            </div>
          )}
          <textarea
            className="w-full bg-white/5 rounded-xl px-3 py-2 min-h-[120px]"
            placeholder='{"stepsByDay":[{"date":"2025-09-26","steps":7421}]}'
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
          />
          <button
            disabled={busy === "aivm" || aivmSectionDisabled || aivmConfigMissing}
            onClick={submitAivm}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            {busy === "aivm" ? "Submitting…" : "Get AIVM signature & Submit"}
          </button>
        </fieldset>
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