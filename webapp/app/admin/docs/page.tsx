import Link from "next/link";

const sections = [
  {
    href: "/admin/docs/onboarding",
    title: "Getting Started",
    desc: "Step-by-step guide for new administrators",
  },
  {
    href: "/admin/docs/architecture",
    title: "Architecture",
    desc: "System overview, contracts, and data flow",
  },
  {
    href: "/admin/docs/operations",
    title: "Operations Runbook",
    desc: "Worker startup, indexer management, troubleshooting",
  },
  {
    href: "/admin/docs/contracts",
    title: "Contract Reference",
    desc: "Deployed addresses, ABIs, and explorer links",
  },
];

export default function DocsHubPage() {
  return (
    <div>
      <div style={{ marginBottom: "var(--lc-space-6)" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 var(--lc-space-2)" }}>
          Admin Documentation
        </h1>
        <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-muted)", margin: 0 }}>
          Everything you need to manage and operate LightChallenge.
        </p>
      </div>

      <div className="admin-quick-grid">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="admin-quick-card" style={{ minHeight: 80 }}>
            <div>
              <div className="admin-quick-card__label">{s.title}</div>
              <div className="admin-quick-card__desc">{s.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
