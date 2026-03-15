import Link from "next/link";

export default function OperationsPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <nav style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-4)" }}>
        <Link href="/admin/docs" style={{ color: "var(--lc-text-muted)", textDecoration: "none" }}>Docs</Link>
        <span style={{ margin: "0 var(--lc-space-1)" }}>/</span>
        <span style={{ color: "var(--lc-text-secondary)" }}>Operations</span>
      </nav>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "var(--lc-space-6)" }}>Operations Runbook</h1>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">Required Environment Variables</div></div>
        <div className="panel-body" style={{ fontSize: "var(--lc-text-small)" }}>
          <table className="table table--compact" style={{ width: "100%" }}>
            <thead>
              <tr><th>Variable</th><th>Purpose</th><th>Required</th></tr>
            </thead>
            <tbody>
              <tr><td className="mono">DATABASE_URL</td><td>PostgreSQL connection string</td><td>Yes</td></tr>
              <tr><td className="mono">NEXT_PUBLIC_RPC_URL</td><td>LightChain RPC endpoint</td><td>Yes</td></tr>
              <tr><td className="mono">LCAI_WORKER_PK</td><td>Worker wallet private key (funds AIVM requests)</td><td>For workers</td></tr>
              <tr><td className="mono">LCAI_FINALIZE_PK</td><td>Finalization wallet key (submits proofs)</td><td>For indexer bridge</td></tr>
              <tr><td className="mono">ADMIN_KEY</td><td>API auth secret for admin endpoints</td><td>Recommended</td></tr>
              <tr><td className="mono">CHALLENGEPAY_ADDRESS</td><td>ChallengePay contract address</td><td>For indexers</td></tr>
              <tr><td className="mono">AIVM_INFERENCE_V2_ADDRESS</td><td>Lightchain AIVMInferenceV2 address</td><td>For AIVM indexer</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">Starting Workers</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <p>Each worker runs as a standalone Node.js process. Start them with:</p>
          <pre style={{ background: "var(--lc-glass)", padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", overflow: "auto", fontSize: "0.75rem" }}>{`# Evidence Evaluator (polls every 15s)
npx tsx offchain/workers/evidenceEvaluator.ts

# Challenge Worker (polls every 5s)
npx tsx offchain/workers/challengeWorker.ts

# Challenge Dispatcher (polls every 10s)
npx tsx offchain/dispatchers/challengeDispatcher.ts

# AIVM Indexer (polls every 6s)
npx tsx offchain/indexers/aivmIndexer.ts

# Status Indexer (polls every 6s)
npx tsx offchain/indexers/statusIndexer.ts

# Claims Indexer (polls every 6s)
npx tsx offchain/indexers/claimsIndexer.ts

# Webhook Delivery
npx tsx offchain/workers/webhookDelivery.ts

# Notification Worker
npx tsx offchain/workers/notificationWorker.ts

# Evidence Collector (auto-collects from linked accounts)
npx tsx offchain/workers/evidenceCollector.ts`}</pre>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">Database Migrations</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <p>Migrations are in <code>db/migrations/</code>. Run them with:</p>
          <pre style={{ background: "var(--lc-glass)", padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", overflow: "auto", fontSize: "0.75rem" }}>{`npx tsx db/migrate.ts`}</pre>
          <p>This applies all pending migrations in order. The <code>schema_migrations</code> table tracks which have been applied.</p>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-header"><div className="font-semibold">AIVM Pipeline Flow</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <pre style={{ background: "var(--lc-glass)", padding: "var(--lc-space-3)", borderRadius: "var(--lc-radius-md)", overflow: "auto", fontSize: "0.75rem" }}>{`AIVM Job Status Flow:
queued → processing → submitted → committed → revealed → done
                  ↘ failed (retries up to 10x) → dead

Triggered by: challengeDispatcher (enqueues)
Processed by: challengeWorker (submits to chain)
Tracked by:   aivmIndexer (watches chain events)`}</pre>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div className="font-semibold">Monitoring</div></div>
        <div className="panel-body space-y-3" style={{ fontSize: "var(--lc-text-small)" }}>
          <p>Use the <Link href="/admin/monitoring" className="link">Monitoring page</Link> to check:</p>
          <ul style={{ paddingLeft: "var(--lc-space-4)", listStyle: "disc" }}>
            <li>Worker last-seen timestamps and pending queue depth</li>
            <li>Indexer block lag (how far behind chain head)</li>
            <li>AIVM job status distribution</li>
          </ul>
          <p><strong>Healthy system indicators:</strong> All workers seen within 60s, indexer lag &lt; 20 blocks, no jobs stuck in &ldquo;failed&rdquo; status.</p>
        </div>
      </section>
    </div>
  );
}
