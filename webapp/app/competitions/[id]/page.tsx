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
  type: "single" | "bracket" | "round_robin" | "circuit";
  status: "draft" | "registration" | "active" | "completed" | "canceled";
  category: string;
  max_participants: number;
  team_size: number;
  rules: Record<string, unknown>;
  prize_pool_wei: string;
  prize_distribution: {
    type: "winner_takes_all" | "top_n" | "proportional" | "custom";
    splits?: number[];
  };
  registration_opens: string;
  registration_closes: string;
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

function formatPool(wei: string): string {
  try {
    const eth = Number(BigInt(wei)) / 1e18;
    return eth % 1 === 0 ? eth.toFixed(0) : eth.toFixed(2);
  } catch {
    return "0";
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
  single: "Single Challenge",
  bracket: "Bracket",
  round_robin: "Round Robin",
  circuit: "Circuit",
};

/* ── SVG Icons ─────────────────────────────────────────────────────────────── */

function UsersIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SwordsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
      <line x1="13" x2="19" y1="19" y2="13" />
      <line x1="16" x2="20" y1="16" y2="20" />
      <line x1="19" x2="21" y1="21" y2="19" />
      <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
      <line x1="5" x2="9" y1="14" y2="18" />
      <line x1="7" x2="4" y1="17" y2="20" />
      <line x1="3" x2="5" y1="19" y2="21" />
    </svg>
  );
}

function TrophyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
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
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--lc-radius-md)",
        overflow: "hidden",
        backgroundColor: bgColor,
        minWidth: 200,
      }}
    >
      {/* Participant A */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--lc-space-2) var(--lc-space-3)",
          backgroundColor:
            match.winner && match.winner === match.participant_a
              ? "var(--lc-success-muted)"
              : "transparent",
        }}
      >
        <span
          style={{
            fontSize: "var(--lc-text-small)",
            fontWeight:
              match.winner === match.participant_a
                ? ("var(--lc-weight-semibold)" as any)
                : ("var(--lc-weight-normal)" as any),
            color:
              match.winner === match.participant_a
                ? "var(--lc-success)"
                : match.participant_a
                ? "var(--lc-text)"
                : "var(--lc-text-muted)",
            fontFamily: match.participant_a ? "var(--lc-font-mono)" : undefined,
          }}
        >
          {match.participant_a ? truncAddr(match.participant_a) : "TBD"}
        </span>
        <span
          style={{
            fontSize: "var(--lc-text-small)",
            fontWeight: "var(--lc-weight-bold)" as any,
            color:
              match.winner === match.participant_a
                ? "var(--lc-success)"
                : "var(--lc-text-secondary)",
            minWidth: 20,
            textAlign: "right",
          }}
        >
          {match.score_a ?? "-"}
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: "var(--lc-border)" }} />

      {/* Participant B */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--lc-space-2) var(--lc-space-3)",
          backgroundColor:
            match.winner && match.winner === match.participant_b
              ? "var(--lc-success-muted)"
              : "transparent",
        }}
      >
        <span
          style={{
            fontSize: "var(--lc-text-small)",
            fontWeight:
              match.winner === match.participant_b
                ? ("var(--lc-weight-semibold)" as any)
                : ("var(--lc-weight-normal)" as any),
            color:
              match.winner === match.participant_b
                ? "var(--lc-success)"
                : match.participant_b
                ? "var(--lc-text)"
                : "var(--lc-text-muted)",
            fontFamily: match.participant_b ? "var(--lc-font-mono)" : undefined,
          }}
        >
          {match.participant_b ? truncAddr(match.participant_b) : "TBD"}
        </span>
        <span
          style={{
            fontSize: "var(--lc-text-small)",
            fontWeight: "var(--lc-weight-bold)" as any,
            color:
              match.winner === match.participant_b
                ? "var(--lc-success)"
                : "var(--lc-text-secondary)",
            minWidth: 20,
            textAlign: "right",
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
        if (!stop) setComp(data);
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
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
        <Skeleton variant="text" width="200px" />
        <Skeleton variant="text" width="60%" height="28px" />
        <Skeleton variant="text" width="80%" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--lc-space-4)" }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="card" height="80px" />)}
        </div>
        <Skeleton variant="card" height="300px" />
      </div>
    );
  }

  /* Error state */
  if (error || !comp) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Competitions", href: "/competitions" },
          { label: comp.title || `#${id}` },
        ]}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
        {/* Badge row */}
        <div style={{ display: "flex", gap: "var(--lc-space-2)", flexWrap: "wrap", alignItems: "center" }}>
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
            <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>
              by {comp.org_name}
            </span>
          )}
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "var(--lc-text-title)",
            fontWeight: "var(--lc-weight-bold)" as any,
            color: "var(--lc-text)",
            letterSpacing: "var(--lc-tracking-tight)",
            lineHeight: "var(--lc-leading-tight)" as any,
            margin: 0,
          }}
        >
          {comp.title}
        </h1>

        {/* Description */}
        {comp.description && (
          <p
            style={{
              fontSize: "var(--lc-text-body)",
              color: "var(--lc-text-secondary)",
              lineHeight: "var(--lc-leading-normal)" as any,
              margin: 0,
              maxWidth: 700,
            }}
          >
            {comp.description}
          </p>
        )}
      </section>

      {/* ── Action Feedback ────────────────────────────────────────────────── */}
      {actionError && (
        <div
          style={{
            padding: "var(--lc-space-3) var(--lc-space-4)",
            borderRadius: "var(--lc-radius-md)",
            backgroundColor: "var(--lc-danger-muted)",
            color: "var(--lc-danger)",
            fontSize: "var(--lc-text-small)",
          }}
        >
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div
          style={{
            padding: "var(--lc-space-3) var(--lc-space-4)",
            borderRadius: "var(--lc-radius-md)",
            backgroundColor: "var(--lc-success-muted)",
            color: "var(--lc-success)",
            fontSize: "var(--lc-text-small)",
          }}
        >
          {actionSuccess}
        </div>
      )}

      {/* ── Action Buttons ──────────────────────────────────────────────────── */}
      {address && (
        <div style={{ display: "flex", gap: "var(--lc-space-3)", flexWrap: "wrap", alignItems: "center" }}>
          {/* Register button */}
          {comp.status === "registration" && !isRegistered && (
            <button
              onClick={handleRegister}
              disabled={registering}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
                padding: "10px 20px",
                borderRadius: "var(--lc-radius-md)",
                border: "none",
                backgroundColor: "var(--lc-accent)",
                color: "var(--lc-accent-text)",
                fontSize: "var(--lc-text-small)",
                fontWeight: "var(--lc-weight-medium)" as any,
                cursor: registering ? "not-allowed" : "pointer",
                opacity: registering ? 0.7 : 1,
                transition: "all var(--lc-dur-fast) var(--lc-ease)",
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
                padding: "10px 20px",
                borderRadius: "var(--lc-radius-md)",
                border: "none",
                backgroundColor: "var(--lc-success)",
                color: "#fff",
                fontSize: "var(--lc-text-small)",
                fontWeight: "var(--lc-weight-medium)" as any,
                cursor: checkingIn ? "not-allowed" : "pointer",
                opacity: checkingIn ? 0.7 : 1,
                transition: "all var(--lc-dur-fast) var(--lc-ease)",
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--lc-space-2)",
                padding: "10px 20px",
                borderRadius: "var(--lc-radius-md)",
                border: "1px solid var(--lc-warning)",
                backgroundColor: "var(--lc-warning-muted)",
                color: "var(--lc-warning)",
                fontSize: "var(--lc-text-small)",
                fontWeight: "var(--lc-weight-medium)" as any,
                cursor: starting ? "not-allowed" : "pointer",
                opacity: starting ? 0.7 : 1,
                transition: "all var(--lc-dur-fast) var(--lc-ease)",
              }}
            >
              {starting ? "Starting..." : "Start Competition"}
            </button>
          )}
        </div>
      )}

      {/* ── Stats Row ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--lc-space-4)",
          padding: "var(--lc-space-4)",
          borderRadius: "var(--lc-radius-lg)",
          border: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-raised)",
        }}
      >
        <StatCard label="Participants" value={comp.participant_count} icon={<UsersIcon />} />
        <StatCard label="Matches" value={comp.match_count} icon={<SwordsIcon />} />
        <StatCard
          label="Status"
          value={comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}
          icon={<span style={{ color: "var(--lc-success)" }}>&#9679;</span>}
        />
        <StatCard
          label="Prize Pool"
          value={formatPool(comp.prize_pool_wei)}
          unit="LCAI"
          icon={<TrophyIcon />}
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs tabs={tabs} activeId={activeTab} onTabChange={setActiveTab} />

      <div style={{ marginTop: "var(--lc-space-2)" }}>
        {/* ── Overview Tab ──────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-6)" }}>
            {/* Timeline */}
            <div
              style={{
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
              }}
            >
              <h3
                style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  color: "var(--lc-text)",
                  marginBottom: "var(--lc-space-4)",
                  margin: "0 0 var(--lc-space-4) 0",
                }}
              >
                Timeline
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--lc-space-4)" }}>
                {[
                  { label: "Registration Opens", value: comp.registration_opens },
                  { label: "Registration Closes", value: comp.registration_closes },
                  { label: "Competition Starts", value: comp.starts_at },
                  { label: "Competition Ends", value: comp.ends_at },
                ].map((t) => (
                  <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                      <CalendarIcon />
                      {t.label}
                    </span>
                    <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text)", fontWeight: "var(--lc-weight-medium)" as any }}>
                      {formatDate(t.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules */}
            {rulesEntries.length > 0 && (
              <div
                style={{
                  padding: "var(--lc-space-5)",
                  borderRadius: "var(--lc-radius-lg)",
                  border: "1px solid var(--lc-border)",
                  backgroundColor: "var(--lc-bg-raised)",
                }}
              >
                <h3
                  style={{
                    fontSize: "var(--lc-text-subhead)",
                    fontWeight: "var(--lc-weight-semibold)" as any,
                    color: "var(--lc-text)",
                    margin: "0 0 var(--lc-space-4) 0",
                  }}
                >
                  Rules
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                  {rulesEntries.map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        padding: "var(--lc-space-2) 0",
                        borderBottom: "1px solid var(--lc-border)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "var(--lc-text-small)",
                          color: "var(--lc-text-secondary)",
                          textTransform: "capitalize",
                        }}
                      >
                        {key.replace(/_/g, " ")}
                      </span>
                      <span
                        style={{
                          fontSize: "var(--lc-text-small)",
                          fontWeight: "var(--lc-weight-medium)" as any,
                          color: "var(--lc-text)",
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
            <div
              style={{
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
              }}
            >
              <h3
                style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  color: "var(--lc-text)",
                  margin: "0 0 var(--lc-space-4) 0",
                }}
              >
                Prize Distribution
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>
                    Distribution Type
                  </span>
                  <Badge variant="tone" tone="accent" size="sm">
                    {(comp.prize_distribution?.type || "winner_takes_all").replace(/_/g, " ")}
                  </Badge>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>
                    Total Pool
                  </span>
                  <span style={{ fontSize: "var(--lc-text-small)", fontWeight: "var(--lc-weight-semibold)" as any, color: "var(--lc-text)" }}>
                    {formatPool(comp.prize_pool_wei)} LCAI
                  </span>
                </div>
                {comp.prize_distribution?.splits && comp.prize_distribution.splits.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)", marginTop: "var(--lc-space-2)" }}>
                    {comp.prize_distribution.splits.map((pct, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--lc-space-3)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "var(--lc-text-caption)",
                            fontWeight: "var(--lc-weight-bold)" as any,
                            color: i === 0 ? "var(--lc-warning)" : i === 1 ? "var(--lc-text-secondary)" : "var(--lc-text-muted)",
                            minWidth: 28,
                          }}
                        >
                          #{i + 1}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "var(--lc-bg-inset)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              borderRadius: 3,
                              backgroundColor: i === 0 ? "var(--lc-warning)" : i === 1 ? "var(--lc-accent)" : "var(--lc-text-muted)",
                              transition: "width var(--lc-dur-slow) var(--lc-ease)",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "var(--lc-text-caption)", fontFamily: "var(--lc-font-mono)", color: "var(--lc-text)", minWidth: 40, textAlign: "right" }}>
                          {pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Settings */}
            <div
              style={{
                padding: "var(--lc-space-5)",
                borderRadius: "var(--lc-radius-lg)",
                border: "1px solid var(--lc-border)",
                backgroundColor: "var(--lc-bg-raised)",
              }}
            >
              <h3
                style={{
                  fontSize: "var(--lc-text-subhead)",
                  fontWeight: "var(--lc-weight-semibold)" as any,
                  color: "var(--lc-text)",
                  margin: "0 0 var(--lc-space-4) 0",
                }}
              >
                Settings
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--lc-space-4)" }}>
                {[
                  { label: "Max Participants", value: String(comp.max_participants) },
                  { label: "Team Size", value: comp.team_size > 1 ? `${comp.team_size} per team` : "Solo" },
                  { label: "Type", value: TYPE_LABELS[comp.type] || comp.type },
                  { label: "Registered", value: `${registrations.length} / ${comp.max_participants}` },
                ].map((s) => (
                  <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-1)" }}>
                    <span style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)" }}>{s.label}</span>
                    <span style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text)", fontWeight: "var(--lc-weight-medium)" as any }}>
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
                style={{
                  display: "flex",
                  gap: "var(--lc-space-6)",
                  overflowX: "auto",
                  padding: "var(--lc-space-4) 0",
                  scrollbarWidth: "thin",
                }}
              >
                {rounds.map(({ round, matches }) => {
                  const matchGap = Math.max(16, Math.pow(2, round - 1) * 16);
                  return (
                    <div
                      key={round}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: matchGap,
                        minWidth: 220,
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "var(--lc-text-caption)",
                          color: "var(--lc-text-muted)",
                          fontWeight: "var(--lc-weight-medium)" as any,
                          marginBottom: 8,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
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
                            <div style={{ marginTop: "var(--lc-space-2)" }}>
                              {reportingMatchId === match.id ? (
                                <div
                                  style={{
                                    padding: "var(--lc-space-3)",
                                    borderRadius: "var(--lc-radius-md)",
                                    border: "1px solid var(--lc-border)",
                                    backgroundColor: "var(--lc-bg-raised)",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "var(--lc-space-2)",
                                  }}
                                >
                                  <div style={{ display: "flex", gap: "var(--lc-space-2)", alignItems: "center" }}>
                                    <label style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)", flex: 1 }}>
                                      Score A
                                      <input
                                        type="number"
                                        min={0}
                                        value={reportForm.score_a}
                                        onChange={(e) => setReportForm((f) => ({ ...f, score_a: e.target.value }))}
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          padding: "4px 8px",
                                          fontSize: "var(--lc-text-caption)",
                                          color: "var(--lc-text)",
                                          backgroundColor: "var(--lc-bg-inset)",
                                          border: "1px solid var(--lc-border)",
                                          borderRadius: "var(--lc-radius-sm)",
                                          fontFamily: "var(--lc-font-mono)",
                                          marginTop: 2,
                                        }}
                                      />
                                    </label>
                                    <label style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)", flex: 1 }}>
                                      Score B
                                      <input
                                        type="number"
                                        min={0}
                                        value={reportForm.score_b}
                                        onChange={(e) => setReportForm((f) => ({ ...f, score_b: e.target.value }))}
                                        style={{
                                          display: "block",
                                          width: "100%",
                                          padding: "4px 8px",
                                          fontSize: "var(--lc-text-caption)",
                                          color: "var(--lc-text)",
                                          backgroundColor: "var(--lc-bg-inset)",
                                          border: "1px solid var(--lc-border)",
                                          borderRadius: "var(--lc-radius-sm)",
                                          fontFamily: "var(--lc-font-mono)",
                                          marginTop: 2,
                                        }}
                                      />
                                    </label>
                                  </div>
                                  <label style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-secondary)" }}>
                                    Winner
                                    <select
                                      value={reportForm.winner}
                                      onChange={(e) => setReportForm((f) => ({ ...f, winner: e.target.value as "a" | "b" | "" }))}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "4px 8px",
                                        fontSize: "var(--lc-text-caption)",
                                        color: "var(--lc-text)",
                                        backgroundColor: "var(--lc-bg-inset)",
                                        border: "1px solid var(--lc-border)",
                                        borderRadius: "var(--lc-radius-sm)",
                                        marginTop: 2,
                                      }}
                                    >
                                      <option value="">Select winner</option>
                                      <option value="a">{match.participant_a ? truncAddr(match.participant_a) : "Participant A"}</option>
                                      <option value="b">{match.participant_b ? truncAddr(match.participant_b) : "Participant B"}</option>
                                    </select>
                                  </label>
                                  <div style={{ display: "flex", gap: "var(--lc-space-2)" }}>
                                    <button
                                      onClick={() => handleReportResult(match.id)}
                                      disabled={reportSubmitting || !reportForm.winner}
                                      style={{
                                        flex: 1,
                                        padding: "6px 12px",
                                        fontSize: "var(--lc-text-caption)",
                                        fontWeight: "var(--lc-weight-medium)" as any,
                                        borderRadius: "var(--lc-radius-sm)",
                                        border: "none",
                                        backgroundColor: !reportForm.winner || reportSubmitting ? "var(--lc-bg-overlay)" : "var(--lc-accent)",
                                        color: !reportForm.winner || reportSubmitting ? "var(--lc-text-muted)" : "var(--lc-accent-text)",
                                        cursor: !reportForm.winner || reportSubmitting ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {reportSubmitting ? "Saving..." : "Submit"}
                                    </button>
                                    <button
                                      onClick={() => { setReportingMatchId(null); setReportForm({ score_a: "", score_b: "", winner: "" }); }}
                                      style={{
                                        padding: "6px 12px",
                                        fontSize: "var(--lc-text-caption)",
                                        borderRadius: "var(--lc-radius-sm)",
                                        border: "1px solid var(--lc-border)",
                                        backgroundColor: "transparent",
                                        color: "var(--lc-text-secondary)",
                                        cursor: "pointer",
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setReportingMatchId(match.id); setReportForm({ score_a: "", score_b: "", winner: "" }); }}
                                  style={{
                                    display: "block",
                                    width: "100%",
                                    padding: "6px 12px",
                                    fontSize: "var(--lc-text-caption)",
                                    fontWeight: "var(--lc-weight-medium)" as any,
                                    borderRadius: "var(--lc-radius-sm)",
                                    border: "1px solid var(--lc-accent)",
                                    backgroundColor: "var(--lc-accent-muted)",
                                    color: "var(--lc-accent)",
                                    cursor: "pointer",
                                    transition: "all var(--lc-dur-fast) var(--lc-ease)",
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
              <div
                style={{
                  borderRadius: "var(--lc-radius-lg)",
                  border: "1px solid var(--lc-border)",
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 80px 80px 80px 80px",
                    padding: "var(--lc-space-3) var(--lc-space-4)",
                    backgroundColor: "var(--lc-bg-inset)",
                    fontSize: "var(--lc-text-caption)",
                    fontWeight: "var(--lc-weight-medium)" as any,
                    color: "var(--lc-text-muted)",
                    gap: "var(--lc-space-2)",
                  }}
                >
                  <span>#</span>
                  <span>Participant</span>
                  <span style={{ textAlign: "right" }}>W</span>
                  <span style={{ textAlign: "right" }}>L</span>
                  <span style={{ textAlign: "right" }}>D</span>
                  <span style={{ textAlign: "right" }}>Pts</span>
                </div>

                {/* Rows */}
                {standings.map((entry, i) => (
                  <div
                    key={entry.participant}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "48px 1fr 80px 80px 80px 80px",
                      padding: "var(--lc-space-3) var(--lc-space-4)",
                      backgroundColor: i % 2 === 0 ? "var(--lc-bg-raised)" : "var(--lc-bg)",
                      borderTop: "1px solid var(--lc-border)",
                      alignItems: "center",
                      gap: "var(--lc-space-2)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--lc-text-small)",
                        fontWeight: "var(--lc-weight-bold)" as any,
                        color: i < 3 ? "var(--lc-accent)" : "var(--lc-text-muted)",
                      }}
                    >
                      {i < 3 ? ["1st", "2nd", "3rd"][i] : entry.rank}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--lc-text-small)",
                        color: "var(--lc-text)",
                        fontFamily: "var(--lc-font-mono)",
                      }}
                    >
                      {truncAddr(entry.participant)}
                    </span>
                    <span style={{ textAlign: "right", fontSize: "var(--lc-text-small)", color: "var(--lc-success)" }}>
                      {entry.wins}
                    </span>
                    <span style={{ textAlign: "right", fontSize: "var(--lc-text-small)", color: "var(--lc-danger)" }}>
                      {entry.losses}
                    </span>
                    <span style={{ textAlign: "right", fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)" }}>
                      {entry.draws}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontSize: "var(--lc-text-small)",
                        fontWeight: "var(--lc-weight-semibold)" as any,
                        color: "var(--lc-text)",
                      }}
                    >
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
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-3)" }}>
                {completedMatches.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--lc-space-4)",
                      padding: "var(--lc-space-3) var(--lc-space-4)",
                      borderRadius: "var(--lc-radius-md)",
                      border: "1px solid var(--lc-border)",
                      backgroundColor: "var(--lc-bg-raised)",
                    }}
                  >
                    {/* Round badge */}
                    <Badge variant="tone" tone="muted" size="sm">
                      R{m.round}
                    </Badge>

                    {/* Participant A */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: "var(--lc-text-small)",
                        fontFamily: "var(--lc-font-mono)",
                        color: m.winner === m.participant_a ? "var(--lc-success)" : "var(--lc-text)",
                        fontWeight: m.winner === m.participant_a ? ("var(--lc-weight-semibold)" as any) : ("var(--lc-weight-normal)" as any),
                        textAlign: "right",
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.participant_a ? truncAddr(m.participant_a) : "TBD"}
                    </span>

                    {/* Score */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--lc-space-2)",
                        fontSize: "var(--lc-text-small)",
                        fontWeight: "var(--lc-weight-bold)" as any,
                        fontFamily: "var(--lc-font-mono)",
                        color: "var(--lc-text)",
                        flexShrink: 0,
                      }}
                    >
                      <span>{m.score_a ?? "-"}</span>
                      <span style={{ color: "var(--lc-text-muted)", fontSize: "var(--lc-text-caption)" }}>vs</span>
                      <span>{m.score_b ?? "-"}</span>
                    </div>

                    {/* Participant B */}
                    <span
                      style={{
                        flex: 1,
                        fontSize: "var(--lc-text-small)",
                        fontFamily: "var(--lc-font-mono)",
                        color: m.winner === m.participant_b ? "var(--lc-success)" : "var(--lc-text)",
                        fontWeight: m.winner === m.participant_b ? ("var(--lc-weight-semibold)" as any) : ("var(--lc-weight-normal)" as any),
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.participant_b ? truncAddr(m.participant_b) : "TBD"}
                    </span>

                    {/* Timestamp */}
                    <span
                      style={{
                        fontSize: "var(--lc-text-caption)",
                        color: "var(--lc-text-muted)",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
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
