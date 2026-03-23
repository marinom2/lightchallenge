"use client";

/**
 * SwissStandings — Swiss tournament standings table.
 *
 * Displays participant rankings with W-L record, Buchholz score,
 * round progress, and optional advance-round action.
 */

import React from "react";

/* ── Types ─────────────────────────────────────────────────────────────────── */

type Standing = {
  participant: string;
  wins: number;
  losses: number;
  buchholz: number;
  opponents: string[];
};

export type SwissStandingsProps = {
  standings: Standing[];
  currentRound: number;
  totalRounds: number;
  highlightParticipant?: string;
  onAdvanceRound?: () => void;
  canAdvance?: boolean;
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function truncAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function sortStandings(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.buchholz - a.buchholz;
  });
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function SwissStandings({
  standings,
  currentRound,
  totalRounds,
  highlightParticipant,
  onAdvanceRound,
  canAdvance = false,
}: SwissStandingsProps) {
  const sorted = sortStandings(standings);

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerRow}>
        <h3 style={headingStyle}>Swiss Standings</h3>
        <div style={roundIndicator}>
          <span style={{ color: "var(--lc-text-secondary)", fontSize: "var(--lc-text-small)" }}>
            Round
          </span>
          <span style={{ color: "var(--lc-text)", fontWeight: 700, fontSize: "var(--lc-text-subhead)" }}>
            {currentRound}
          </span>
          <span style={{ color: "var(--lc-text-tertiary)", fontSize: "var(--lc-text-small)" }}>
            of {totalRounds}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={progressTrack}>
        <div
          style={{
            ...progressFill,
            width: `${(currentRound / totalRounds) * 100}%`,
          }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Rank</th>
              <th style={{ ...thStyle, textAlign: "left" }}>Participant</th>
              <th style={thStyle}>W-L</th>
              <th style={thStyle}>Buchholz</th>
              <th style={thStyle}>Points</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, index) => {
              const rank = index + 1;
              const isHighlighted =
                highlightParticipant &&
                entry.participant.toLowerCase() === highlightParticipant.toLowerCase();
              const points = entry.wins; // 1 point per win in Swiss

              return (
                <tr
                  key={entry.participant}
                  style={{
                    backgroundColor: isHighlighted ? "var(--lc-select)" : "transparent",
                    transition: "background-color var(--lc-dur-base) var(--lc-ease)",
                  }}
                >
                  {/* Rank */}
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                    {rank <= 3 ? (
                      <span style={{ color: rank === 1 ? "var(--lc-warm)" : rank === 2 ? "var(--lc-text-secondary)" : "var(--lc-warm-deep)" }}>
                        {rank}
                      </span>
                    ) : (
                      <span style={{ color: "var(--lc-text-tertiary)" }}>{rank}</span>
                    )}
                  </td>

                  {/* Participant */}
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <span
                      style={{
                        fontFamily: "var(--lc-font-mono)",
                        fontSize: "var(--lc-text-small)",
                        color: isHighlighted ? "var(--lc-select-text)" : "var(--lc-text)",
                        fontWeight: isHighlighted ? 600 : 400,
                      }}
                    >
                      {truncAddr(entry.participant)}
                    </span>
                    {isHighlighted && (
                      <span
                        style={{
                          marginLeft: "var(--lc-space-2)",
                          fontSize: "var(--lc-text-caption)",
                          color: "var(--lc-select-text)",
                          fontWeight: 500,
                        }}
                      >
                        You
                      </span>
                    )}
                  </td>

                  {/* W-L */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{ color: "var(--lc-success)", fontWeight: 600 }}>{entry.wins}</span>
                    <span style={{ color: "var(--lc-text-muted)", margin: "0 2px" }}>-</span>
                    <span style={{ color: "var(--lc-danger)", fontWeight: 600 }}>{entry.losses}</span>
                  </td>

                  {/* Buchholz */}
                  <td style={{ ...tdStyle, textAlign: "center", color: "var(--lc-text-secondary)" }}>
                    {entry.buchholz.toFixed(1)}
                  </td>

                  {/* Points */}
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: "var(--lc-text)" }}>
                    {points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Advance round button */}
      {canAdvance && onAdvanceRound && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--lc-space-4)" }}>
          <button onClick={onAdvanceRound} style={advanceBtn}>
            Advance to Round {currentRound + 1}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────────── */

const containerStyle: React.CSSProperties = {
  backgroundColor: "var(--lc-bg-raised)",
  border: "1px solid var(--lc-border)",
  borderRadius: "var(--lc-radius-md)",
  padding: "var(--lc-space-6)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--lc-space-4)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "var(--lc-space-3)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "var(--lc-text-subhead)",
  fontWeight: 600,
  color: "var(--lc-text)",
  margin: 0,
};

const roundIndicator: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--lc-space-1)",
};

const progressTrack: React.CSSProperties = {
  height: 4,
  borderRadius: 2,
  backgroundColor: "var(--lc-bg-inset)",
  overflow: "hidden",
};

const progressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 2,
  backgroundColor: "var(--lc-select-text)",
  transition: "width var(--lc-dur-slow) var(--lc-ease)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--lc-text-small)",
  minWidth: 480,
};

const thStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--lc-space-2) var(--lc-space-3)",
  color: "var(--lc-text-tertiary)",
  fontWeight: 500,
  fontSize: "var(--lc-text-caption)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--lc-border)",
};

const tdStyle: React.CSSProperties = {
  padding: "var(--lc-space-3)",
  borderBottom: "1px solid var(--lc-border)",
  verticalAlign: "middle",
};

const advanceBtn: React.CSSProperties = {
  padding: "var(--lc-space-2) var(--lc-space-5)",
  borderRadius: "var(--lc-radius-sm)",
  border: "none",
  backgroundColor: "var(--lc-accent)",
  color: "var(--lc-accent-text)",
  fontSize: "var(--lc-text-small)",
  fontWeight: 600,
  cursor: "pointer",
  minHeight: "var(--lc-touch-md)",
  transition: "all var(--lc-dur-base) var(--lc-ease)",
};
