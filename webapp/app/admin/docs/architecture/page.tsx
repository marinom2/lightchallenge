import Link from "next/link";

export default function ArchitecturePage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <nav style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-4)" }}>
        <Link href="/admin/docs" style={{ color: "var(--lc-text-muted)", textDecoration: "none" }}>Docs</Link>
        <span style={{ margin: "0 var(--lc-space-1)" }}>/</span>
        <span style={{ color: "var(--lc-text-secondary)" }}>Architecture</span>
      </nav>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "var(--lc-space-6)" }}>System Architecture</h1>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">Stack Overview</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <p><strong>Blockchain:</strong> LightChain Testnet (Chain ID 504) — EVM-compatible with AIVM (AI Virtual Machine) for on-chain ML inference.</p>
          <p><strong>Smart Contracts:</strong> Solidity 0.8.24 — ChallengePay (core), Treasury, EventChallengeRouter, MetadataRegistry, ChallengeTaskRegistry, ChallengePayAivmPoiVerifier.</p>
          <p><strong>Backend:</strong> TypeScript — Off-chain workers (evidence evaluation, AIVM job submission, webhook delivery), indexers (chain event tracking), dispatchers (challenge→AIVM pipeline).</p>
          <p><strong>Frontend:</strong> Next.js 14 App Router — wagmi + RainbowKit for wallet, PostgreSQL for off-chain data.</p>
          <p><strong>Database:</strong> PostgreSQL — challenges, participants, evidence, verdicts, AIVM jobs, claims, achievements, competitions, models, templates.</p>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">Challenge Lifecycle</div></div>
        <div className="panel-body" style={{ fontSize: "var(--lc-text-small)" }}>
          <pre style={{ background: "var(--lc-glass)", padding: "var(--lc-space-4)", borderRadius: "var(--lc-radius-md)", overflow: "auto", fontSize: "0.75rem", lineHeight: 1.6 }}>{`
User creates challenge (ChallengePay.createChallenge)
  → Challenge status: Active
  → DB: challenges row created

User submits evidence (/api/aivm/intake)
  → DB: evidence row created
  → evidenceEvaluator worker picks up → verdict

challengeDispatcher detects passing verdict
  → Enqueues AIVM job (DB: aivm_jobs, status=queued)

challengeWorker picks up job
  → Calls AIVMInferenceV2.requestInferenceV2
  → DB: aivm_jobs status=submitted

Lightchain native workers process request:
  Committed → Revealed → PoI Attested → Finalized

aivmIndexer catches InferenceFinalized event
  → Calls ChallengePay.submitProofFor (on-chain)
  → Calls ChallengePay.finalize (on-chain)
  → DB: aivm_jobs status=done, challenge status=Finalized

User claims reward (/claims page)
  → ChallengePay.claimWinner / claimLoser / claimRefund
  → claimsIndexer records claim in DB
          `.trim()}</pre>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">Worker/Indexer Pipeline</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <div className="card p-3">
            <strong>evidenceEvaluator</strong> — Polls <code>evidence</code> table for rows without verdicts → runs provider-specific evaluation → writes <code>verdicts</code>.
          </div>
          <div className="card p-3">
            <strong>challengeDispatcher</strong> — Polls for challenges with passing verdicts → enqueues <code>aivm_jobs</code>.
          </div>
          <div className="card p-3">
            <strong>challengeWorker</strong> — Picks up queued AIVM jobs → submits inference requests to Lightchain.
          </div>
          <div className="card p-3">
            <strong>aivmIndexer</strong> — Watches AIVMInferenceV2 events → advances job status → triggers finalization bridge.
          </div>
          <div className="card p-3">
            <strong>statusIndexer</strong> — Watches ChallengePay Finalized/Canceled/Paused events → updates DB.
          </div>
          <div className="card p-3">
            <strong>claimsIndexer</strong> — Watches claim events (WinnerClaimed, LoserClaimed, RefundClaimed) → records in DB.
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div className="font-semibold">Key Directories</div></div>
        <div className="panel-body" style={{ fontSize: "var(--lc-text-small)" }}>
          <table className="table table--compact" style={{ width: "100%" }}>
            <tbody>
              <tr><td className="mono">contracts/</td><td>Solidity smart contracts</td></tr>
              <tr><td className="mono">offchain/db/</td><td>Database service modules (PostgreSQL)</td></tr>
              <tr><td className="mono">offchain/workers/</td><td>Background workers (polling loops)</td></tr>
              <tr><td className="mono">offchain/indexers/</td><td>Chain event indexers</td></tr>
              <tr><td className="mono">offchain/dispatchers/</td><td>Challenge → AIVM dispatchers</td></tr>
              <tr><td className="mono">offchain/evaluators/</td><td>Evidence evaluation logic per provider</td></tr>
              <tr><td className="mono">webapp/</td><td>Next.js 14 frontend + API routes</td></tr>
              <tr><td className="mono">scripts/admin/</td><td>CLI admin scripts</td></tr>
              <tr><td className="mono">deployments/</td><td>Hardhat deploy output</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
