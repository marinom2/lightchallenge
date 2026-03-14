/**
 * webapp/app/embed/[competitionId]/page.tsx
 *
 * Embeddable Competition Widget — a standalone, compact page designed to
 * be rendered inside an iframe on partner sites.
 *
 * Features:
 *  - Fetches competition data from /api/v1/competitions/{competitionId}
 *  - Shows title, status badge, participant count
 *  - For bracket-type competitions: mini bracket view (horizontal scroll)
 *  - For league-type competitions: standings table
 *  - For other types: participant list / countdown
 *  - Supports ?theme=light|dark query param
 *  - Posts height to parent via postMessage for auto-resize
 *  - "Powered by LightChallenge" footer link
 *
 * All styles are inline to ensure the widget works without the main
 * design system CSS.
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";

/* ── Theme palettes ────────────────────────────────────────────────────────── */

const DARK = {
  bg: "#0a0a0a",
  surface: "#141414",
  surfaceHover: "#1a1a1a",
  border: "#262626",
  text: "#fafafa",
  textSecondary: "#a1a1a1",
  textMuted: "#666666",
  accent: "#6B5CFF",
  accentSoft: "rgba(107,92,255,0.12)",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
};

const LIGHT = {
  bg: "#ffffff",
  surface: "#f5f5f5",
  surfaceHover: "#ebebeb",
  border: "#e5e5e5",
  text: "#0a0a0a",
  textSecondary: "#525252",
  textMuted: "#a3a3a3",
  accent: "#6B5CFF",
  accentSoft: "rgba(107,92,255,0.08)",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
};

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Competition = {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  status: string;
  category?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  org_id?: string | null;
  settings?: Record<string, unknown> | null;
};

type Registration = {
  id: string;
  wallet?: string | null;
  team_id?: string | null;
  seed?: number | null;
  checked_in: boolean;
};

type BracketMatch = {
  id: string;
  round: number;
  match_number: number;
  bracket_type: string;
  participant_a?: string | null;
  participant_b?: string | null;
  score_a?: number | null;
  score_b?: number | null;
  winner?: string | null;
  status: string;
};

