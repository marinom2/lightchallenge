"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/app/components/ui/Breadcrumb";
import Badge from "@/app/components/ui/Badge";
import Skeleton from "@/app/components/ui/Skeleton";
import Tabs, { type Tab } from "@/app/components/ui/Tabs";
import StatCard from "@/app/components/ui/StatCard";
import EmptyState from "@/app/components/ui/EmptyState";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Competition = {
  id: string;
  title: string;
  description: string;
  type: "challenge" | "bracket" | "league" | "circuit" | "ladder";
  status: "draft" | "registration" | "active" | "completed" | "canceled";
  category: string;
  max_participants: number | null;
  team_size?: number;
  rules: Record<string, unknown>;
  settings: Record<string, unknown>;
  prize_config: {
    type?: "winner_takes_all" | "top_n" | "proportional" | "custom";
    splits?: number[];
  };
  registration_opens_at: string;
  registration_closes_at: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  org_id?: string;
  org_name?: string;
  participant_count: number;
  match_count: number;
};

type BracketMatch = {
  id: string;
  round: number;
  position: number;
  participant_a: string | null;
  participant_b: string | null;
  score_a: number | null;
  score_b: number | null;
  winner: string | null;
  status: "pending" | "in_progress" | "completed";
  scheduled_at: string | null;
  completed_at: string | null;
};

type StandingEntry = {
  rank: number;
  participant: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  matches_played: number;
};

