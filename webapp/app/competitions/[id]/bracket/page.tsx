"use client";

/**
 * /competitions/[id]/bracket — Tournament bracket page.
 *
 * Fetches bracket data from the API, connects to live SSE updates,
 * and renders a full bracket tree with filtering and highlighting.
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import Tabs, { type Tab } from "@/app/components/ui/Tabs";
import Skeleton from "@/app/components/ui/Skeleton";
import Badge from "@/app/components/ui/Badge";
import BracketViewer from "@/app/components/ui/BracketViewer";
import { useLiveBracket, type BracketMatch } from "@/lib/useLiveBracket";
import { useAuthFetch } from "@/lib/useAuthFetch";

/* ── Types ────────────────────────────────────────────────────────────────── */

type BracketData = {
  competition_id: string;
  competition_title: string;
  format: "single_elimination" | "double_elimination";
  matches: BracketMatch[];
  standings?: StandingEntry[];
  participants?: ParticipantEntry[];
};

type StandingEntry = {
  rank: number;
  participant: string;
  wins: number;
  losses: number;
  matches_played: number;
  status: "active" | "eliminated" | "champion";
};

type ParticipantEntry = {
  address: string;
  display_name: string | null;
  seed: number | null;
  registered_at: string;
};

type BracketFilter = "all" | "winners" | "losers" | "grand_final";

/* ── Page Tabs ────────────────────────────────────────────────────────────── */

const PAGE_TABS: Tab[] = [
  { id: "bracket", label: "Bracket" },
  { id: "standings", label: "Standings" },
  { id: "participants", label: "Participants" },
];

