"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBalance, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { Settings, Box, DollarSign, Shield, Activity, BookOpen } from "lucide-react";
import { ABI, ADDR, EXPLORER_URL } from "@/lib/contracts";
import AdminPageHeader from "./components/AdminPageHeader";
import { short } from "./lib/utils";

/* ── Types ────────────────────────────────────────────────────────────────── */

type DashboardData = {
  kpis?: { active: number; finalized: number; canceled: number; unclaimed: number };
  items?: { id: string; status: string; txHash: string; blockNumber: string }[];
};

type StatsData = {
  totalChallenges?: number;
  modelsCount?: number;
};

type MetricsData = {
  challenges?: { total?: number; active?: number; finalized?: number; with_evidence?: number; with_verdicts?: number };
  evidence_providers?: { provider: string; submissions: number }[];
  reputation_levels?: { level: number; count: number }[];
  achievements?: { type: string; count: number }[];
};

/* ── Dashboard ────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [stats, setStats] = useState<StatsData>({});
  const [metrics, setMetrics] = useState<MetricsData>({});

  const { data: adminAddr } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "admin",
  });
  const { data: globalPaused } = useReadContract({
    address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "globalPaused",
  });
  const { data: treasuryNative } = useBalance({
    address: ADDR.Treasury,
    query: { refetchInterval: 15_000, refetchOnWindowFocus: false },
  });

  useEffect(() => {
    fetch("/api/dashboard?span=500").then((r) => r.json()).then(setDashboard).catch(() => {});
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});
    fetch("/api/protocol/metrics").then((r) => r.json()).then(setMetrics).catch(() => {});
  }, []);

  const kpis = dashboard.kpis;

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="System overview and quick actions"
      />

      {/* ── System status banner ── */}
      {globalPaused && (
        <div
          className="panel"
          style={{
            marginBottom: "var(--lc-space-4)",
            borderColor: "var(--lc-warning)",
            background: "rgba(255, 180, 50, 0.06)",
          }}
        >
          <div className="panel-body" style={{ padding: "var(--lc-space-3) var(--lc-space-4)", display: "flex", alignItems: "center", gap: "var(--lc-space-3)" }}>
            <span style={{ fontSize: "1.25rem" }}>&#9888;</span>
            <div>
              <strong>System Paused</strong>
              <span style={{ color: "var(--lc-text-muted)", marginLeft: "var(--lc-space-2)", fontSize: "var(--lc-text-small)" }}>
                All challenge operations are globally paused.
                <Link href="/admin/config/governance" style={{ marginLeft: "var(--lc-space-2)", color: "var(--lc-select-text)" }}>
                  Unpause →
                </Link>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Contract addresses ── */}
      <div className="panel" style={{ marginBottom: "var(--lc-space-5)" }}>
        <div className="panel-body" style={{ padding: "var(--lc-space-3) var(--lc-space-4)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--lc-space-4)", fontSize: "var(--lc-text-caption)" }}>
            {([
              ["ChallengePay", ADDR.ChallengePay],
              ["Treasury", ADDR.Treasury],
              ["Admin", adminAddr as string],
            ] as const).map(([label, addr]) => (
              <div key={label}>
                <span style={{ color: "var(--lc-text-muted)" }}>{label}: </span>
                <a
                  href={`${EXPLORER_URL}/address/${addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono link"
                >
                  {short(addr)}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="admin-kpi-grid" style={{ marginBottom: "var(--lc-space-6)" }}>
        <div className="admin-kpi">
          <div className="admin-kpi__label">Active Challenges</div>
          <div className="admin-kpi__value">{kpis?.active ?? "—"}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi__label">Finalized</div>
          <div className="admin-kpi__value">{kpis?.finalized ?? "—"}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi__label">Treasury Balance</div>
          <div className="admin-kpi__value">
            {treasuryNative ? `${Number(treasuryNative.formatted).toFixed(2)}` : "—"}
          </div>
          <div className="admin-kpi__sub">{treasuryNative?.symbol ?? "ETH"}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi__label">Unclaimed Rewards</div>
          <div className="admin-kpi__value">{kpis?.unclaimed ?? "—"}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi__label">Total Challenges</div>
          <div className="admin-kpi__value">{stats.totalChallenges ?? "—"}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi__label">Active Models</div>
          <div className="admin-kpi__value">{stats.modelsCount ?? "—"}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi__label">With Evidence</div>
          <div className="admin-kpi__value">{metrics.challenges?.with_evidence ?? "—"}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi__label">With Verdicts</div>
          <div className="admin-kpi__value">{metrics.challenges?.with_verdicts ?? "—"}</div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ marginBottom: "var(--lc-space-6)" }}>
        <h2 style={{ fontSize: "var(--lc-text-body)", fontWeight: "var(--lc-weight-semibold)" as any, marginBottom: "var(--lc-space-3)" }}>
          Quick Actions
        </h2>
        <div className="admin-quick-grid">
          <Link href="/admin/config/governance" className="admin-quick-card">
            <span className="admin-quick-card__icon"><Settings size={18} strokeWidth={1.8} /></span>
            <div>
              <div className="admin-quick-card__label">Contract Config</div>
              <div className="admin-quick-card__desc">Governance, fees, tokens</div>
            </div>
          </Link>

          <Link href="/admin/models" className="admin-quick-card">
            <span className="admin-quick-card__icon"><Box size={18} strokeWidth={1.8} /></span>
            <div>
              <div className="admin-quick-card__label">Models & Templates</div>
              <div className="admin-quick-card__desc">Manage AIVM models</div>
            </div>
          </Link>

          <Link href="/admin/treasury" className="admin-quick-card">
            <span className="admin-quick-card__icon"><DollarSign size={18} strokeWidth={1.8} /></span>
            <div>
              <div className="admin-quick-card__label">Treasury</div>
              <div className="admin-quick-card__desc">Grants, sweeps, allowances</div>
            </div>
          </Link>

          <Link href="/admin/roles" className="admin-quick-card">
            <span className="admin-quick-card__icon"><Shield size={18} strokeWidth={1.8} /></span>
            <div>
              <div className="admin-quick-card__label">Roles</div>
              <div className="admin-quick-card__desc">Grant and revoke access</div>
            </div>
          </Link>

          <Link href="/admin/monitoring" className="admin-quick-card">
            <span className="admin-quick-card__icon"><Activity size={18} strokeWidth={1.8} /></span>
            <div>
              <div className="admin-quick-card__label">Monitoring</div>
              <div className="admin-quick-card__desc">Workers, indexers, AIVM</div>
            </div>
          </Link>

          <Link href="/admin/docs" className="admin-quick-card">
            <span className="admin-quick-card__icon"><BookOpen size={18} strokeWidth={1.8} /></span>
            <div>
              <div className="admin-quick-card__label">Documentation</div>
              <div className="admin-quick-card__desc">Guides and reference</div>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      {dashboard.items && dashboard.items.length > 0 && (
        <div>
          <h2 style={{ fontSize: "var(--lc-text-body)", fontWeight: "var(--lc-weight-semibold)" as any, marginBottom: "var(--lc-space-3)" }}>
            Recent On-Chain Activity
          </h2>
          <div className="panel">
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="table table--compact" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Block</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.items.slice(0, 10).map((item) => (
                    <tr key={item.txHash}>
                      <td className="mono">{item.id}</td>
                      <td>
                        <span className={`chip chip--${item.status === "Active" ? "info" : item.status === "Finalized" ? "ok" : "bad"}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: "var(--lc-text-caption)" }}>{item.blockNumber}</td>
                      <td>
                        <a
                          href={`${EXPLORER_URL}/tx/${item.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mono link"
                          style={{ fontSize: "var(--lc-text-caption)" }}
                        >
                          {short(item.txHash)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
