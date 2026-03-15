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
        <div className="admin-main admin-gate">
          <div className="panel admin-gate__panel">
            <div className="panel-body admin-gate__body">
              <div className="admin-gate__icon admin-gate__icon--accent">
                <ShieldCheck size={28} strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="admin-gate__title">Admin Console</h2>
                <p className="admin-gate__desc">
                  Connect the admin wallet to access the LightChallenge management panel.
                </p>
              </div>
              <ConnectButton />
              <p className="admin-gate__hint">
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
        <div className="admin-main admin-gate">
          <div className="panel admin-gate__panel">
            <div className="panel-body admin-gate__body">
              <div className="admin-gate__icon admin-gate__icon--danger">
                <XCircle size={28} strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="admin-gate__title">Access Denied</h2>
                <p className="admin-gate__desc">
                  The connected wallet is not the ChallengePay admin.
                </p>
              </div>
              <p className="admin-gate__hint text-break mono">
                Connected: {address}
              </p>
              <ConnectButton />
              <p className="admin-gate__hint">
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
        <div className="mb-4">
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