type Standing = {
  wallet: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  competitions_entered: number;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "TBD";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function statusColor(status: string, palette: typeof DARK): string {
  switch (status) {
    case "active":
    case "in_progress":
      return palette.success;
    case "registration":
    case "draft":
      return palette.warning;
    case "completed":
    case "finalized":
      return palette.accent;
    case "canceled":
      return palette.error;
    default:
      return palette.textMuted;
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "--";
  }
}

/* ── Page Component ────────────────────────────────────────────────────────── */

export default function EmbedCompetitionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const competitionId = params.competitionId as string;
  const themeParam = searchParams.get("theme");

  const palette = themeParam === "light" ? LIGHT : DARK;

  const [comp, setComp] = useState<Competition | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Auto-resize via postMessage ──────────────────────────────────────── */

  const postHeight = useCallback(() => {
    if (containerRef.current) {
      const height = containerRef.current.scrollHeight;
      try {
        window.parent.postMessage(
          { type: "lc-embed-resize", competitionId, height },
          "*"
        );
      } catch {
        /* cross-origin safety */
      }
    }
  }, [competitionId]);

  useEffect(() => {
    const observer = new ResizeObserver(() => postHeight());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [postHeight]);

  /* ── Data fetching ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!competitionId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Fetch competition
        const compRes = await fetch(
          `/api/v1/competitions?limit=1&offset=0`
        );

        // We need a single-competition endpoint. Since the list API
        // does not support id filter, fetch all and match, OR build
        // a direct query. For now, use inline fetch that the embed
        // API route handles.
        const compDirectRes = await fetch(
          `/api/embed/competition?id=${encodeURIComponent(competitionId)}`
        );

        if (!compDirectRes.ok) {
          throw new Error("Competition not found");
        }
        const compData = await compDirectRes.json();
        if (cancelled) return;

        if (!compData.ok || !compData.competition) {
          throw new Error("Competition not found");
        }

        const competition = compData.competition as Competition;
        setComp(competition);

        // Fetch registrations for participant count
        if (compData.registrations) {
          setRegistrations(compData.registrations);
        }

        // Fetch bracket matches if bracket type
        if (
          competition.type === "bracket" &&
          compData.matches
        ) {
          setMatches(compData.matches);
        }

        // Fetch standings if league type
        if (
          (competition.type === "league" || competition.type === "circuit") &&
          compData.standings
        ) {
          setStandings(compData.standings);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [competitionId]);

  /* ── Post height after data loads ─────────────────────────────────────── */

  useEffect(() => {
    // Small delay to ensure DOM has painted
    const timer = setTimeout(postHeight, 100);
    return () => clearTimeout(timer);
  }, [comp, matches, standings, loading, postHeight]);

  /* ── Styles ───────────────────────────────────────────────────────────── */

  const cardStyle: React.CSSProperties = {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 12,
    padding: 20,
    maxWidth: 600,
    margin: "0 auto",
    color: palette.text,
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    textTransform: "capitalize" as const,
    color,
    background: `${color}18`,
  });

  const dotStyle = (color: string): React.CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: color,
  });

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div
        ref={containerRef}
        style={{ padding: 16, background: palette.bg, minHeight: 120 }}
      >
        <div style={cardStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                height: 20,
                width: "60%",
                borderRadius: 6,
                background: palette.border,
                animation: "lc-shimmer 1.5s ease-in-out infinite",
              }}
            />
            <div
              style={{
                height: 14,
                width: "40%",
                borderRadius: 6,
                background: palette.border,
                animation: "lc-shimmer 1.5s ease-in-out infinite",
                animationDelay: "0.2s",
              }}
            />
            <div
              style={{
                height: 80,
                borderRadius: 8,
                background: palette.border,
                animation: "lc-shimmer 1.5s ease-in-out infinite",
                animationDelay: "0.4s",
              }}
            />
          </div>
          <style>{`
            @keyframes lc-shimmer {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.8; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (error || !comp) {
    return (
      <div
        ref={containerRef}
        style={{ padding: 16, background: palette.bg, minHeight: 80 }}
      >
        <div style={{ ...cardStyle, textAlign: "center" as const }}>
          <p style={{ color: palette.textMuted, margin: 0, fontSize: 14 }}>
            {error || "Competition not found"}
          </p>
        </div>
      </div>
    );
  }

  const sColor = statusColor(comp.status, palette);
  const participantCount = registrations.length;

  return (
    <div
      ref={containerRef}
      style={{ padding: 16, background: palette.bg }}
    >
      <div style={cardStyle}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1.3,
                color: palette.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {comp.title}
            </h2>
            {comp.description && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: palette.textSecondary,
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {comp.description}
              </p>
            )}
          </div>

          <span style={badgeStyle(sColor)}>
            <span style={dotStyle(sColor)} />
            {comp.status}
          </span>
        </div>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 16,
            fontSize: 12,
            color: palette.textSecondary,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {participantCount} participant{participantCount !== 1 ? "s" : ""}
          </span>

          {comp.type && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                textTransform: "capitalize",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {comp.type}
            </span>
          )}

          {comp.category && (
            <span style={{ textTransform: "capitalize" }}>{comp.category}</span>
          )}

          {comp.starts_at && (
            <span>
              {formatDate(comp.starts_at)}
              {comp.ends_at ? ` - ${formatDate(comp.ends_at)}` : ""}
            </span>
          )}
        </div>

        {/* Bracket view */}
        {comp.type === "bracket" && matches.length > 0 && (
          <BracketMiniView matches={matches} palette={palette} />
        )}

        {/* League / standings view */}
        {(comp.type === "league" || comp.type === "circuit") &&
          standings.length > 0 && (
            <StandingsTable standings={standings} palette={palette} />
          )}

        {/* Generic participant list for other types */}
        {comp.type !== "bracket" &&
          comp.type !== "league" &&
          comp.type !== "circuit" &&
          registrations.length > 0 && (
            <ParticipantList
              registrations={registrations}
              palette={palette}
            />
          )}

        {/* Empty state */}
        {registrations.length === 0 &&
          matches.length === 0 &&
          standings.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "20px 0",
                color: palette.textMuted,
                fontSize: 13,
              }}
            >
              No participants yet
            </div>
          )}

        {/* Footer */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: `1px solid ${palette.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <a
            href={`https://uat.lightchallenge.app/competition/${comp.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: palette.textMuted,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = palette.accent)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = palette.textMuted)
            }
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Powered by LightChallenge
          </a>

          <a
            href={`https://uat.lightchallenge.app/competition/${comp.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: palette.accent,
              textDecoration: "none",
              padding: "4px 10px",
              borderRadius: 6,
              background: palette.accentSoft,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            View Full
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Bracket Mini View ─────────────────────────────────────────────────────── */

function BracketMiniView({
  matches,
  palette,
}: {
  matches: BracketMatch[];
  palette: typeof DARK;
}) {
  // Group by round
  const rounds = new Map<number, BracketMatch[]>();
  for (const m of matches) {
    if (m.bracket_type !== "winners") continue;
    const arr = rounds.get(m.round) ?? [];
    arr.push(m);
    rounds.set(m.round, arr);
  }

  const sortedRounds = [...rounds.entries()].sort((a, b) => a[0] - b[0]);
  const maxRounds = sortedRounds.length;

  function roundLabel(round: number, total: number): string {
    if (round === total) return "Final";
    if (round === total - 1) return "Semis";
    if (round === total - 2) return "Quarters";
    return `Round ${round}`;
  }

  return (
    <div
      style={{
        overflowX: "auto",
        marginBottom: 4,
        paddingBottom: 4,
      }}
    >
      <div style={{ display: "flex", gap: 12, minWidth: "fit-content" }}>
        {sortedRounds.map(([round, roundMatches]) => (
          <div key={round} style={{ minWidth: 140 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: palette.textMuted,
                marginBottom: 8,
              }}
            >
              {roundLabel(round, maxRounds)}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                justifyContent: "center",
                minHeight: 60,
              }}
            >
              {roundMatches
                .sort((a, b) => a.match_number - b.match_number)
                .map((m) => (
                  <MatchCard key={m.id} match={m} palette={palette} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCard({
  match: m,
  palette,
}: {
  match: BracketMatch;
  palette: typeof DARK;
}) {
  const isComplete = m.status === "completed";
  const aIsWinner = isComplete && m.winner === m.participant_a;
  const bIsWinner = isComplete && m.winner === m.participant_b;

  const participantRow = (
    name: string | null | undefined,
    score: number | null | undefined,
    isWinner: boolean
  ): React.CSSProperties => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "3px 6px",
    fontSize: 11,
    fontWeight: isWinner ? 700 : 400,
    color: isWinner ? palette.text : palette.textSecondary,
    background: isWinner ? palette.accentSoft : "transparent",
    borderRadius: 3,
  });

  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div style={participantRow(m.participant_a, m.score_a, aIsWinner)}>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 90,
          }}
        >
          {shortAddr(m.participant_a)}
        </span>
        {m.score_a != null && (
          <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 8 }}>
            {m.score_a}
          </span>
        )}
      </div>
      <div
        style={{
          height: 1,
          background: palette.border,
        }}
      />
      <div style={participantRow(m.participant_b, m.score_b, bIsWinner)}>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 90,
          }}
        >
          {shortAddr(m.participant_b)}
        </span>
        {m.score_b != null && (
          <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 8 }}>
            {m.score_b}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Standings Table ───────────────────────────────────────────────────────── */

function StandingsTable({
  standings,
  palette,
}: {
  standings: Standing[];
  palette: typeof DARK;
}) {
  const thStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: palette.textMuted,
    padding: "6px 8px",
    textAlign: "left",
    borderBottom: `1px solid ${palette.border}`,
  };

  const tdStyle: React.CSSProperties = {
    fontSize: 12,
    padding: "6px 8px",
    color: palette.textSecondary,
    borderBottom: `1px solid ${palette.border}`,
  };

  // Show top 10
  const top = standings.slice(0, 10);

  return (
    <div style={{ overflowX: "auto", marginBottom: 4 }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 32, textAlign: "center" }}>#</th>
            <th style={thStyle}>Player</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Pts</th>
            <th style={{ ...thStyle, textAlign: "right" }}>W</th>
            <th style={{ ...thStyle, textAlign: "right" }}>L</th>
            <th style={{ ...thStyle, textAlign: "right" }}>D</th>
          </tr>
        </thead>
        <tbody>
          {top.map((s, i) => (
            <tr
              key={s.wallet}
              style={{
                background:
                  i === 0
                    ? palette.accentSoft
                    : i % 2 === 0
                      ? "transparent"
                      : `${palette.surface}80`,
              }}
            >
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: palette.text }}>
                {i + 1}
              </td>
              <td style={{ ...tdStyle, color: palette.text, fontWeight: 500 }}>
                {shortAddr(s.wallet)}
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: palette.accent }}>
                {s.points}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{s.wins}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{s.losses}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{s.draws}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {standings.length > 10 && (
        <div
          style={{
            fontSize: 11,
            color: palette.textMuted,
            textAlign: "center",
            padding: "8px 0 0",
          }}
        >
          +{standings.length - 10} more
        </div>
      )}
    </div>
  );
}

/* ── Participant List (fallback) ───────────────────────────────────────────── */

function ParticipantList({
  registrations,
  palette,
}: {
  registrations: Registration[];
  palette: typeof DARK;
}) {
  const shown = registrations.slice(0, 12);

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: palette.textMuted,
          marginBottom: 8,
        }}
      >
        Participants
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {shown.map((r) => (
          <span
            key={r.id}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              background: palette.bg,
              border: `1px solid ${palette.border}`,
              color: palette.textSecondary,
              fontFamily: "monospace",
            }}
          >
            {shortAddr(r.wallet)}
          </span>
        ))}
        {registrations.length > 12 && (
          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              color: palette.textMuted,
            }}
          >
            +{registrations.length - 12} more
          </span>
        )}
      </div>
    </div>
  );
}
