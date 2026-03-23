"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Badge from "@/app/components/ui/Badge";
import Tabs, { type Tab } from "@/app/components/ui/Tabs";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Competition = {
  id: string;
  title: string;
  description: string;
  type: "challenge" | "bracket" | "league" | "circuit" | "ladder";
  status: "draft" | "registration" | "active" | "completed" | "canceled";
  category: string;
  settings: Record<string, unknown>;
  created_by?: string;
  org_id?: string;
  org_name?: string;
  participant_count: number;
  match_count: number;
};

type BracketMatch = {
  id: string;
  round: number;
  position: number;
  match_number: number;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number | null;
  score_b: number | null;
  winner: string | null;
  status: "pending" | "in_progress" | "completed";
  scheduled_at: string | null;
  completed_at: string | null;
  metadata?: Record<string, unknown>;
};

type Dispute = {
  id: string;
  match_id: string;
  competition_id: string;
  filed_by: string;
  reason: string;
  evidence_url: string | null;
  created_at: string;
  match?: BracketMatch;
};

type Registration = {
  participant: string;
  wallet: string;
  team_name?: string;
  registered_at: string;
  status: "confirmed" | "pending" | "waitlisted";
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

const STATUS_TONE: Record<string, "success" | "accent" | "warning" | "danger" | "muted" | "info"> = {
  draft: "muted",
  registration: "info",
  active: "success",
  completed: "accent",
  canceled: "warning",
};

const MATCH_STATUS_TONE: Record<string, "muted" | "info" | "success" | "danger"> = {
  pending: "muted",
  in_progress: "info",
  completed: "success",
  disputed: "danger",
};

/* ── Inline style helpers ──────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  backgroundColor: "var(--lc-bg-raised)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-lg)",
  padding: "var(--lc-space-5)",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: "var(--lc-radius-md)",
  fontSize: "var(--lc-text-small)",
  fontWeight: "var(--lc-weight-medium)" as any,
  color: "var(--lc-accent-text)",
  backgroundColor: "var(--lc-accent)",
  border: "none",
  cursor: "pointer",
  transition: "all var(--lc-dur-base) var(--lc-ease)",
};

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  backgroundColor: "var(--lc-danger)",
  color: "#fff",
};

const btnGhost: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: "var(--lc-radius-md)",
  fontSize: "var(--lc-text-small)",
  fontWeight: "var(--lc-weight-medium)" as any,
  color: "var(--lc-text-secondary)",
  backgroundColor: "transparent",
  border: "1px solid var(--lc-border)",
  cursor: "pointer",
  transition: "all var(--lc-dur-base) var(--lc-ease)",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "var(--lc-radius-md)",
  fontSize: "var(--lc-text-small)",
  color: "var(--lc-text)",
  backgroundColor: "var(--lc-bg-inset)",
  border: "1px solid var(--lc-border)",
  outline: "none",
  width: 70,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "auto",
  cursor: "pointer",
};

/* ── Result Form (inline) ──────────────────────────────────────────────────── */

function ResultForm({
  match,
  onSubmit,
  onCancel,
  isForce,
}: {
  match: BracketMatch;
  onSubmit: (scoreA: number, scoreB: number, winner: string) => void;
  onCancel: () => void;
  isForce?: boolean;
}) {
  const [scoreA, setScoreA] = useState<string>(match.score_a?.toString() ?? "0");
  const [scoreB, setScoreB] = useState<string>(match.score_b?.toString() ?? "0");
  const [winner, setWinner] = useState<string>(match.winner ?? match.participant_a ?? "");
  const [confirming, setConfirming] = useState(false);

  const handleSubmit = () => {
    if (isForce && !confirming) {
      setConfirming(true);
      return;
    }
    onSubmit(Number(scoreA), Number(scoreB), winner);
  };

  return (
    <div style={{ display: "flex", gap: "var(--lc-space-2)", alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>
        A:
        <input
          type="number"
          min={0}
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
          style={{ ...inputStyle, marginLeft: 4 }}
        />
      </label>
      <label style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>
        B:
        <input
          type="number"
          min={0}
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
          style={{ ...inputStyle, marginLeft: 4 }}
        />
      </label>
      <select
        value={winner}
        onChange={(e) => setWinner(e.target.value)}
        style={selectStyle}
      >
        {match.participant_a && (
          <option value={match.participant_a}>{truncAddr(match.participant_a)}</option>
        )}
        {match.participant_b && (
          <option value={match.participant_b}>{truncAddr(match.participant_b)}</option>
        )}
      </select>
      {confirming ? (
        <>
          <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-danger)" }}>
            Confirm force override?
          </span>
          <button style={btnDanger} onClick={handleSubmit}>Yes, Force</button>
          <button style={btnGhost} onClick={() => setConfirming(false)}>No</button>
        </>
      ) : (
        <>
          <button style={isForce ? btnDanger : btnPrimary} onClick={handleSubmit}>
            {isForce ? "Force" : "Submit"}
          </button>
          <button style={btnGhost} onClick={onCancel}>Cancel</button>
        </>
      )}
    </div>
  );
}

/* ── Main Admin Page ───────────────────────────────────────────────────────── */

export default function CompetitionAdminPage() {
  const params = useParams<{ id: string }>();
  const competitionId = params.id;
  const { authFetch, address } = useAuthFetch();

  // State
  const [comp, setComp] = useState<Competition | null>(null);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState("matches");
  const [matchFilter, setMatchFilter] = useState("all");
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [forceMatch, setForceMatch] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Fetch competition data
  const fetchData = useCallback(async () => {
    if (!competitionId) return;
    try {
      const [compRes, bracketRes, regRes] = await Promise.all([
        authFetch(`/api/v1/competitions/${competitionId}`),
        authFetch(`/api/v1/competitions/${competitionId}/bracket`),
        authFetch(`/api/v1/competitions/${competitionId}/register`),
      ]);

      if (compRes.ok) {
        const data = await compRes.json();
        setComp(data.competition);
      }
      if (bracketRes.ok) {
        const data = await bracketRes.json();
        setMatches(data.matches ?? []);
        // Extract disputes from matches with dispute metadata
        const disputedMatches = (data.matches ?? []).filter(
          (m: BracketMatch) => m.metadata && (m.metadata as any).disputes?.length > 0
        );
        // Also try fetching from dedicated disputes endpoint
        try {
          const disputeRes = await authFetch(`/api/v1/disputes?competition_id=${competitionId}`);
          if (disputeRes.ok) {
            const dData = await disputeRes.json();
            setDisputes(dData.disputes ?? []);
          }
        } catch {
          // Build disputes from match metadata as fallback
          const builtDisputes: Dispute[] = [];
          for (const m of disputedMatches) {
            const md = m.metadata as any;
            if (md?.disputes) {
              for (const d of md.disputes) {
                builtDisputes.push({
                  id: d.id ?? `${m.id}-dispute`,
                  match_id: m.id,
                  competition_id: competitionId,
                  filed_by: d.filed_by ?? "unknown",
                  reason: d.reason ?? "No reason given",
                  evidence_url: d.evidence_url ?? null,
                  created_at: d.created_at ?? new Date().toISOString(),
                  match: m,
                });
              }
            }
          }
          setDisputes(builtDisputes);
        }
      }
      if (regRes.ok) {
        const data = await regRes.json();
        setRegistrations(data.registrations ?? []);
      }
    } catch (e) {
      console.error("[admin] fetch error", e);
    } finally {
      setLoading(false);
    }
  }, [competitionId, authFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Authorization check: connected wallet must be org admin or creator
  useEffect(() => {
    if (!comp || !address) {
      if (!loading && !address) setAuthorized(false);
      return;
    }
    const wallet = address.toLowerCase();
    // Check if creator
    if (comp.created_by && comp.created_by.toLowerCase() === wallet) {
      setAuthorized(true);
      return;
    }
    // Check org membership via API
    if (comp.org_id) {
      authFetch(`/api/v1/organizations/${comp.org_id}/members`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) { setAuthorized(false); return; }
          const members = data.members ?? [];
          const me = members.find(
            (m: any) => m.wallet?.toLowerCase() === wallet && ["owner", "admin"].includes(m.role)
          );
          setAuthorized(!!me);
        })
        .catch(() => setAuthorized(false));
    } else {
      setAuthorized(false);
    }
  }, [comp, address, loading, authFetch]);

  // Actions
  const flash = (type: "ok" | "err", text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const reportResult = async (mid: string, scoreA: number, scoreB: number, winner: string) => {
    const res = await authFetch(`/api/v1/competitions/${competitionId}/matches/${mid}/result`, {
      method: "POST",
      body: JSON.stringify({ score_a: scoreA, score_b: scoreB, winner }),
    });
    const data = await res.json();
    if (data.ok) {
      flash("ok", `Match result recorded.`);
      setEditingMatch(null);
      setForceMatch(null);
      fetchData();
    } else {
      flash("err", data.error ?? "Failed to report result");
    }
  };

  const startCompetition = async () => {
    const res = await authFetch(`/api/v1/competitions/${competitionId}/start`, { method: "POST" });
    const data = await res.json();
    if (data.ok) { flash("ok", "Competition started!"); fetchData(); }
    else flash("err", data.error ?? "Failed to start");
  };

  const cancelCompetition = async () => {
    if (!confirm("Are you sure you want to cancel this competition? This cannot be undone.")) return;
    const res = await authFetch(`/api/v1/competitions/${competitionId}/cancel`, { method: "POST" });
    const data = await res.json();
    if (data.ok) { flash("ok", "Competition canceled."); fetchData(); }
    else flash("err", data.error ?? "Failed to cancel");
  };

  const advanceRound = async () => {
    const res = await authFetch(`/api/v1/competitions/${competitionId}/advance-round`, { method: "POST" });
    const data = await res.json();
    if (data.ok) { flash("ok", `Advanced to round ${data.round ?? "next"}.`); fetchData(); }
    else flash("err", data.error ?? "Failed to advance round");
  };

  const disqualifyParticipant = async (wallet: string) => {
    if (!confirm(`Disqualify ${truncAddr(wallet)}? Their matches will be forfeited.`)) return;
    const res = await authFetch(`/api/v1/competitions/${competitionId}/disqualify`, {
      method: "POST",
      body: JSON.stringify({ wallet }),
    });
    const data = await res.json();
    if (data.ok) {
      flash("ok", `Disqualified. ${data.matches_affected} match(es) affected.`);
      fetchData();
    } else {
      flash("err", data.error ?? "Failed to disqualify");
    }
  };

  const dismissDispute = async (disputeId: string, matchId: string) => {
    // Re-complete the match (clears dispute state)
    const res = await authFetch(`/api/v1/disputes/${disputeId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "dismiss" }),
    });
    const data = await res.json();
    if (data.ok) { flash("ok", "Dispute dismissed."); fetchData(); }
    else flash("err", data.error ?? "Failed to dismiss dispute");
  };

  // Filter matches
  const filteredMatches = matches.filter((m) => {
    if (matchFilter === "all") return true;
    if (matchFilter === "disputed") {
      return disputes.some((d) => d.match_id === m.id);
    }
    return m.status === matchFilter;
  });

  const isDisputed = (mid: string) => disputes.some((d) => d.match_id === mid);

  // Tabs
  const tabs: Tab[] = [
    { id: "matches", label: "Matches", count: matches.length },
    { id: "disputes", label: "Disputes", count: disputes.length },
    { id: "settings", label: "Settings" },
  ];

  /* ── Loading ──────────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={{ padding: "var(--lc-space-8)", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ height: 32, width: 300, borderRadius: "var(--lc-radius-md)", backgroundColor: "var(--lc-bg-raised)", marginBottom: "var(--lc-space-4)" }} />
        <div style={{ height: 200, borderRadius: "var(--lc-radius-lg)", backgroundColor: "var(--lc-bg-raised)" }} />
      </div>
    );
  }

  /* ── Not authorized ──────────────────────────────────────────────────────── */

  if (authorized === false) {
    return (
      <div style={{ padding: "var(--lc-space-10)", textAlign: "center" }}>
        <h2 style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-h3)", marginBottom: "var(--lc-space-3)" }}>
          Not authorized
        </h2>
        <p style={{ color: "var(--lc-text-secondary)", marginBottom: "var(--lc-space-5)" }}>
          {address
            ? "Your connected wallet does not have admin access to this competition."
            : "Please connect your wallet to access the admin dashboard."}
        </p>
        <Link
          href={`/competitions/${competitionId}`}
          style={{ color: "var(--lc-select-text)", textDecoration: "underline" }}
        >
          Back to competition
        </Link>
      </div>
    );
  }

  if (!comp) {
    return (
      <div style={{ padding: "var(--lc-space-10)", textAlign: "center" }}>
        <h2 style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-h3)" }}>Competition not found</h2>
      </div>
    );
  }

  const seriesFormat = (comp.settings as any)?.series_format ?? "bo1";
  const isSwiss = comp.type === "ladder" || (comp.settings as any)?.format === "swiss";

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <div style={{ padding: "var(--lc-space-6)", maxWidth: 1060, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "var(--lc-space-6)" }}>
        <Link
          href={`/competitions/${competitionId}`}
          style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-small)", textDecoration: "none" }}
        >
          &larr; Back to competition
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)", marginTop: "var(--lc-space-3)", flexWrap: "wrap" }}>
          <h1 style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-h2)", margin: 0 }}>
            {comp.title}
          </h1>
          <Badge variant="tone" tone={STATUS_TONE[comp.status] ?? "muted"} dot>
            {comp.status}
          </Badge>
          <Badge variant="tone" tone="warning" size="sm">
            Admin
          </Badge>
        </div>
      </div>

      {/* Flash message */}
      {actionMsg && (
        <div
          style={{
            padding: "var(--lc-space-3) var(--lc-space-4)",
            borderRadius: "var(--lc-radius-md)",
            marginBottom: "var(--lc-space-4)",
            backgroundColor: actionMsg.type === "ok" ? "var(--lc-success-muted)" : "var(--lc-danger-muted)",
            color: actionMsg.type === "ok" ? "var(--lc-success)" : "var(--lc-danger)",
            fontSize: "var(--lc-text-small)",
            border: `1px solid ${actionMsg.type === "ok" ? "var(--lc-success)" : "var(--lc-danger)"}`,
          }}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Tabs */}
      <Tabs tabs={tabs} activeId={activeTab} onTabChange={setActiveTab} />

      <div style={{ marginTop: "var(--lc-space-5)" }}>
        {/* ── Matches Tab ──────────────────────────────────────────────────── */}
        {activeTab === "matches" && (
          <div>
            {/* Filter pills */}
            <div style={{ display: "flex", gap: "var(--lc-space-2)", marginBottom: "var(--lc-space-4)", flexWrap: "wrap" }}>
              {["all", "pending", "in_progress", "completed", "disputed"].map((f) => (
                <button
                  key={f}
                  onClick={() => setMatchFilter(f)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "var(--lc-radius-pill)",
                    fontSize: "var(--lc-text-caption)",
                    fontWeight: "var(--lc-weight-medium)" as any,
                    color: matchFilter === f ? "var(--lc-select-text)" : "var(--lc-text-secondary)",
                    backgroundColor: matchFilter === f ? "var(--lc-select)" : "transparent",
                    border: matchFilter === f ? "1px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
                    cursor: "pointer",
                    transition: "all var(--lc-dur-base) var(--lc-ease)",
                    textTransform: "capitalize",
                  }}
                >
                  {f === "in_progress" ? "In Progress" : f}
                </button>
              ))}
            </div>

            {/* Match table */}
            <div style={{ ...card, padding: 0, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--lc-text-small)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--lc-border)" }}>
                    {["Round", "Match", "Participant A", "vs", "Participant B", "Score", "Status", "Actions"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "var(--lc-space-3) var(--lc-space-3)",
                          textAlign: "left",
                          color: "var(--lc-text-tertiary)",
                          fontWeight: "var(--lc-weight-medium)" as any,
                          fontSize: "var(--lc-text-caption)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "var(--lc-space-8)", textAlign: "center", color: "var(--lc-text-muted)" }}>
                        No matches found.
                      </td>
                    </tr>
                  ) : (
                    filteredMatches.map((m) => {
                      const disputed = isDisputed(m.id);
                      return (
                        <React.Fragment key={m.id}>
                          <tr
                            style={{
                              borderBottom: "1px solid var(--lc-border)",
                              backgroundColor: disputed ? "var(--lc-danger-muted)" : "transparent",
                              borderLeft: disputed ? "3px solid var(--lc-danger)" : "3px solid transparent",
                            }}
                          >
                            <td style={{ padding: "var(--lc-space-3)", color: "var(--lc-text-secondary)" }}>
                              R{m.round}
                            </td>
                            <td style={{ padding: "var(--lc-space-3)", color: "var(--lc-text-secondary)" }}>
                              #{m.match_number ?? m.position}
                            </td>
                            <td style={{ padding: "var(--lc-space-3)", fontFamily: "var(--lc-font-mono)", color: m.participant_a ? "var(--lc-text)" : "var(--lc-text-muted)" }}>
                              {m.participant_a ? truncAddr(m.participant_a) : "TBD"}
                              {m.winner === m.participant_a && m.participant_a && (
                                <span style={{ color: "var(--lc-success)", marginLeft: 4 }}>W</span>
                              )}
                            </td>
                            <td style={{ padding: "var(--lc-space-3)", color: "var(--lc-text-muted)", textAlign: "center" }}>
                              vs
                            </td>
                            <td style={{ padding: "var(--lc-space-3)", fontFamily: "var(--lc-font-mono)", color: m.participant_b ? "var(--lc-text)" : "var(--lc-text-muted)" }}>
                              {m.participant_b ? truncAddr(m.participant_b) : "TBD"}
                              {m.winner === m.participant_b && m.participant_b && (
                                <span style={{ color: "var(--lc-success)", marginLeft: 4 }}>W</span>
                              )}
                            </td>
                            <td style={{ padding: "var(--lc-space-3)", color: "var(--lc-text-secondary)" }}>
                              {m.score_a != null ? `${m.score_a} - ${m.score_b}` : "--"}
                            </td>
                            <td style={{ padding: "var(--lc-space-3)" }}>
                              <Badge variant="tone" tone={disputed ? "danger" : MATCH_STATUS_TONE[m.status] ?? "muted"} size="sm" dot>
                                {disputed ? "Disputed" : m.status.replace("_", " ")}
                              </Badge>
                            </td>
                            <td style={{ padding: "var(--lc-space-3)" }}>
                              <div style={{ display: "flex", gap: "var(--lc-space-1)" }}>
                                {m.status !== "completed" && m.participant_a && m.participant_b && (
                                  <button
                                    style={btnPrimary}
                                    onClick={() => { setEditingMatch(m.id); setForceMatch(null); }}
                                  >
                                    Report
                                  </button>
                                )}
                                {(m.status === "completed" || disputed) && (
                                  <button
                                    style={btnDanger}
                                    onClick={() => { setForceMatch(m.id); setEditingMatch(null); }}
                                  >
                                    Force
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {/* Inline result form */}
                          {(editingMatch === m.id || forceMatch === m.id) && (
                            <tr style={{ backgroundColor: "var(--lc-bg-overlay)" }}>
                              <td colSpan={8} style={{ padding: "var(--lc-space-3)" }}>
                                <ResultForm
                                  match={m}
                                  isForce={forceMatch === m.id}
                                  onSubmit={(sa, sb, w) => reportResult(m.id, sa, sb, w)}
                                  onCancel={() => { setEditingMatch(null); setForceMatch(null); }}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Disputes Tab ─────────────────────────────────────────────────── */}
        {activeTab === "disputes" && (
          <div>
            {disputes.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: "var(--lc-text-muted)", padding: "var(--lc-space-10)" }}>
                No active disputes.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                {disputes.map((d) => {
                  const m = matches.find((mm) => mm.id === d.match_id);
                  return (
                    <div
                      key={d.id}
                      style={{
                        ...card,
                        borderLeft: "3px solid var(--lc-danger)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: "var(--lc-space-2)", alignItems: "center", marginBottom: "var(--lc-space-2)" }}>
                            <Badge variant="tone" tone="danger" size="sm" dot>Dispute</Badge>
                            {m && (
                              <span style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-caption)" }}>
                                R{m.round} Match #{m.match_number ?? m.position}
                              </span>
                            )}
                          </div>

                          {m && (
                            <div style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text)", marginBottom: "var(--lc-space-2)", fontFamily: "var(--lc-font-mono)" }}>
                              {m.participant_a ? truncAddr(m.participant_a) : "TBD"}
                              <span style={{ color: "var(--lc-text-muted)", margin: "0 8px" }}>vs</span>
                              {m.participant_b ? truncAddr(m.participant_b) : "TBD"}
                            </div>
                          )}

                          <div style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", marginBottom: "var(--lc-space-1)" }}>
                            <strong style={{ color: "var(--lc-text)" }}>Reason:</strong> {d.reason}
                          </div>

                          <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-tertiary)" }}>
                            Filed by: <span style={{ fontFamily: "var(--lc-font-mono)" }}>{truncAddr(d.filed_by)}</span>
                            {d.evidence_url && (
                              <>
                                {" | "}
                                <a
                                  href={d.evidence_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "var(--lc-select-text)", textDecoration: "underline" }}
                                >
                                  Evidence
                                </a>
                              </>
                            )}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "var(--lc-space-2)", flexShrink: 0 }}>
                          <button
                            style={btnPrimary}
                            onClick={() => { setForceMatch(d.match_id); setActiveTab("matches"); }}
                          >
                            Resolve
                          </button>
                          <button
                            style={btnGhost}
                            onClick={() => dismissDispute(d.id, d.match_id)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Settings Tab ─────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-5)" }}>
            {/* Competition controls */}
            <div style={card}>
              <h3 style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-body)", margin: "0 0 var(--lc-space-4) 0" }}>
                Competition Controls
              </h3>
              <div style={{ display: "flex", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
                {comp.status === "registration" && (
                  <button style={btnPrimary} onClick={startCompetition}>
                    Start Competition
                  </button>
                )}
                {isSwiss && comp.status === "active" && (
                  <button style={btnPrimary} onClick={advanceRound}>
                    Advance Round (Swiss)
                  </button>
                )}
                {comp.status !== "completed" && comp.status !== "canceled" && (
                  <button style={btnDanger} onClick={cancelCompetition}>
                    Cancel Competition
                  </button>
                )}
              </div>
            </div>

            {/* Format info */}
            <div style={card}>
              <h3 style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-body)", margin: "0 0 var(--lc-space-3) 0" }}>
                Format
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--lc-space-2) var(--lc-space-4)", fontSize: "var(--lc-text-small)" }}>
                <span style={{ color: "var(--lc-text-tertiary)" }}>Type</span>
                <span style={{ color: "var(--lc-text)" }}>{comp.type}</span>

                <span style={{ color: "var(--lc-text-tertiary)" }}>Format</span>
                <span style={{ color: "var(--lc-text)" }}>{(comp.settings as any)?.format ?? "single_elim"}</span>

                <span style={{ color: "var(--lc-text-tertiary)" }}>Series</span>
                <span style={{ color: "var(--lc-text)" }}>{seriesFormat.toUpperCase()}</span>

                <span style={{ color: "var(--lc-text-tertiary)" }}>Participants</span>
                <span style={{ color: "var(--lc-text)" }}>{comp.participant_count}</span>

                <span style={{ color: "var(--lc-text-tertiary)" }}>Total Matches</span>
                <span style={{ color: "var(--lc-text)" }}>{comp.match_count}</span>
              </div>
            </div>

            {/* Participants */}
            <div style={card}>
              <h3 style={{ color: "var(--lc-text)", fontSize: "var(--lc-text-body)", margin: "0 0 var(--lc-space-3) 0" }}>
                Participants ({registrations.length})
              </h3>
              {registrations.length === 0 ? (
                <p style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-small)" }}>
                  No participants registered yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
                  {registrations.map((r) => {
                    const w = r.wallet ?? r.participant;
                    return (
                      <div
                        key={w}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "var(--lc-space-2) var(--lc-space-3)",
                          borderRadius: "var(--lc-radius-md)",
                          backgroundColor: "var(--lc-bg-inset)",
                          border: "1px solid var(--lc-border)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-2)" }}>
                          <span style={{ fontFamily: "var(--lc-font-mono)", fontSize: "var(--lc-text-small)", color: "var(--lc-text)" }}>
                            {truncAddr(w)}
                          </span>
                          {r.team_name && (
                            <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>
                              ({r.team_name})
                            </span>
                          )}
                          <Badge variant="tone" tone={r.status === "confirmed" ? "success" : r.status === "waitlisted" ? "warning" : "muted"} size="sm">
                            {r.status}
                          </Badge>
                        </div>
                        {comp.status === "active" && (
                          <button
                            style={{ ...btnDanger, fontSize: "var(--lc-text-caption)", padding: "2px 8px" }}
                            onClick={() => disqualifyParticipant(w)}
                          >
                            DQ
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
