"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";
import { AdminProvider, useAdmin } from "./components/AdminContext";
import AdminSidebar from "./components/AdminSidebar";
import { Toast, Busy } from "./components/ui";

/* ── Auth gate (inner, needs AdminProvider context) ───────────────────────── */

function AdminShell({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const { toast, busy } = useAdmin();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: adminAddr } = useReadContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "admin",
  });

  const isAdmin =
    !!adminAddr && !!address && (adminAddr as string).toLowerCase() === address.toLowerCase();

  // Not connected
  if (!address) {
    return (
      <div className="admin-layout">
        <div className="admin-main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="panel" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
            <div className="panel-body" style={{ padding: "var(--lc-space-8)" }}>
              <div style={{ fontSize: "2rem", marginBottom: "var(--lc-space-3)" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 var(--lc-space-2)" }}>
                Admin Console
              </h2>
              <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-muted)", margin: 0 }}>
                Connect your wallet to access the admin panel.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Connected but not admin
  if (!isAdmin) {
    return (
      <div className="admin-layout">
        <div className="admin-main" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="panel" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
            <div className="panel-body" style={{ padding: "var(--lc-space-8)" }}>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "var(--lc-space-2)" }}>
                Access Denied
              </div>
              <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-muted)", margin: 0 }}>
                This wallet is not the ChallengePay admin.
              </p>
              <p style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", marginTop: "var(--lc-space-3)" }} className="mono">
                {address}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin authenticated — show full layout
  return (
    <div className="admin-layout">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="admin-main">
        {/* Mobile toggle */}
        <div style={{ marginBottom: "var(--lc-space-4)" }}>
          <button
            type="button"
            className="admin-mobile-toggle"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open admin menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
            </svg>
          </button>
        </div>

        {/* Toast + busy */}
        {toast && <Toast kind={toast.kind} text={toast.text} />}
        {busy && <Busy text={busy} />}

        {children}
      </div>
    </div>
  );
}

/* ── Layout export ────────────────────────────────────────────────────────── */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
