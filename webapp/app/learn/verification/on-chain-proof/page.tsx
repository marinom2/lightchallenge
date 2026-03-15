"use client";

import { Lock, Eye, FileCheck, Database } from "lucide-react";
import { ProofIcon } from "@/app/components/icons/ProductIcons";
import LearnPage from "../../components/LearnPage";

export default function OnChainProofPage() {
  return (
    <LearnPage
      icon={<ProofIcon size={32} />}
      title="On-chain Proof"
      subtitle="Every verification result is recorded immutably on Lightchain. Transparent, tamper-proof, and auditable by anyone."
      description={[
        "When AI verification completes, the result isn't stored in a database controlled by LightChallenge. Instead, it's recorded on the Lightchain blockchain as an immutable, verifiable record that anyone can audit.",
        "The on-chain proof contains the challenge ID, the participant address, the verification result, and a hash of the evidence. This creates a complete, tamper-proof audit trail from evidence submission to final outcome.",
        "Because the proof is on-chain, there's no way for anyone — not even the platform operators — to alter the result after the fact. The smart contract enforces the rules: if the AI says you passed, you get your reward. No middleman, no appeals process, no hidden overrides.",
      ]}
      features={[
        {
          icon: <Lock size={20} />,
          title: "Immutable Records",
          desc: "Once recorded on Lightchain, proof records cannot be altered or deleted. The result is permanent and verifiable forever.",
        },
        {
          icon: <Eye size={20} />,
          title: "Full Transparency",
          desc: "Anyone can view the proof on-chain. Challenge creators, participants, and spectators can independently verify every result.",
        },
        {
          icon: <FileCheck size={20} />,
          title: "Evidence Hashing",
          desc: "A cryptographic hash of your evidence is stored on-chain. This proves the exact data that was evaluated, without exposing the raw data.",
        },
        {
          icon: <Database size={20} />,
          title: "Smart Contract Enforcement",
          desc: "The ChallengePay contract automatically processes rewards based on proof results. No human in the loop between verification and payout.",
        },
      ]}
      steps={[
        { step: "01", title: "AI verdict produced", desc: "After AI evaluation, a structured verdict (pass/fail + evidence hash) is ready for on-chain submission." },
        { step: "02", title: "AIVM inference recorded", desc: "The verdict is submitted as an AIVM inference request. Lightchain validators attest to the result through Proof-of-Intelligence consensus." },
        { step: "03", title: "Proof stored on-chain", desc: "The finalized result is written to the ChallengePay smart contract, linking the verdict to the challenge and participant." },
        { step: "04", title: "Rewards unlocked", desc: "If the proof shows a pass, the smart contract allows the participant to claim their reward. If fail, the challenge can be finalized accordingly." },
      ]}
      extraTitle="Why On-chain Matters"
      extraContent={
        <div className="learn-page__text">
          <ul style={{ paddingLeft: "var(--lc-space-4)", display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
            <li><strong>No trust required</strong> — you don't need to trust LightChallenge or any third party. The blockchain is the source of truth.</li>
            <li><strong>No disputes</strong> — the smart contract is the judge. If the AI says pass and validators confirm, you get paid. Period.</li>
            <li><strong>Permanent record</strong> — your verified achievements live on-chain forever. Build a provable track record over time.</li>
            <li><strong>Composable</strong> — on-chain proofs can be referenced by other smart contracts, reputation systems, or dApps.</li>
          </ul>
        </div>
      }
      ctaLabel="See It in Action"
      ctaHref="/explore"
    />
  );
}
