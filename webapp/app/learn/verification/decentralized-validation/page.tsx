"use client";

import { Server, ShieldCheck, Users, Network, CheckCircle2 } from "lucide-react";
import { ValidatorIcon } from "@/app/components/icons/ProductIcons";
import LearnPage from "../../components/LearnPage";

export default function DecentralizedValidationPage() {
  return (
    <LearnPage
      icon={<ValidatorIcon size={32} />}
      title="Decentralized Validation"
      subtitle="Lightchain AIVM validators reach independent consensus on verification results. No single point of failure."
      description={[
        "LightChallenge doesn't run its own verification servers. Instead, verification results are validated by the Lightchain AIVM (Artificial Intelligence Virtual Machine) — a decentralized network of independent validator nodes.",
        "When an AI model produces a verification result, it's submitted to the AIVM network as an inference request. Multiple validators independently process and attest to the result through Lightchain's Proof-of-Intelligence (PoI) consensus mechanism.",
        "Only when a quorum of validators agrees on the result is it finalized on-chain. This means no single entity — not even LightChallenge — can unilaterally determine challenge outcomes. The network is the arbiter.",
      ]}
      features={[
        {
          icon: <Server size={20} />,
          title: "Independent Validators",
          desc: "AIVM validators are independent nodes operated by different parties. They stake LCAI tokens and are incentivized to validate honestly.",
        },
        {
          icon: <ShieldCheck size={20} />,
          title: "Proof-of-Intelligence Consensus",
          desc: "Validators attest to inference results using EIP-712 signed messages. Consensus is reached when enough validators agree.",
        },
        {
          icon: <Network size={20} />,
          title: "No Single Point of Failure",
          desc: "If one validator goes offline or acts maliciously, the network continues. Results require quorum agreement, not unanimity.",
        },
        {
          icon: <Users size={20} />,
          title: "Permissionless Participation",
          desc: "Anyone can run a validator node by staking LCAI tokens. More validators means more decentralization and security.",
        },
      ]}
      steps={[
        { step: "01", title: "Inference request submitted", desc: "After AI evaluation, the verification result is submitted to the AIVM network as an inference request with a unique task ID." },
        { step: "02", title: "Validators commit", desc: "Validators independently process the request. Each commits a hash of their result (commit phase) to prevent copying." },
        { step: "03", title: "Validators reveal", desc: "After all commitments are in, validators reveal their actual results. Results are compared for consensus." },
        { step: "04", title: "PoI attestation and finalization", desc: "Validators sign EIP-712 attestations. When quorum is reached, the inference is finalized on-chain and the proof is recorded." },
      ]}
      extraTitle="The AIVM Pipeline"
      extraContent={
        <div className="learn-page__text">
          <p style={{ marginBottom: "var(--lc-space-3)" }}>
            The full verification pipeline from evidence to on-chain proof:
          </p>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "var(--lc-space-2)",
            alignItems: "center", fontSize: "var(--lc-text-small)",
          }}>
            {[
              "Evidence Upload",
              "AI Evaluation",
              "AIVM Request",
              "Validator Commit",
              "Validator Reveal",
              "PoI Attestation",
              "On-chain Finalization",
            ].map((step, i, arr) => (
              <span key={step} style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
                <span style={{
                  padding: "var(--lc-space-1) var(--lc-space-3)",
                  borderRadius: "var(--lc-radius-pill)",
                  backgroundColor: "var(--lc-accent-muted)",
                  fontSize: "var(--lc-text-caption)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}>
                  {step}
                </span>
                {i < arr.length - 1 && (
                  <CheckCircle2 size={14} style={{ color: "var(--lc-text-muted)", flexShrink: 0 }} />
                )}
              </span>
            ))}
          </div>
        </div>
      }
      ctaLabel="Explore Challenges"
      ctaHref="/explore"
    />
  );
}
