"use client";

import { useEffect, useState } from "react";
import AdminPageHeader from "../components/AdminPageHeader";
import { short } from "../lib/utils";
import { EXPLORER_URL } from "@/lib/contracts";

type UserRow = {
  subject: string;
  challenge_count: number;
  evidence_count: number;
  verdict_count: number;
  reputation_level: number;
  reputation_points: number;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.ok ? r.json() : { users: [] })
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? users.filter((u) => u.subject.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <>
      <AdminPageHeader
        title="Users & Participants"
        description="Overview of all wallet addresses that have participated in challenges"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}
      />

      <div style={{ marginBottom: "var(--lc-space-4)" }}>
        <input
          className="input"
          placeholder="Search by wallet address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 400 }}
        />
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: "var(--lc-space-6)", textAlign: "center", color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)" }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "var(--lc-space-6)", textAlign: "center", color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)" }}>
              {search ? "No users match that address." : "No participants found. Users endpoint may not be configured."}
            </div>
          ) : (
            <table className="table table--compact" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Challenges</th>
                  <th>Evidence</th>
                  <th>Verdicts</th>
                  <th>Reputation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((u) => (
                  <tr key={u.subject}>
                    <td>
                      <a
                        href={`${EXPLORER_URL}/address/${u.subject}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono link"
                        style={{ fontSize: "var(--lc-text-caption)" }}
                      >
                        {short(u.subject)}
                      </a>
                    </td>
                    <td>{u.challenge_count}</td>
                    <td>{u.evidence_count}</td>
                    <td>{u.verdict_count}</td>
                    <td>
                      <span className="chip chip--info">Lv.{u.reputation_level} ({u.reputation_points}pts)</span>
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
