"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "../components/AdminPageHeader";

type Competition = {
  id: string;
  title: string;
  type: string;
  status: string;
  category?: string;
  participant_count?: number;
  max_participants?: number;
  starts_at?: string;
  ends_at?: string;
  created_at?: string;
};

const STATUS_CHIP: Record<string, string> = {
  draft: "chip",
  registration: "chip chip--info",
  active: "chip chip--ok",
  finalizing: "chip chip--warn",
  completed: "chip chip--ok",
  canceled: "chip chip--bad",
};

export default function CompetitionsPage() {
  const [comps, setComps] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams({ limit: "50" });
    if (filter !== "all") params.set("status", filter);
    fetch(`/api/v1/competitions?${params}`)
      .then((r) => r.ok ? r.json() : { competitions: [] })
      .then((d) => setComps(d.competitions ?? d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const filters = ["all", "draft", "registration", "active", "completed", "canceled"];

  return (
    <>
      <AdminPageHeader
        title="Competition Management"
        description="Manage tournaments, leagues, and brackets"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Competitions" }]}
        actions={
          <Link href="/competitions/create" className="btn btn-primary btn-sm">
            Create Competition
          </Link>
        }
      />

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-4)" }}>
        {filters.map((f) => (
          <button
            key={f}
            className={`pill-toggle ${filter === f ? "is-active" : ""}`}
            onClick={() => { setFilter(f); setLoading(true); }}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: "var(--lc-space-6)", textAlign: "center", color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)" }}>
              Loading…
            </div>
          ) : comps.length === 0 ? (
            <div style={{ padding: "var(--lc-space-6)", textAlign: "center", color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)" }}>
              No competitions found.
            </div>
          ) : (
            <table className="table table--compact" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Participants</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.title}</td>
                    <td style={{ textTransform: "capitalize" }}>{c.type}</td>
                    <td><span className={STATUS_CHIP[c.status] ?? "chip"}>{c.status}</span></td>
                    <td style={{ textTransform: "capitalize" }}>{c.category ?? "—"}</td>
                    <td>
                      {c.participant_count ?? 0}
                      {c.max_participants ? ` / ${c.max_participants}` : ""}
                    </td>
                    <td style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <Link href={`/competitions/${c.id}`} className="link" style={{ fontSize: "var(--lc-text-caption)" }}>
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
