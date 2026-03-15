import Link from "next/link";

export default function OnboardingPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <nav style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-4)" }}>
        <Link href="/admin/docs" style={{ color: "var(--lc-text-muted)", textDecoration: "none" }}>Docs</Link>
        <span style={{ margin: "0 var(--lc-space-1)" }}>/</span>
        <span style={{ color: "var(--lc-text-secondary)" }}>Getting Started</span>
      </nav>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "var(--lc-space-6)" }}>Getting Started as an Admin</h1>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">1. Prerequisites</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <p><strong>Wallet:</strong> Install MetaMask or any WalletConnect-compatible wallet. You need the admin wallet — the address that was set as <code>admin()</code> on the ChallengePay contract.</p>
          <p><strong>Network:</strong> Connect to LightChain Testnet (Chain ID: 504). RPC: <code>https://light-testnet-rpc.lightchain.ai</code></p>
          <p><strong>Admin Key:</strong> For API operations (models, templates), you need the <code>ADMIN_KEY</code> secret. This is set as an environment variable on the server. Enter it in the Models &amp; Templates page when prompted.</p>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">2. First Steps</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <p><strong>Check the Dashboard:</strong> Navigate to <Link href="/admin" className="link">Dashboard</Link> to see system KPIs — active challenges, treasury balance, and recent activity.</p>
          <p><strong>Verify System Health:</strong> Go to <Link href="/admin/monitoring" className="link">Monitoring</Link> to check that all workers and indexers are running. Green dots = healthy.</p>
          <p><strong>Review Contract Config:</strong> Visit <Link href="/admin/config" className="link">Contract Config</Link> to see current governance settings, fee structure, and token allowlist.</p>
          <p><strong>Check Roles:</strong> Use <Link href="/admin/roles" className="link">Roles</Link> to verify who has OPERATOR_ROLE and SWEEPER_ROLE on the Treasury.</p>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">3. Common Admin Tasks</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <div className="card p-3">
            <strong>Pause the System</strong>
            <p style={{ color: "var(--lc-text-muted)", margin: "var(--lc-space-1) 0 0" }}>
              <Link href="/admin/config/governance" className="link">Config → Governance</Link> → Toggle &ldquo;Global Pause&rdquo;. This prevents all challenge creation and finalization.
            </p>
          </div>
          <div className="card p-3">
            <strong>Add a New Model</strong>
            <p style={{ color: "var(--lc-text-muted)", margin: "var(--lc-space-1) 0 0" }}>
              <Link href="/admin/models" className="link">Models &amp; Templates</Link> → Models tab → &ldquo;+ Add Model&rdquo;. For AIVM models, the hash and verifier auto-fill.
            </p>
          </div>
          <div className="card p-3">
            <strong>Grant Treasury Access</strong>
            <p style={{ color: "var(--lc-text-muted)", margin: "var(--lc-space-1) 0 0" }}>
              <Link href="/admin/roles" className="link">Roles</Link> → Select OPERATOR_ROLE or SWEEPER_ROLE → Enter address → Grant.
            </p>
          </div>
          <div className="card p-3">
            <strong>Cancel a Challenge</strong>
            <p style={{ color: "var(--lc-text-muted)", margin: "var(--lc-space-1) 0 0" }}>
              <Link href="/admin/challenges" className="link">Challenges</Link> → Enter challenge ID → Cancel. This refunds all participants.
            </p>
          </div>
          <div className="card p-3">
            <strong>Register an Event</strong>
            <p style={{ color: "var(--lc-text-muted)", margin: "var(--lc-space-1) 0 0" }}>
              <Link href="/admin/events" className="link">Events</Link> → Enter event title → Register. Then add outcomes to link challenges.
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div className="font-semibold">4. Troubleshooting</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <p><strong>Worker shows &ldquo;down&rdquo;:</strong> Check that the worker process is running. See <Link href="/admin/docs/operations" className="link">Operations Runbook</Link> for startup commands.</p>
          <p><strong>Challenge stuck in &ldquo;Active&rdquo;:</strong> Check <Link href="/admin/monitoring" className="link">Monitoring</Link> for AIVM indexer status. The indexer must process the <code>InferenceFinalized</code> event before the challenge can finalize.</p>
          <p><strong>Transaction reverted:</strong> Common reasons: wallet is not admin, challenge doesn&apos;t exist, system is paused, or fee config is invalid (protocolBps + creatorBps must ≤ forfeitFeeBps).</p>
          <p><strong>Models not saving:</strong> Ensure you&apos;ve entered the correct ADMIN_KEY. Click the key icon in the Models page header to set it.</p>
        </div>
      </section>
    </div>
  );
}
