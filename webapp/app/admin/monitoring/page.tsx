"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";

type HealthData = {
  workers?: Record<string, { lastSeen?: string; pending?: number; errors?: number }>;
  indexers?: Record<string, { lastBlock?: number; chainHead?: number; lag?: number }>;
  jobs?: { status: string; count: number }[];
};

function StatusDot({ status }: { status: "ok" | "warn" | "error" | "unknown" }) {
  const colors = { ok: "var(--lc-success)", warn: "var(--lc-warning)", error: "var(--lc-error)", unknown: "var(--lc-text-muted)" };
  return (
    <span style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: colors[status],
      flexShrink: 0,
    }} />
  );
}

function ago(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3600_000)}h ago`;
}

function workerStatus(lastSeen?: string): "ok" | "warn" | "error" | "unknown" {
  if (!lastSeen) return "unknown";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 60_000) return "ok";
  if (diff < 300_000) return "warn";
  return "error";
}

const WORKERS = [
  { key: "evidenceEvaluator", label: "Evidence Evaluator", desc: "Evaluates submitted evidence → verdicts" },
  { key: "challengeWorker", label: "Challenge Worker", desc: "Processes queued AIVM jobs" },
  { key: "challengeDispatcher", label: "Challenge Dispatcher", desc: "Dispatches challenges ready for AIVM" },
  { key: "evidenceCollector", label: "Evidence Collector", desc: "Collects evidence from linked accounts" },
  { key: "webhookDelivery", label: "Webhook Delivery", desc: "Delivers webhook events to subscribers" },
  { key: "notificationWorker", label: "Notification Worker", desc: "Sends in-app notifications" },
];

const INDEXERS = [
  { key: "aivmIndexer", label: "AIVM Indexer", desc: "Watches AIVMInferenceV2 events" },
  { key: "statusIndexer", label: "Status Indexer", desc: "Watches ChallengePay Finalized/Canceled events" },
  { key: "claimsIndexer", label: "Claims Indexer", desc: "Watches claim events" },
];

export default function MonitoringPage() {
  const [health, setHealth] = useState<HealthData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/health")
      .then((r) => r.ok ? r.json() : {})
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <AdminPageHeader
        title="System Monitoring"
        description="Worker health, indexer status, and AIVM pipeline"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Monitoring" }]}
      />

      {/* Workers */}
      <div style={{ marginBottom: "var(--lc-space-6)" }}>
        <h2 style={{ fontSize: "var(--lc-text-body)", fontWeight: 600, marginBottom: "var(--lc-space-3)" }}>Workers</h2>
        <div className="admin-quick-grid">
          {WORKERS.map((w) => {
            const data = health.workers?.[w.key];
            const st = workerStatus(data?.lastSeen);
            return (
              <div key={w.key} className="admin-kpi">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-2)" }}>
                  <StatusDot status={st} />
                  <span style={{ fontSize: "var(--lc-text-small)", fontWeight: 600 }}>{w.label}</span>
                </div>
                <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-2)" }}>
                  {w.desc}
                </div>
                <div style={{ fontSize: "var(--lc-text-caption)" }}>
                  <span style={{ color: "var(--lc-text-muted)" }}>Last seen: </span>
                  {loading ? "…" : ago(data?.lastSeen)}
                </div>
                {data?.pending != null && (
                  <div style={{ fontSize: "var(--lc-text-caption)" }}>
                    <span style={{ color: "var(--lc-text-muted)" }}>Pending: </span>{data.pending}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Indexers */}
      <div style={{ marginBottom: "var(--lc-space-6)" }}>
        <h2 style={{ fontSize: "var(--lc-text-body)", fontWeight: 600, marginBottom: "var(--lc-space-3)" }}>Indexers</h2>
        <div className="admin-quick-grid">
          {INDEXERS.map((idx) => {
            const data = health.indexers?.[idx.key];
            const lag = data?.lag ?? null;
            const st = lag === null ? "unknown" : lag < 20 ? "ok" : lag < 100 ? "warn" : "error";
            return (
              <div key={idx.key} className="admin-kpi">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-2)" }}>
                  <StatusDot status={st} />
                  <span style={{ fontSize: "var(--lc-text-small)", fontWeight: 600 }}>{idx.label}</span>
                </div>
                <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-2)" }}>
                  {idx.desc}
                </div>
                <div style={{ fontSize: "var(--lc-text-caption)" }}>
                  <span style={{ color: "var(--lc-text-muted)" }}>Last block: </span>
                  {loading ? "…" : data?.lastBlock ?? "—"}
                </div>
                {lag != null && (
                  <div style={{ fontSize: "var(--lc-text-caption)" }}>
                    <span style={{ color: "var(--lc-text-muted)" }}>Lag: </span>{lag} blocks
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AIVM Job Status */}
      {health.jobs && health.jobs.length > 0 && (
        <div>
          <h2 style={{ fontSize: "var(--lc-text-body)", fontWeight: 600, marginBottom: "var(--lc-space-3)" }}>AIVM Job Pipeline</h2>
          <div className="admin-kpi-grid">
            {health.jobs.map((j) => (
              <div key={j.status} className="admin-kpi">
                <div className="admin-kpi__label">{j.status}</div>
                <div className="admin-kpi__value">{j.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !health.workers && (
        <div className="panel">
          <div className="panel-body" style={{ padding: "var(--lc-space-6)", textAlign: "center", color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)" }}>
            Health endpoint not available. Create <code>/api/admin/health</code> to enable monitoring.
          </div>
        </div>
      )}
    </>
  );
}
