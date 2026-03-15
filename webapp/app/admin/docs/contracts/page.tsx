import Link from "next/link";
import { ADDR, EXPLORER_URL } from "@/lib/contracts";

const contracts = [
  { name: "ChallengePay", addr: ADDR.ChallengePay, desc: "Core challenge lifecycle — create, proof, finalize, claim" },
  { name: "Treasury", addr: ADDR.Treasury, desc: "DAO treasury — bucketed custody, pull-based claims" },
  { name: "EventChallengeRouter", addr: "0x4c523C1eBdcD8FAAA27808f01F3Ec00B98Fb0f2D", desc: "Multi-outcome event routing" },
  { name: "MetadataRegistry", addr: ADDR.MetadataRegistry, desc: "Off-chain metadata URIs for challenges" },
  { name: "ChallengeTaskRegistry", addr: ADDR.ChallengeTaskRegistry, desc: "Binds challenges to AIVM task IDs" },
  { name: "ChallengePayAivmPoiVerifier", addr: ADDR.ChallengePayAivmPoiVerifier, desc: "AIVM Proof-of-Inference adapter" },
  { name: "ChallengeAchievement", addr: ADDR.ChallengeAchievement, desc: "Soulbound achievement NFTs" },
  { name: "AIVMInferenceV2", addr: ADDR.AIVMInferenceV2, desc: "Lightchain AIVM (not ours — network contract)" },
];

export default function ContractsPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <nav style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-4)" }}>
        <Link href="/admin/docs" style={{ color: "var(--lc-text-muted)", textDecoration: "none" }}>Docs</Link>
        <span style={{ margin: "0 var(--lc-space-1)" }}>/</span>
        <span style={{ color: "var(--lc-text-secondary)" }}>Contracts</span>
      </nav>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "var(--lc-space-2)" }}>Contract Reference</h1>
      <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-6)" }}>
        All contracts are deployed on LightChain Testnet (Chain ID: 504).
        Explorer: <a href={EXPLORER_URL} target="_blank" rel="noreferrer" className="link">{EXPLORER_URL}</a>
      </p>

      <div className="space-y-3">
        {contracts.map((c) => (
          <div key={c.name} className="panel">
            <div className="panel-body" style={{ padding: "var(--lc-space-3) var(--lc-space-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "var(--lc-text-small)" }}>{c.name}</div>
                  <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>{c.desc}</div>
                </div>
                <a
                  href={`${EXPLORER_URL}/address/${c.addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono link"
                  style={{ fontSize: "var(--lc-text-caption)", wordBreak: "break-all" }}
                >
                  {c.addr}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: "var(--lc-space-6)" }}>
        <div className="panel-header"><div className="font-semibold">ABI Files</div></div>
        <div className="panel-body" style={{ fontSize: "var(--lc-text-small)" }}>
          <p>Contract ABIs are in <code>webapp/public/abi/</code>:</p>
          <ul style={{ paddingLeft: "var(--lc-space-4)", listStyle: "disc", marginTop: "var(--lc-space-2)" }}>
            <li><code>ChallengePay.abi.json</code> — Core challenge contract</li>
            <li><code>Treasury.abi.json</code> — Treasury operations</li>
            <li><code>MetadataRegistry.abi.json</code> — Metadata storage</li>
            <li><code>ChallengeAchievement.abi.json</code> — Achievement NFTs</li>
            <li><code>ERC20.abi.json</code> — Standard ERC-20 interface</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
