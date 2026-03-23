"use client";

/**
 * BracketViewer — Visual bracket tree for single-elimination,
 * double-elimination, and grand final tournament formats.
 *
 * Renders matches as a horizontal tree flowing left-to-right, with
 * CSS-border connector lines between rounds. Supports highlighting
 * a specific participant's path through the bracket.
 *
 * For double-elimination: winners bracket on top, losers bracket below,
 * grand final on the far right. On mobile, tabs switch between sections;
 * on desktop, all sections are shown with horizontal scroll.
 */

import React, { useState, useMemo } from "react";
import { type BracketMatch } from "@/lib/useLiveBracket";
import MatchCard from "./MatchCard";

export type BracketViewerProps = {
  matches: BracketMatch[];
  onMatchClick?: (matchId: string) => void;
  highlightParticipant?: string;
  compact?: boolean;
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */

type BracketType = "winners" | "losers" | "grand_final";

function groupByBracketAndRound(matches: BracketMatch[]) {
  const groups: Record<BracketType, Map<number, BracketMatch[]>> = {
    winners: new Map(),
    losers: new Map(),
    grand_final: new Map(),
  };

  for (const m of matches) {
    const bt = (m.bracket_type as BracketType) || "winners";
    if (!groups[bt]) continue;
    const roundMap = groups[bt];
    if (!roundMap.has(m.round)) {
      roundMap.set(m.round, []);
    }
    roundMap.get(m.round)!.push(m);
  }

  // Sort matches within each round by match_number
  for (const bt of Object.keys(groups) as BracketType[]) {
    for (const [round, roundMatches] of groups[bt]) {
      groups[bt].set(
        round,
        roundMatches.sort((a, b) => a.match_number - b.match_number)
      );
    }
  }

  return groups;
}

function getSortedRounds(roundMap: Map<number, BracketMatch[]>): number[] {
  return Array.from(roundMap.keys()).sort((a, b) => a - b);
}

function getHighlightSide(
  match: BracketMatch,
  participant: string | undefined
): "a" | "b" | null {
  if (!participant) return null;
  if (match.participant_a === participant) return "a";
  if (match.participant_b === participant) return "b";
  return null;
}

function isParticipantInMatch(
  match: BracketMatch,
  participant: string | undefined
): boolean {
  if (!participant) return false;
  return match.participant_a === participant || match.participant_b === participant;
}

/* ── Connector Lines ──────────────────────────────────────────────────────── */

/**
 * Renders the connector lines between two rounds using CSS borders.
 * For N matches feeding into N/2 matches, each pair of adjacent matches
 * connects with an "L" shape merging into a single horizontal line.
 */
function RoundConnectors({
  matchCount,
  matchHeight,
  gap,
  compact,
}: {
  matchCount: number;
  matchHeight: number;
  gap: number;
  compact: boolean;
}) {
  const connectorWidth = compact ? 20 : 28;
  const pairCount = Math.ceil(matchCount / 2);
  const cellHeight = matchHeight + gap;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: connectorWidth,
        flexShrink: 0,
        position: "relative",
      }}
    >
      {Array.from({ length: pairCount }, (_, pairIdx) => {
        const topIdx = pairIdx * 2;
        const bottomIdx = topIdx + 1;
        const hasBottom = bottomIdx < matchCount;

        if (!hasBottom) {
          // Single match — straight horizontal line
          return (
            <div
              key={pairIdx}
              style={{
                position: "absolute",
                top: topIdx * cellHeight + matchHeight / 2,
                left: 0,
                width: connectorWidth,
                height: 1,
                backgroundColor: "var(--lc-border-strong)",
              }}
            />
          );
        }

        // Pair of matches — vertical bracket connector
        const topCenter = topIdx * cellHeight + matchHeight / 2;
        const bottomCenter = bottomIdx * cellHeight + matchHeight / 2;
        const midY = (topCenter + bottomCenter) / 2;

        return (
          <React.Fragment key={pairIdx}>
            {/* Horizontal from top match */}
            <div
              style={{
                position: "absolute",
                top: topCenter,
                left: 0,
                width: connectorWidth / 2,
                height: 1,
                backgroundColor: "var(--lc-border-strong)",
              }}
            />
            {/* Vertical connecting line */}
            <div
              style={{
                position: "absolute",
                top: topCenter,
                left: connectorWidth / 2 - 0.5,
                width: 1,
                height: bottomCenter - topCenter,
                backgroundColor: "var(--lc-border-strong)",
              }}
            />
            {/* Horizontal from bottom match */}
            <div
              style={{
                position: "absolute",
                top: bottomCenter,
                left: 0,
                width: connectorWidth / 2,
                height: 1,
                backgroundColor: "var(--lc-border-strong)",
              }}
            />
            {/* Horizontal to next round */}
            <div
              style={{
                position: "absolute",
                top: midY,
                left: connectorWidth / 2 - 0.5,
                width: connectorWidth / 2 + 0.5,
                height: 1,
                backgroundColor: "var(--lc-border-strong)",
              }}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Round Column ─────────────────────────────────────────────────────────── */

function RoundColumn({
  round,
  matches,
  totalRounds,
  onMatchClick,
  highlightParticipant,
  compact,
}: {
  round: number;
  matches: BracketMatch[];
  totalRounds: number;
  onMatchClick?: (id: string) => void;
  highlightParticipant?: string;
  compact: boolean;
}) {
  const roundLabel =
    round === totalRounds
      ? "Final"
      : round === totalRounds - 1
        ? "Semifinal"
        : `Round ${round}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: "var(--lc-text-caption)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: "var(--lc-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: compact ? 8 : 12,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        {roundLabel}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-around",
          gap: compact ? 8 : 12,
          flex: 1,
        }}
      >
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            onClick={onMatchClick ? () => onMatchClick(m.id) : undefined}
            highlight={getHighlightSide(m, highlightParticipant)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

/* ── BracketSection (one bracket type: winners/losers/grand_final) ────── */

function BracketSection({
  label,
  roundMap,
  onMatchClick,
  highlightParticipant,
  compact,
}: {
  label: string;
  roundMap: Map<number, BracketMatch[]>;
  onMatchClick?: (id: string) => void;
  highlightParticipant?: string;
  compact: boolean;
}) {
  const rounds = getSortedRounds(roundMap);
  if (rounds.length === 0) return null;

  const totalRounds = rounds.length;
  const matchCardHeight = compact ? 100 : 120;
  const matchGap = compact ? 8 : 12;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 16 }}>
      <h3
        style={{
          fontSize: "var(--lc-text-small)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: "var(--lc-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          margin: 0,
        }}
      >
        {label}
      </h3>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          overflowX: "auto",
          paddingBottom: 8,
          scrollbarWidth: "thin",
        }}
      >
        {rounds.map((round, roundIdx) => {
          const roundMatches = roundMap.get(round) || [];
          const nextRound = roundIdx < rounds.length - 1 ? rounds[roundIdx + 1] : null;
          const nextRoundMatches = nextRound ? (roundMap.get(nextRound) || []) : [];
          const showConnector =
            roundIdx < rounds.length - 1 &&
            roundMatches.length > 1 &&
            nextRoundMatches.length < roundMatches.length;

          return (
            <React.Fragment key={round}>
              <RoundColumn
                round={round}
                matches={roundMatches}
                totalRounds={totalRounds}
                onMatchClick={onMatchClick}
                highlightParticipant={highlightParticipant}
                compact={compact}
              />
              {showConnector && (
                <RoundConnectors
                  matchCount={roundMatches.length}
                  matchHeight={matchCardHeight}
                  gap={matchGap}
                  compact={compact}
                />
              )}
              {!showConnector && roundIdx < rounds.length - 1 && (
                <div style={{ width: compact ? 20 : 28, flexShrink: 0 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ── Mobile Tabs ──────────────────────────────────────────────────────────── */

const BRACKET_TABS: { id: BracketType; label: string }[] = [
  { id: "winners", label: "Winners" },
  { id: "losers", label: "Losers" },
  { id: "grand_final", label: "Grand Final" },
];

/* ── Main Component ───────────────────────────────────────────────────────── */

export default function BracketViewer({
  matches,
  onMatchClick,
  highlightParticipant,
  compact = false,
}: BracketViewerProps) {
  const [mobileTab, setMobileTab] = useState<BracketType>("winners");

  const groups = useMemo(() => groupByBracketAndRound(matches), [matches]);

  const hasLosers = groups.losers.size > 0;
  const hasGrandFinal = groups.grand_final.size > 0;
  const isDoubleElim = hasLosers || hasGrandFinal;

  // Available tabs (only for sections that have matches)
  const availableTabs = useMemo(() => {
    const tabs: { id: BracketType; label: string }[] = [];
    if (groups.winners.size > 0) tabs.push(BRACKET_TABS[0]);
    if (groups.losers.size > 0) tabs.push(BRACKET_TABS[1]);
    if (groups.grand_final.size > 0) tabs.push(BRACKET_TABS[2]);
    return tabs;
  }, [groups]);

  // Highlight stats
  const highlightedMatchCount = highlightParticipant
    ? matches.filter((m) => isParticipantInMatch(m, highlightParticipant)).length
    : 0;

  if (matches.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "var(--lc-space-12) var(--lc-space-6)",
          color: "var(--lc-text-tertiary)",
          fontSize: "var(--lc-text-small)",
        }}
      >
        No bracket data available yet.
      </div>
    );
  }

  // Single-elimination: just show winners bracket
  if (!isDoubleElim) {
    return (
      <div style={{ position: "relative" }}>
        {highlightParticipant && highlightedMatchCount > 0 && (
          <HighlightBanner participant={highlightParticipant} matchCount={highlightedMatchCount} />
        )}
        <BracketSection
          label="Bracket"
          roundMap={groups.winners}
          onMatchClick={onMatchClick}
          highlightParticipant={highlightParticipant}
          compact={compact}
        />
      </div>
    );
  }

  // Double-elimination
  return (
    <div style={{ position: "relative" }}>
      {highlightParticipant && highlightedMatchCount > 0 && (
        <HighlightBanner participant={highlightParticipant} matchCount={highlightedMatchCount} />
      )}

      {/* Mobile: tab switcher */}
      <div
        className="lc-bracket-mobile-tabs"
        style={{
          display: "none",
          gap: "var(--lc-space-1)",
          marginBottom: "var(--lc-space-4)",
        }}
      >
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "var(--lc-radius-pill)",
              fontSize: "var(--lc-text-small)",
              fontWeight: tab.id === mobileTab ? ("var(--lc-weight-semibold)" as any) : ("var(--lc-weight-normal)" as any),
              color: tab.id === mobileTab ? "var(--lc-select-text)" : "var(--lc-text-secondary)",
              backgroundColor: tab.id === mobileTab ? "var(--lc-select)" : "transparent",
              border: tab.id === mobileTab ? "1px solid var(--lc-select-border)" : "1px solid var(--lc-border)",
              cursor: "pointer",
              transition: "all var(--lc-dur-base) var(--lc-ease)",
              minHeight: 44,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mobile: show selected bracket only */}
      <div className="lc-bracket-mobile-content" style={{ display: "none" }}>
        <BracketSection
          label={availableTabs.find((t) => t.id === mobileTab)?.label || "Bracket"}
          roundMap={groups[mobileTab]}
          onMatchClick={onMatchClick}
          highlightParticipant={highlightParticipant}
          compact={compact}
        />
      </div>

      {/* Desktop: full bracket view */}
      <div
        className="lc-bracket-desktop"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: compact ? 24 : 40,
        }}
      >
        {groups.winners.size > 0 && (
          <BracketSection
            label="Winners Bracket"
            roundMap={groups.winners}
            onMatchClick={onMatchClick}
            highlightParticipant={highlightParticipant}
            compact={compact}
          />
        )}
        {groups.losers.size > 0 && (
          <BracketSection
            label="Losers Bracket"
            roundMap={groups.losers}
            onMatchClick={onMatchClick}
            highlightParticipant={highlightParticipant}
            compact={compact}
          />
        )}
        {groups.grand_final.size > 0 && (
          <BracketSection
            label="Grand Final"
            roundMap={groups.grand_final}
            onMatchClick={onMatchClick}
            highlightParticipant={highlightParticipant}
            compact={compact}
          />
        )}
      </div>

      {/* Responsive breakpoint styles */}
      <style>{`
        @media (max-width: 768px) {
          .lc-bracket-mobile-tabs { display: flex !important; }
          .lc-bracket-mobile-content { display: block !important; }
          .lc-bracket-desktop { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Highlight Banner ─────────────────────────────────────────────────────── */

function HighlightBanner({
  participant,
  matchCount,
}: {
  participant: string;
  matchCount: number;
}) {
  const truncated =
    participant.length > 14
      ? `${participant.slice(0, 6)}...${participant.slice(-4)}`
      : participant;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        marginBottom: 16,
        borderRadius: "var(--lc-radius-sm)",
        backgroundColor: "var(--lc-select)",
        border: "1px solid var(--lc-select-border)",
        fontSize: "var(--lc-text-small)",
        color: "var(--lc-select-text)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="7" r="2" fill="currentColor" />
      </svg>
      <span>
        Tracking <strong style={{ fontFamily: "var(--lc-font-mono)" }}>{truncated}</strong>
        {" "}across {matchCount} match{matchCount !== 1 ? "es" : ""}
      </span>
    </div>
  );
}