const FILTER_TABS: Tab[] = [
  { id: "all", label: "All" },
  { id: "winners", label: "Winners" },
  { id: "losers", label: "Losers" },
  { id: "grand_final", label: "Grand Final" },
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ── Page Component ───────────────────────────────────────────────────────── */

export default function BracketPage() {
  const params = useParams();
  const router = useRouter();
  const competitionId = params.id as string;
  const { address } = useAccount();
  const { authFetch } = useAuthFetch();

  const [activeTab, setActiveTab] = useState("bracket");
  const [bracketFilter, setBracketFilter] = useState<BracketFilter>("all");
  const [data, setData] = useState<BracketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live bracket updates via SSE
  const { matches: liveMatches, connected } = useLiveBracket(competitionId, !loading);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await authFetch(`/api/v1/competitions/${competitionId}/bracket`);
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Bracket not found" : `Failed to load bracket (${res.status})`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load bracket");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [competitionId, authFetch]);

  // Merge live updates with initial data
  const displayMatches = useMemo(() => {
    if (!data) return [];
    const base = data.matches;
    if (liveMatches.length === 0) return base;

    // Live matches take precedence
    const merged = [...base];
    for (const lm of liveMatches) {
      const idx = merged.findIndex((m) => m.id === lm.id);
      if (idx >= 0) {
        merged[idx] = lm;
      } else {
        merged.push(lm);
      }
    }
    return merged;
  }, [data, liveMatches]);

  // Apply bracket filter
  const filteredMatches = useMemo(() => {
    if (bracketFilter === "all") return displayMatches;
    return displayMatches.filter((m) => m.bracket_type === bracketFilter);
  }, [displayMatches, bracketFilter]);

  // Determine if double-elim (show filter controls)
  const isDoubleElim = useMemo(
    () => data?.format === "double_elimination" || displayMatches.some((m) => m.bracket_type !== "winners"),
    [data, displayMatches]
  );

  const handleMatchClick = useCallback(
    (matchId: string) => {
      router.push(`/competitions/${competitionId}/bracket?match=${matchId}`);
    },
    [competitionId, router]
  );

  /* ── Loading State ─────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={{ maxWidth: "var(--lc-content-max-w)", margin: "0 auto", padding: "var(--lc-space-6)" }}>
        <BracketPageShell competitionId={competitionId} />
        <div style={{ marginTop: "var(--lc-space-6)" }}>
          <BracketSkeleton />
        </div>
      </div>
    );
  }

  /* ── Error State ───────────────────────────────────────────────────────── */

  if (error || !data) {
    return (
      <div style={{ maxWidth: "var(--lc-content-max-w)", margin: "0 auto", padding: "var(--lc-space-6)" }}>
        <BracketPageShell competitionId={competitionId} />
        <div
          style={{
            textAlign: "center",
            padding: "var(--lc-space-16) var(--lc-space-6)",
            color: "var(--lc-text-secondary)",
          }}
        >
          <div
            style={{
              fontSize: "var(--lc-text-heading)",
              fontWeight: "var(--lc-weight-semibold)" as any,
              color: "var(--lc-text)",
              marginBottom: "var(--lc-space-2)",
            }}
          >
            {error || "Something went wrong"}
          </div>
          <p style={{ fontSize: "var(--lc-text-small)", margin: 0, color: "var(--lc-text-tertiary)" }}>
            The bracket may not be generated yet, or the competition does not exist.
          </p>
          <Link
            href={`/competitions/${competitionId}`}
            style={{
              display: "inline-block",
              marginTop: "var(--lc-space-6)",
              padding: "10px 20px",
              borderRadius: "var(--lc-radius-pill)",
              backgroundColor: "var(--lc-accent)",
              color: "var(--lc-accent-text)",
              fontWeight: "var(--lc-weight-semibold)" as any,
              fontSize: "var(--lc-text-small)",
              textDecoration: "none",
              transition: "opacity var(--lc-dur-fast) var(--lc-ease)",
            }}
          >
            Back to Competition
          </Link>
        </div>
      </div>
    );
  }

  /* ── Main Render ───────────────────────────────────────────────────────── */

  return (
    <div style={{ maxWidth: "var(--lc-content-max-w)", margin: "0 auto", padding: "var(--lc-space-6)" }}>
      {/* Header */}
      <div style={{ marginBottom: "var(--lc-space-4)" }}>
        <Link
          href={`/competitions/${competitionId}`}
          style={{
            fontSize: "var(--lc-text-small)",
            color: "var(--lc-text-tertiary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginBottom: "var(--lc-space-2)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8.5 3L4.5 7L8.5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to competition
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--lc-space-3)", flexWrap: "wrap" }}>
          <h1
            style={{
              fontSize: "var(--lc-text-heading)",
              fontWeight: "var(--lc-weight-bold)" as any,
              color: "var(--lc-text)",
              margin: 0,
            }}
          >
            {data.competition_title}
          </h1>
          {connected && (
            <Badge variant="tone" tone="success" dot size="sm">
              Live
            </Badge>
          )}
          <Badge variant="tone" tone="muted" size="sm">
            {isDoubleElim ? "Double Elimination" : "Single Elimination"}
          </Badge>
        </div>
      </div>

      {/* Page Tabs */}
      <Tabs tabs={PAGE_TABS} activeId={activeTab} onTabChange={setActiveTab} />

      <div style={{ marginTop: "var(--lc-space-5)" }}>
        {/* ── Bracket Tab ──────────────────────────────────────────────── */}
        {activeTab === "bracket" && (
          <>
            {/* Filter controls for double-elim */}
            {isDoubleElim && (
              <div style={{ marginBottom: "var(--lc-space-4)" }}>
                <Tabs
                  tabs={FILTER_TABS}
                  activeId={bracketFilter}
                  onTabChange={(id) => setBracketFilter(id as BracketFilter)}
                  variant="pills"
                  size="sm"
                />
              </div>
            )}

            <BracketViewer
              matches={filteredMatches}
              onMatchClick={handleMatchClick}
              highlightParticipant={address ?? undefined}
            />
          </>
        )}

        {/* ── Standings Tab ────────────────────────────────────────────── */}
        {activeTab === "standings" && (
          <StandingsView standings={data.standings || []} currentAddress={address} />
        )}

        {/* ── Participants Tab ─────────────────────────────────────────── */}
        {activeTab === "participants" && (
          <ParticipantsView participants={data.participants || []} currentAddress={address} />
        )}
      </div>
    </div>
  );
}

/* ── Standings View ───────────────────────────────────────────────────────── */