type Registration = {
  participant: string;
  team_name?: string;
  registered_at: string;
  status: "confirmed" | "pending" | "waitlisted";
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

const STATUS_TONE: Record<string, "success" | "accent" | "warning" | "danger" | "muted" | "info"> = {
  draft: "muted",
  registration: "info",
  active: "success",
  completed: "accent",
  canceled: "warning",
};

const TYPE_LABELS: Record<string, string> = {
  challenge: "Challenge",
  single: "Challenge",
  bracket: "Bracket",
  league: "League",
  round_robin: "League",
  circuit: "Circuit",
  ladder: "Ladder",
};

/* ── Icons (lucide-react) ──────────────────────────────────────────────────── */

import { Users, Swords, Trophy, Calendar } from "lucide-react";

function UsersIcon({ size = 18 }: { size?: number }) {
  return <Users size={size} strokeWidth={2} />;
}

function SwordsIcon({ size = 18 }: { size?: number }) {
  return <Swords size={size} strokeWidth={2} />;
}

function TrophyIcon({ size = 18 }: { size?: number }) {
  return <Trophy size={size} strokeWidth={2} />;
}

function CalendarIcon({ size = 14 }: { size?: number }) {
  return <Calendar size={size} strokeWidth={2} />;
}

/* ── MatchCard ─────────────────────────────────────────────────────────────── */

function MatchCard({ match }: { match: BracketMatch }) {
  const borderColor =
    match.status === "in_progress"
      ? "var(--lc-accent)"
      : match.status === "completed"
      ? "var(--lc-border-strong)"
      : "var(--lc-border)";

  const bgColor =
    match.status === "in_progress"
      ? "var(--lc-accent-muted)"
      : "var(--lc-bg-raised)";

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        border: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        minWidth: 200,
      }}
    >
      {/* Participant A */}
      <div
        className="flex-between"
        style={{
          padding: "var(--lc-space-2) var(--lc-space-3)",
          backgroundColor:
            match.winner && match.winner === match.participant_a
              ? "var(--lc-success-muted)"
              : "transparent",
        }}
      >
        <span
          className="text-small"
          style={{
            fontWeight:
              match.winner === match.participant_a
                ? "var(--lc-weight-semibold)"
                : "var(--lc-weight-normal)",
            color:
              match.winner === match.participant_a
                ? "var(--lc-success)"
                : match.participant_a
                ? "var(--lc-text)"
                : "var(--lc-text-muted)",
            fontFamily: match.participant_a ? "var(--lc-font-mono)" : undefined,
          } as React.CSSProperties}
        >
          {match.participant_a ? truncAddr(match.participant_a) : "TBD"}
        </span>
        <span
          className="text-small font-bold text-right"
          style={{
            color:
              match.winner === match.participant_a
                ? "var(--lc-success)"
                : "var(--lc-text-secondary)",
            minWidth: 20,
          }}
        >
          {match.score_a ?? "-"}
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--lc-border)" }} />

      {/* Participant B */}
      <div
        className="flex-between"
        style={{
          padding: "var(--lc-space-2) var(--lc-space-3)",
          backgroundColor:
            match.winner && match.winner === match.participant_b
              ? "var(--lc-success-muted)"
              : "transparent",
        }}
      >
        <span
          className="text-small"
          style={{
            fontWeight:
              match.winner === match.participant_b
                ? "var(--lc-weight-semibold)"
                : "var(--lc-weight-normal)",
            color:
              match.winner === match.participant_b
                ? "var(--lc-success)"
                : match.participant_b
                ? "var(--lc-text)"
                : "var(--lc-text-muted)",
            fontFamily: match.participant_b ? "var(--lc-font-mono)" : undefined,
          } as React.CSSProperties}
        >
          {match.participant_b ? truncAddr(match.participant_b) : "TBD"}
        </span>
        <span
          className="text-small font-bold text-right"
          style={{
            color:
              match.winner === match.participant_b
                ? "var(--lc-success)"
                : "var(--lc-text-secondary)",
            minWidth: 20,
          }}
        >
          {match.score_b ?? "-"}
        </span>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function CompetitionDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { authFetch, address } = useAuthFetch();

  const [comp, setComp] = useState<Competition | null>(null);
  const [bracket, setBracket] = useState<BracketMatch[]>([]);
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  /* Action states */
  const [registering, setRegistering] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reportingMatchId, setReportingMatchId] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState<{ score_a: string; score_b: string; winner: "a" | "b" | "" }>({ score_a: "", score_b: "", winner: "" });
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [regRefreshKey, setRegRefreshKey] = useState(0);

  /* Fetch competition detail */
  useEffect(() => {
    if (!id) return;
    let stop = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/v1/competitions/${id}`);
        if (!res.ok) throw new Error(`Failed to load competition (${res.status})`);
        const data = await res.json();
        if (!stop) setComp(data?.competition || data);
      } catch (e: any) {
        if (!stop) setError(e?.message || String(e));
      } finally {
        if (!stop) setLoading(false);
      }
    })();

    return () => { stop = true; };
  }, [id]);

  /* Fetch bracket data */
  useEffect(() => {
    if (!id) return;
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/competitions/${id}/bracket`);
        if (res.ok) {
          const data = await res.json();
          if (!stop) setBracket(Array.isArray(data?.matches) ? data.matches : Array.isArray(data) ? data : []);
        }
      } catch {}
    })();
    return () => { stop = true; };
  }, [id]);

  /* Fetch standings */
  useEffect(() => {
    if (!id) return;
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/competitions/${id}/standings`);
        if (res.ok) {
          const data = await res.json();
          if (!stop) setStandings(Array.isArray(data?.standings) ? data.standings : Array.isArray(data) ? data : []);
        }
      } catch {}
    })();
    return () => { stop = true; };
  }, [id]);

  /* Fetch registrations */
  useEffect(() => {
    if (!id) return;
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/competitions/${id}/register`);
        if (res.ok) {
          const data = await res.json();
          if (!stop) setRegistrations(Array.isArray(data?.registrations) ? data.registrations : Array.isArray(data) ? data : []);
        }
      } catch {}
    })();
    return () => { stop = true; };
  }, [id, regRefreshKey]);

  /* Derived data */
  const rounds = useMemo(() => {
    if (!bracket.length) return [];
    const roundMap = new Map<number, BracketMatch[]>();
    for (const m of bracket) {
      const arr = roundMap.get(m.round) || [];
      arr.push(m);
      roundMap.set(m.round, arr);
    }
    return Array.from(roundMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, matches]) => ({
        round,
        matches: matches.sort((a, b) => a.position - b.position),
      }));
  }, [bracket]);

  const completedMatches = useMemo(() => {
    return bracket
      .filter((m) => m.status === "completed")
      .sort((a, b) => {
        const tA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const tB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return tB - tA;
      });
  }, [bracket]);

  /* User registration state */
  const addrLower = address?.toLowerCase();
  const myRegistration = useMemo(
    () => registrations.find((r) => r.participant.toLowerCase() === addrLower),
    [registrations, addrLower],
  );
  const isRegistered = !!myRegistration;
  const isCheckedIn = myRegistration?.status === "confirmed";
  const isOrgAdmin = !!(comp && address && comp.org_id && comp.org_id.toLowerCase() === addrLower);

  /* Action handlers */
  const handleRegister = useCallback(async () => {
    if (!address || !id) return;
    setRegistering(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await authFetch(`/api/v1/competitions/${id}/register`, {
        method: "POST",
        body: JSON.stringify({ wallet: address }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Registration failed (${res.status})`);
      }
      setActionSuccess("Successfully registered!");
      setRegRefreshKey((k) => k + 1);
    } catch (e: any) {
      setActionError(e?.message || String(e));
    } finally {
      setRegistering(false);
    }
  }, [address, id, authFetch]);

  const handleCheckIn = useCallback(async () => {
    if (!address || !id) return;
    setCheckingIn(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await authFetch(`/api/v1/competitions/${id}/check-in`, {
        method: "POST",
        body: JSON.stringify({ wallet: address }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Check-in failed (${res.status})`);
      }
      setActionSuccess("Checked in successfully!");
      setRegRefreshKey((k) => k + 1);
    } catch (e: any) {
      setActionError(e?.message || String(e));
    } finally {
      setCheckingIn(false);
    }
  }, [address, id, authFetch]);

  const handleStart = useCallback(async () => {
    if (!address || !id) return;
    setStarting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await authFetch(`/api/v1/competitions/${id}/start`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to start (${res.status})`);
      }
      setActionSuccess("Competition started!");
      window.location.reload();
    } catch (e: any) {
      setActionError(e?.message || String(e));
    } finally {
      setStarting(false);
    }
  }, [address, id, authFetch]);

  const handleReportResult = useCallback(async (matchId: string) => {
    if (!id) return;
    setReportSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const body: Record<string, unknown> = {
        score_a: parseInt(reportForm.score_a) || 0,
        score_b: parseInt(reportForm.score_b) || 0,
      };
      if (reportForm.winner === "a" || reportForm.winner === "b") {
        body.winner = reportForm.winner;
      }
      const res = await authFetch(`/api/v1/competitions/${id}/matches/${matchId}/result`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Report failed (${res.status})`);
      }
      setActionSuccess("Result reported!");
      setReportingMatchId(null);
      setReportForm({ score_a: "", score_b: "", winner: "" });
      // Refetch bracket
      const bracketRes = await fetch(`/api/v1/competitions/${id}/bracket`);
      if (bracketRes.ok) {
        const data = await bracketRes.json();
        setBracket(Array.isArray(data?.matches) ? data.matches : Array.isArray(data) ? data : []);
      }
    } catch (e: any) {
      setActionError(e?.message || String(e));
    } finally {
      setReportSubmitting(false);
    }
  }, [id, reportForm, authFetch]);

  const tabs: Tab[] = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "bracket", label: "Bracket", count: bracket.length || undefined },
      { id: "standings", label: "Standings", count: standings.length || undefined },
      { id: "activity", label: "Activity", count: completedMatches.length || undefined },
    ],
    [bracket.length, standings.length, completedMatches.length]
  );

  /* Loading state */
  if (loading) {
    return (
      <div className="stack-6">
        <Skeleton variant="text" width="200px" />
        <Skeleton variant="text" width="60%" height="28px" />
        <Skeleton variant="text" width="80%" />
        <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="card" height="80px" />)}
        </div>
        <Skeleton variant="card" height="300px" />
      </div>
    );
  }

  /* Error state */
  if (error || !comp) {
    return (
      <div className="stack-6">
        <Breadcrumb items={[{ label: "Competitions", href: "/competitions" }, { label: `#${id}` }]} />
        <EmptyState
          title="Competition not found"
          description={error || "This competition does not exist or could not be loaded."}
          actionLabel="Back to Competitions"
          onAction={() => { window.location.href = "/competitions"; }}
        />
      </div>
    );
  }

  /* ── Rules renderer ──────────────────────────────────────────────────────── */
  const rulesEntries = Object.entries(comp.rules || {});

  return (
    <div className="stack-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Competitions", href: "/competitions" },
          { label: comp.title || `#${id}` },
        ]}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <section className="stack-3">
        {/* Badge row */}
        <div className="row-2 flex-wrap">
          <Badge variant="tone" tone={STATUS_TONE[comp.status] || "muted"} dot size="md">
            {comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}
          </Badge>
          <Badge variant="tone" tone="accent" size="sm">
            {TYPE_LABELS[comp.type] || comp.type}
          </Badge>
          {comp.category && (
            <Badge variant="category" size="sm">
              {comp.category}
            </Badge>
          )}
          {comp.org_name && (
            <span className="text-caption color-muted">
              by {comp.org_name}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-title font-bold color-primary leading-tight m-0">
          {comp.title}
        </h1>

        {/* Description */}
        {comp.description && (
          <p
            className="text-body color-secondary leading-normal m-0"
            style={{ maxWidth: 700 }}
          >
            {comp.description}
          </p>
        )}
      </section>

      {/* ── Action Feedback ────────────────────────────────────────────────── */}
      {actionError && (
        <div className="alert-banner alert-banner--error text-small">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="alert-banner alert-banner--success text-small">
          {actionSuccess}
        </div>
      )}

      {/* ── Action Buttons ──────────────────────────────────────────────────── */}
      {address && (
        <div className="row-3 flex-wrap">
          {/* Register button */}
          {comp.status === "registration" && !isRegistered && (
            <button
              onClick={handleRegister}
              disabled={registering}
              className="d-inline-flex row-2 rounded-md border-none text-small font-medium transition-fast"
              style={{
                padding: "10px 20px",
                backgroundColor: "var(--lc-accent)",
                color: "var(--lc-accent-text)",
                cursor: registering ? "not-allowed" : "pointer",
                opacity: registering ? 0.7 : 1,
              }}
            >
              {registering ? "Registering..." : "Register"}
            </button>
          )}

          {/* Check-in button */}
          {isRegistered && !isCheckedIn && (
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className="d-inline-flex row-2 rounded-md border-none text-small font-medium transition-fast"
              style={{
                padding: "10px 20px",
                backgroundColor: "var(--lc-success)",
                color: "#fff",
                cursor: checkingIn ? "not-allowed" : "pointer",
                opacity: checkingIn ? 0.7 : 1,
              }}
            >
              {checkingIn ? "Checking in..." : "Check In"}
            </button>
          )}

          {/* Registered badge */}
          {isRegistered && isCheckedIn && (
            <Badge variant="tone" tone="success" dot size="md">
              Registered &amp; Checked In
            </Badge>
          )}
          {isRegistered && !isCheckedIn && (
            <Badge variant="tone" tone="info" dot size="md">
              Registered (pending check-in)
            </Badge>
          )}

          {/* Start Competition (org admin) */}
          {isOrgAdmin && comp.status === "registration" && (
            <button
              onClick={handleStart}
              disabled={starting}
              className="d-inline-flex row-2 rounded-md text-small font-medium transition-fast"
              style={{
                padding: "10px 20px",
                border: "1px solid var(--lc-warning)",
                backgroundColor: "var(--lc-warning-muted)",
                color: "var(--lc-warning)",
                cursor: starting ? "not-allowed" : "pointer",
                opacity: starting ? 0.7 : 1,
              }}
            >
              {starting ? "Starting..." : "Start Competition"}
            </button>
          )}
        </div>
      )}

      {/* ── Stats Row ───────────────────────────────────────────────────────── */}
      <div
        className="d-grid gap-4 p-4 rounded-lg border bg-raised"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        <StatCard label="Participants" value={comp.participant_count} icon={<UsersIcon />} />
        <StatCard label="Matches" value={comp.match_count} icon={<SwordsIcon />} />
        <StatCard
          label="Status"
          value={comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}
          icon={<span className="color-success">&#9679;</span>}
        />
        <StatCard
          label="Created"
          value={formatDate(comp.created_at)}
          icon={<CalendarIcon />}
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs tabs={tabs} activeId={activeTab} onTabChange={setActiveTab} />

      <div className="mt-2">
        {/* ── Overview Tab ──────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="stack-6">
            {/* Timeline */}
            <div className="p-5 rounded-lg border bg-raised">
              <h3 className="text-subhead font-semibold color-primary m-0 mb-4">
                Timeline
              </h3>
              <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {[
                  { label: "Registration Opens", value: comp.registration_opens_at },
                  { label: "Registration Closes", value: comp.registration_closes_at },
                  { label: "Competition Starts", value: comp.starts_at },
                  { label: "Competition Ends", value: comp.ends_at },
                ].map((t) => (
                  <div key={t.label} className="stack-1">
                    <span className="text-caption color-muted d-flex items-center" style={{ gap: 4 }}>
                      <CalendarIcon />
                      {t.label}
                    </span>
                    <span className="text-small color-primary font-medium">
                      {formatDate(t.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules */}
            {rulesEntries.length > 0 && (
              <div className="p-5 rounded-lg border bg-raised">
                <h3 className="text-subhead font-semibold color-primary m-0 mb-4">
                  Rules
                </h3>
                <div className="stack-3">
                  {rulesEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex-between border-b py-2"
                      style={{ alignItems: "baseline" }}
                    >
                      <span className="text-small color-secondary text-capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span
                        className="text-small font-medium color-primary"
                        style={{
                          fontFamily: typeof value === "number" ? "var(--lc-font-mono)" : undefined,
                        }}
                      >
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prize Distribution */}
            <div className="p-5 rounded-lg border bg-raised">
              <h3 className="text-subhead font-semibold color-primary m-0 mb-4">
                Prize Distribution
              </h3>
              <div className="stack-3">
                <div className="flex-between">
                  <span className="text-small color-secondary">
                    Distribution Type
                  </span>
                  <Badge variant="tone" tone="accent" size="sm">
                    {(comp.prize_config?.type || "winner_takes_all").replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex-between">
                  <span className="text-small color-secondary">
                    Status
                  </span>
                  <Badge variant="tone" tone={STATUS_TONE[comp.status] || "muted"} size="sm">
                    {comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}
                  </Badge>
                </div>
                {comp.prize_config?.splits && comp.prize_config.splits.length > 0 && (
                  <div className="stack-2 mt-2">
                    {comp.prize_config.splits.map((pct, i) => (
                      <div
                        key={i}
                        className="row-3"
                      >
                        <span
                          className="text-caption font-bold"
                          style={{
                            color: i === 0 ? "var(--lc-warning)" : i === 1 ? "var(--lc-text-secondary)" : "var(--lc-text-muted)",
                            minWidth: 28,
                          }}
                        >
                          #{i + 1}
                        </span>
                        <div
                          className="flex-1 overflow-hidden"
                          style={{ height: 6, borderRadius: 3, backgroundColor: "var(--lc-bg-inset)" }}
                        >
                          <div
                            className="transition-slow"
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              borderRadius: 3,
                              backgroundColor: i === 0 ? "var(--lc-warning)" : i === 1 ? "var(--lc-accent)" : "var(--lc-text-muted)",
                            }}
                          />
                        </div>
                        <span
                          className="text-caption color-primary text-right"
                          style={{ fontFamily: "var(--lc-font-mono)", minWidth: 40 }}
                        >
                          {pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Settings */}
            <div className="p-5 rounded-lg border bg-raised">
              <h3 className="text-subhead font-semibold color-primary m-0 mb-4">
                Settings
              </h3>
              <div className="d-grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                {[
                  { label: "Max Participants", value: String(comp.max_participants ?? "Unlimited") },
                  { label: "Category", value: comp.category || "\u2014" },
                  { label: "Type", value: TYPE_LABELS[comp.type] || comp.type },
                  { label: "Registered", value: `${registrations.length}${comp.max_participants ? ` / ${comp.max_participants}` : ""}` },
                ].map((s) => (
                  <div key={s.label} className="stack-1">
                    <span className="text-caption color-muted">{s.label}</span>
                    <span className="text-small color-primary font-medium">
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Bracket Tab ───────────────────────────────────────────────────── */}
        {activeTab === "bracket" && (
          <>
            {comp.type !== "bracket" ? (
              <EmptyState
                title="Not applicable"
                description="Bracket view is only available for bracket-style tournaments."
              />
            ) : rounds.length === 0 ? (
              <EmptyState
                title="Bracket not generated"
                description="The bracket will be generated once registration closes and the competition begins."
              />
            ) : (
              <div
                className="d-flex gap-6 overflow-x-auto py-4"
                style={{ scrollbarWidth: "thin" }}
              >
                {rounds.map(({ round, matches }) => {
                  const matchGap = Math.max(16, Math.pow(2, round - 1) * 16);
                  return (
                    <div
                      key={round}
                      className="flex-col justify-center"
                      style={{
                        gap: matchGap,
                        minWidth: 220,
                        display: "flex",
                      }}
                    >
                      <div className="label-text mb-1" style={{ marginBottom: 8 }}>
                        {rounds.length > 1 && round === rounds[rounds.length - 1].round
                          ? "Final"
                          : round === rounds[rounds.length - 1].round - 1
                          ? "Semifinal"
                          : `Round ${round}`}
                      </div>
                      {matches.map((match) => (
                        <div key={match.id}>
                          <MatchCard match={match} />
                          {/* Report button for in_progress matches */}
                          {match.status === "in_progress" && address && (
                            <div className="mt-2">
                              {reportingMatchId === match.id ? (
                                <div className="stack-2 p-3 rounded-md border bg-raised">
                                  <div className="row-2">
                                    <label className="text-caption color-secondary flex-1">
                                      Score A
                                      <input
                                        type="number"
                                        min={0}
                                        value={reportForm.score_a}
                                        onChange={(e) => setReportForm((f) => ({ ...f, score_a: e.target.value }))}
                                        className="d-block w-full text-caption color-primary bg-inset border rounded-sm"
                                        style={{
                                          padding: "4px 8px",
                                          fontFamily: "var(--lc-font-mono)",
                                          marginTop: 2,
                                        }}
                                      />
                                    </label>
                                    <label className="text-caption color-secondary flex-1">
                                      Score B
                                      <input
                                        type="number"
                                        min={0}
                                        value={reportForm.score_b}
                                        onChange={(e) => setReportForm((f) => ({ ...f, score_b: e.target.value }))}
                                        className="d-block w-full text-caption color-primary bg-inset border rounded-sm"
                                        style={{
                                          padding: "4px 8px",
                                          fontFamily: "var(--lc-font-mono)",
                                          marginTop: 2,
                                        }}
                                      />
                                    </label>
                                  </div>
                                  <label className="text-caption color-secondary">
                                    Winner
                                    <select
                                      value={reportForm.winner}
                                      onChange={(e) => setReportForm((f) => ({ ...f, winner: e.target.value as "a" | "b" | "" }))}
                                      className="d-block w-full text-caption color-primary bg-inset border rounded-sm"
                                      style={{
                                        padding: "4px 8px",
                                        marginTop: 2,
                                      }}
                                    >
                                      <option value="">Select winner</option>
                                      <option value="a">{match.participant_a ? truncAddr(match.participant_a) : "Participant A"}</option>
                                      <option value="b">{match.participant_b ? truncAddr(match.participant_b) : "Participant B"}</option>
                                    </select>
                                  </label>
                                  <div className="row-2">
                                    <button
                                      onClick={() => handleReportResult(match.id)}
                                      disabled={reportSubmitting || !reportForm.winner}
                                      className="flex-1 text-caption font-medium rounded-sm border-none"
                                      style={{
                                        padding: "6px 12px",
                                        backgroundColor: !reportForm.winner || reportSubmitting ? "var(--lc-bg-overlay)" : "var(--lc-accent)",
                                        color: !reportForm.winner || reportSubmitting ? "var(--lc-text-muted)" : "var(--lc-accent-text)",
                                        cursor: !reportForm.winner || reportSubmitting ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {reportSubmitting ? "Saving..." : "Submit"}
                                    </button>
                                    <button
                                      onClick={() => { setReportingMatchId(null); setReportForm({ score_a: "", score_b: "", winner: "" }); }}
                                      className="text-caption rounded-sm border bg-transparent color-secondary cursor-pointer"
                                      style={{ padding: "6px 12px" }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setReportingMatchId(match.id); setReportForm({ score_a: "", score_b: "", winner: "" }); }}
                                  className="d-block w-full text-caption font-medium rounded-sm bg-accent-muted color-accent cursor-pointer transition-fast"
                                  style={{
                                    padding: "6px 12px",
                                    border: "1px solid var(--lc-accent)",
                                  }}
                                >
                                  Report Result
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Standings Tab ─────────────────────────────────────────────────── */}
        {activeTab === "standings" && (
          <>
            {standings.length === 0 ? (
              <EmptyState
                title="No standings yet"
                description="Standings will appear once matches have been played."
              />
            ) : (
              <div className="rounded-lg border overflow-hidden">
                {/* Header */}
                <div
                  className="d-grid bg-inset text-caption font-medium color-muted gap-2"
                  style={{
                    gridTemplateColumns: "48px 1fr 80px 80px 80px 80px",
                    padding: "var(--lc-space-3) var(--lc-space-4)",
                  }}
                >
                  <span>#</span>
                  <span>Participant</span>
                  <span className="text-right">W</span>
                  <span className="text-right">L</span>
                  <span className="text-right">D</span>
                  <span className="text-right">Pts</span>
                </div>

                {/* Rows */}
                {standings.map((entry, i) => (
                  <div
                    key={entry.participant}
                    className="d-grid items-center border-t gap-2"
                    style={{
                      gridTemplateColumns: "48px 1fr 80px 80px 80px 80px",
                      padding: "var(--lc-space-3) var(--lc-space-4)",
                      backgroundColor: i % 2 === 0 ? "var(--lc-bg-raised)" : "var(--lc-bg)",
                    }}
                  >
                    <span
                      className="text-small font-bold"
                      style={{ color: i < 3 ? "var(--lc-accent)" : "var(--lc-text-muted)" }}
                    >
                      {i < 3 ? ["1st", "2nd", "3rd"][i] : entry.rank}
                    </span>
                    <span
                      className="text-small color-primary"
                      style={{ fontFamily: "var(--lc-font-mono)" }}
                    >
                      {truncAddr(entry.participant)}
                    </span>
                    <span className="text-right text-small color-success">
                      {entry.wins}
                    </span>
                    <span className="text-right text-small color-danger">
                      {entry.losses}
                    </span>
                    <span className="text-right text-small color-secondary">
                      {entry.draws}
                    </span>
                    <span className="text-right text-small font-semibold color-primary">
                      {entry.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Activity Tab ──────────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <>
            {completedMatches.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Completed match results will appear here."
              />
            ) : (
              <div className="stack-3">
                {completedMatches.map((m) => (
                  <div
                    key={m.id}
                    className="row-4 rounded-md border bg-raised"
                    style={{ padding: "var(--lc-space-3) var(--lc-space-4)" }}
                  >
                    {/* Round badge */}
                    <Badge variant="tone" tone="muted" size="sm">
                      R{m.round}
                    </Badge>

                    {/* Participant A */}
                    <span
                      className="flex-1 text-small text-right min-w-0 text-ellipsis"
                      style={{
                        fontFamily: "var(--lc-font-mono)",
                        color: m.winner === m.participant_a ? "var(--lc-success)" : "var(--lc-text)",
                        fontWeight: m.winner === m.participant_a ? "var(--lc-weight-semibold)" : "var(--lc-weight-normal)",
                      } as React.CSSProperties}
                    >
                      {m.participant_a ? truncAddr(m.participant_a) : "TBD"}
                    </span>

                    {/* Score */}
                    <div
                      className="row-2 text-small font-bold color-primary shrink-0"
                      style={{ fontFamily: "var(--lc-font-mono)" }}
                    >
                      <span>{m.score_a ?? "-"}</span>
                      <span className="color-muted text-caption">vs</span>
                      <span>{m.score_b ?? "-"}</span>
                    </div>

                    {/* Participant B */}
                    <span
                      className="flex-1 text-small min-w-0 text-ellipsis"
                      style={{
                        fontFamily: "var(--lc-font-mono)",
                        color: m.winner === m.participant_b ? "var(--lc-success)" : "var(--lc-text)",
                        fontWeight: m.winner === m.participant_b ? "var(--lc-weight-semibold)" : "var(--lc-weight-normal)",
                      } as React.CSSProperties}
                    >
                      {m.participant_b ? truncAddr(m.participant_b) : "TBD"}
                    </span>

                    {/* Timestamp */}
                    <span className="text-caption color-muted shrink-0 text-nowrap">
                      {m.completed_at ? formatDate(m.completed_at) : "--"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
