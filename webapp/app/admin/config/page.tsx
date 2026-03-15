"use client";

import Link from "next/link";
import AdminPageHeader from "../components/AdminPageHeader";

const sections = [
  { href: "/admin/config/governance", title: "Governance", desc: "Global pause, lead time bounds, admin transfer" },
  { href: "/admin/config/fees", title: "Fees", desc: "Fee caps and fee configuration (BPS)" },
  { href: "/admin/config/proofs", title: "Proofs", desc: "Proof tighten-only mode" },
  { href: "/admin/config/tokens", title: "Tokens", desc: "Token allowlist management" },
  { href: "/admin/config/forwarder", title: "Trusted Forwarder", desc: "EIP-2771 gasless transaction relay" },
  { href: "/admin/config/protocol", title: "Protocol Safe", desc: "Set protocol multisig address" },
];

export default function ConfigHubPage() {
  return (
    <>
      <AdminPageHeader
        title="Contract Configuration"
        description="Manage on-chain governance settings"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Contract Config" }]}
      />
      <div className="admin-quick-grid">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="admin-quick-card">
            <div>
              <div className="admin-quick-card__label">{s.title}</div>
              <div className="admin-quick-card__desc">{s.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