function StandingsView({
  standings,
  currentAddress,
}: {
  standings: StandingEntry[];
  currentAddress: string | undefined;
}) {
  if (standings.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "var(--lc-space-12) var(--lc-space-6)",
          color: "var(--lc-text-tertiary)",
          fontSize: "var(--lc-text-small)",
        }}
      >
        Standings will appear once matches are completed.
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: "var(--lc-bg-raised)",
        border: "1px solid var(--lc-border)",
        borderRadius: "var(--lc-radius-md)",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "48px 1fr 60px 60px 70px 80px",
          padding: "10px 16px",
          borderBottom: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-inset)",
          fontSize: "var(--lc-text-caption)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: "var(--lc-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <span>Rank</span>
        <span>Participant</span>
        <span style={{ textAlign: "right" }}>W</span>
        <span style={{ textAlign: "right" }}>L</span>
        <span style={{ textAlign: "right" }}>Played</span>
        <span style={{ textAlign: "right" }}>Status</span>
      </div>

      {standings.map((entry) => {
        const isCurrentUser = currentAddress?.toLowerCase() === entry.participant.toLowerCase();
        return (
          <div
            key={entry.participant}
            style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr 60px 60px 70px 80px",
              padding: "12px 16px",
              borderBottom: "1px solid var(--lc-border)",
              backgroundColor: isCurrentUser ? "var(--lc-select)" : "transparent",
              alignItems: "center",
              minHeight: 44,
            }}
          >
            <span
              style={{
                fontSize: "var(--lc-text-small)",
                fontWeight: "var(--lc-weight-semibold)" as any,
                color:
                  entry.rank === 1
                    ? "var(--lc-warm)"
                    : entry.rank <= 3
                      ? "var(--lc-text)"
                      : "var(--lc-text-secondary)",
              }}
            >
              {entry.rank === 1 ? "\u{1F3C6}" : `#${entry.rank}`}
            </span>
            <span
              style={{
                fontSize: "var(--lc-text-small)",
                fontFamily: "var(--lc-font-mono)",
                color: isCurrentUser ? "var(--lc-select-text)" : "var(--lc-text)",
                fontWeight: isCurrentUser ? ("var(--lc-weight-semibold)" as any) : ("var(--lc-weight-normal)" as any),
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {truncateAddress(entry.participant)}
              {isCurrentUser && (
                <span style={{ marginLeft: 6, fontSize: "var(--lc-text-caption)", color: "var(--lc-select-text)", opacity: 0.7 }}>
                  (you)
                </span>
              )}
            </span>
            <span style={{ textAlign: "right", fontSize: "var(--lc-text-small)", color: "var(--lc-success)", fontVariantNumeric: "tabular-nums" }}>
              {entry.wins}
            </span>
            <span style={{ textAlign: "right", fontSize: "var(--lc-text-small)", color: "var(--lc-danger)", fontVariantNumeric: "tabular-nums" }}>
              {entry.losses}
            </span>
            <span style={{ textAlign: "right", fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {entry.matches_played}
            </span>
            <span style={{ textAlign: "right" }}>
              <Badge
                variant="tone"
                tone={entry.status === "champion" ? "success" : entry.status === "active" ? "info" : "muted"}
                size="sm"
              >
                {entry.status === "champion" ? "Champion" : entry.status === "active" ? "Active" : "Out"}
              </Badge>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Participants View ────────────────────────────────────────────────────── */

function ParticipantsView({
  participants,
  currentAddress,
}: {
  participants: ParticipantEntry[];
  currentAddress: string | undefined;
}) {
  if (participants.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "var(--lc-space-12) var(--lc-space-6)",
          color: "var(--lc-text-tertiary)",
          fontSize: "var(--lc-text-small)",
        }}
      >
        No participants registered yet.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "var(--lc-space-3)",
      }}
    >
      {participants.map((p) => {
        const isCurrentUser = currentAddress?.toLowerCase() === p.address.toLowerCase();
        return (
          <div
            key={p.address}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--lc-space-3)",
              padding: "var(--lc-space-3) var(--lc-space-4)",
              backgroundColor: isCurrentUser ? "var(--lc-select)" : "var(--lc-bg-raised)",
              border: `1px solid ${isCurrentUser ? "var(--lc-select-border)" : "var(--lc-border)"}`,
              borderRadius: "var(--lc-radius-sm)",
              minHeight: 44,
            }}
          >
            {/* Seed badge */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--lc-radius-circle)",
                backgroundColor: "var(--lc-bg-overlay)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "var(--lc-text-caption)",
                fontWeight: "var(--lc-weight-semibold)" as any,
                color: "var(--lc-text-tertiary)",
                flexShrink: 0,
              }}
            >
              {p.seed ?? "-"}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: "var(--lc-text-small)",
                  fontWeight: "var(--lc-weight-medium)" as any,
                  color: isCurrentUser ? "var(--lc-select-text)" : "var(--lc-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.display_name || truncateAddress(p.address)}
                {isCurrentUser && (
                  <span style={{ marginLeft: 6, fontSize: "var(--lc-text-caption)", opacity: 0.7 }}>(you)</span>
                )}
              </div>
              {p.display_name && (
                <div
                  style={{
                    fontSize: "var(--lc-text-caption)",
                    fontFamily: "var(--lc-font-mono)",
                    color: "var(--lc-text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncateAddress(p.address)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────────────── */

function BracketPageShell({ competitionId }: { competitionId: string }) {
  return (
    <>
      <Link
        href={`/competitions/${competitionId}`}
        style={{
          fontSize: "var(--lc-text-small)",
          color: "var(--lc-text-tertiary)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginBottom: "var(--lc-space-2)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M8.5 3L4.5 7L8.5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to competition
      </Link>
      <Skeleton variant="text" width="260px" height="28px" />
    </>
  );
}

function BracketSkeleton() {
  return (
    <div style={{ display: "flex", gap: 28, overflow: "hidden" }}>
      {[0, 1, 2].map((round) => (
        <div key={round} style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
          <Skeleton variant="text" width="80px" height="14px" />
          {Array.from({ length: Math.max(1, 4 >> round) }, (_, i) => (
            <Skeleton key={i} variant="card" width="220px" height="110px" />
          ))}
        </div>
      ))}
    </div>
  );
}
