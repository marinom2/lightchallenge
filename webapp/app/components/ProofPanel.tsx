"use client";

import { useMemo } from "react";
import { isAddressEqual } from "viem";
import { motion } from "framer-motion";
import { ShieldCheck, Info } from "lucide-react";

import { ADDR } from "@/lib/contracts";

type ProofPanelProps = {
  id: bigint;
  verifier: `0x${string}`;
  requireZk?: boolean;
  requireAivm?: boolean;
};

export function ProofPanel({
  id,
  verifier,
  requireZk = false,
  requireAivm = false,
}: ProofPanelProps) {

  const poiVerifier = ADDR.ChallengePayAivmPoiVerifier;

  const isPoiAivm = useMemo(() => {
    return (
      !!poiVerifier &&
      poiVerifier !== "0x0000000000000000000000000000000000000000" &&
      isAddressEqual(verifier, poiVerifier)
    );
  }, [verifier, poiVerifier]);

  const showLegacyWarning = requireZk;
  const showVerifierMismatch = requireAivm && !isPoiAivm;

  return (
    <section className="panel">

      <header className="panel-header">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} />
          <span>Verification</span>
        </div>

        <div className="text-xs text-[color:var(--text-muted)] break-all">
          Verifier: <code>{verifier}</code>
        </div>
      </header>

      <div className="panel-body space-y-4">

        {showLegacyWarning && (
          <Notice type="warn">
            ZK proof submission is no longer supported.  
            Lightchain now uses <b>AIVM + Proof-of-Inference (PoI)</b>.
          </Notice>
        )}

        {showVerifierMismatch && (
          <Notice type="warn">
            This challenge requires verification, but the verifier does not match the
            active <b>ChallengePayAivmPoiVerifier</b>.
          </Notice>
        )}

        {requireAivm && isPoiAivm && (
          <Notice type="info">
            This challenge uses <b>AIVM + Proof-of-Inference</b>.  
            Verification is executed automatically by the Lightchain inference network.
          </Notice>
        )}

        {!requireAivm && (
          <Notice type="info">
            No verification is required for this challenge.
          </Notice>
        )}

      </div>

    </section>
  );
}

function Notice({
  children,
  type,
}: {
  children: React.ReactNode;
  type: "warn" | "info";
}) {

  const style =
    type === "warn"
      ? "tone-warn border"
      : "tone-info border";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl px-3 py-2 text-sm flex gap-2 items-start ${style}`}
    >
      <Info size={14} className="mt-[2px]" />
      <div>{children}</div>
    </motion.div>
  );
}

export default ProofPanel;