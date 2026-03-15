"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ShieldCheck, XCircle, Menu } from "lucide-react";
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
          <div className="panel" style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
            <div className="panel-body" style={{ padding: "var(--lc-space-8)", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--lc-space-4)" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                backgroundColor: "var(--lc-accent-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <ShieldCheck size={28} strokeWidth={1.5} style={{ color: "var(--lc-accent)" }} />
              </div>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 var(--lc-space-2)" }}>
                  Admin Console
                </h2>
                <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", margin: 0, lineHeight: "var(--lc-leading-normal)" }}>
                  Connect the admin wallet to access the LightChallenge management panel.
                </p>
              </div>
              <ConnectButton />
              <p style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", margin: 0 }}>
                Only the designated admin wallet can access this panel.
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
          <div className="panel" style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
            <div className="panel-body" style={{ padding: "var(--lc-space-8)", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--lc-space-4)" }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <XCircle size={28} strokeWidth={1.5} style={{ color: "var(--lc-danger, #ef4444)" }} />
              </div>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 var(--lc-space-2)" }}>
                  Access Denied
                </h2>
                <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", margin: 0, lineHeight: "var(--lc-leading-normal)" }}>
                  The connected wallet is not the ChallengePay admin.
                </p>
              </div>
              <p style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", margin: 0, wordBreak: "break-all" }} className="mono">
                Connected: {address}
              </p>
              <ConnectButton />
              <p style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", margin: 0 }}>
                Switch to the admin wallet to continue.
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
            <Menu size={18} />
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
