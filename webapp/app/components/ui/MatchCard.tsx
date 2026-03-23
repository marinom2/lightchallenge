"use client";

/**
 * MatchCard — Individual bracket match card.
 *
 * Shows two participant rows (A on top, B on bottom) with scores,
 * series info, and status indicators. Used inside BracketViewer
 * and also standalone on match detail pages.
 *
 * Follows Apple HIG: 44px minimum touch targets per row.
 */

import React from "react";
import { type BracketMatch } from "@/lib/useLiveBracket";

export type MatchCardProps = {
  match: BracketMatch;
  series?: { format: string; score_a: number; score_b: number; status: string } | null;
  onClick?: () => void;
  highlight?: "a" | "b" | null;
  compact?: boolean;
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function StatusIndicator({ status }: { status: string }) {
  if (status === "in_progress") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: "var(--lc-text-micro)",
          fontWeight: "var(--lc-weight-medium)" as any,
          color: "var(--lc-success)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: "var(--lc-success)",
            animation: "lc-pulse 1.5s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
        Live
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: "var(--lc-text-micro)",
          fontWeight: "var(--lc-weight-medium)" as any,
          color: "var(--lc-text-tertiary)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6L5 8.5L9.5 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Done
      </span>
    );
  }

  // pending or bye
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "var(--lc-text-micro)",
        fontWeight: "var(--lc-weight-medium)" as any,
        color: "var(--lc-text-muted)",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1" />
        <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
      {status === "bye" ? "Bye" : "Upcoming"}
    </span>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MatchCard({
  match,
  series,
  onClick,
  highlight,
  compact = false,
}: MatchCardProps) {
  const isCompleted = match.status === "completed";
  const isLive = match.status === "in_progress";
  const isPending = match.status === "pending";
  const isBye = match.status === "bye";

  const aIsWinner = isCompleted && match.winner === match.participant_a;
  const bIsWinner = isCompleted && match.winner === match.participant_b;

  const rowHeight = compact ? 36 : 44;

  function renderParticipantRow(
    participant: string | null,
    score: number | null,
    isWinner: boolean,
    isLoser: boolean,
    side: "a" | "b",
    position: "top" | "bottom"
  ) {
    const isHighlighted = highlight === side;
    const displayName = participant ? truncateAddress(participant) : "TBD";

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: rowHeight,
          padding: compact ? "0 8px" : "0 12px",
          backgroundColor: isWinner
            ? "rgba(246, 247, 255, 0.06)"
            : "transparent",
          borderTop: position === "bottom" ? "1px solid var(--lc-border)" : "none",
          borderRadius:
            position === "top"
              ? "var(--lc-radius-sm) var(--lc-radius-sm) 0 0"
              : "0 0 var(--lc-radius-sm) var(--lc-radius-sm)",
          opacity: isLoser ? 0.45 : 1,
          transition: "background-color var(--lc-dur-fast) var(--lc-ease)",
        }}
      >
        {/* Highlight bar */}
        {isHighlighted && (
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              backgroundColor: "var(--lc-select-text)",
              borderRadius: position === "top" ? "var(--lc-radius-sm) 0 0 0" : "0 0 0 var(--lc-radius-sm)",
            }}
          />
        )}

        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: compact ? "var(--lc-text-caption)" : "var(--lc-text-small)",
            fontWeight: isWinner ? ("var(--lc-weight-semibold)" as any) : ("var(--lc-weight-normal)" as any),
            color: !participant
              ? "var(--lc-text-muted)"
              : isWinner
                ? "var(--lc-accent)"
                : "var(--lc-text)",
            fontFamily: participant ? "var(--lc-font-mono)" : "var(--lc-font-sans)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {isWinner && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
              <path
                d="M1.5 5.5L4 8L8.5 2"
                stroke="var(--lc-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {displayName}
        </span>

        {score !== null && (
          <span
            style={{
              fontSize: compact ? "var(--lc-text-caption)" : "var(--lc-text-small)",
              fontWeight: "var(--lc-weight-semibold)" as any,
              color: isWinner ? "var(--lc-accent)" : "var(--lc-text-secondary)",
              fontVariantNumeric: "tabular-nums",
              marginLeft: 8,
              flexShrink: 0,
            }}
          >
            {score}
          </span>
        )}
      </div>
    );
  }

  const aIsLoser = isCompleted && !aIsWinner && match.participant_a !== null;
  const bIsLoser = isCompleted && !bIsWinner && match.participant_b !== null;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        position: "relative",
        backgroundColor: "var(--lc-bg-raised)",
        border: `1px solid ${
          isLive
            ? "var(--lc-success)"
            : isPending
              ? "var(--lc-border)"
              : "var(--lc-border)"
        }`,
        borderRadius: "var(--lc-radius-sm)",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color var(--lc-dur-base) var(--lc-ease), box-shadow var(--lc-dur-base) var(--lc-ease)",
        boxShadow: isLive
          ? "0 0 8px rgba(34, 197, 94, 0.15)"
          : "var(--lc-shadow-sm)",
        animation: isPending ? "lc-pulse 3s ease-in-out infinite" : "none",
        width: compact ? 180 : 220,
      }}
    >
      {/* Status + series header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: compact ? "3px 8px" : "4px 12px",
          borderBottom: "1px solid var(--lc-border)",
          backgroundColor: "var(--lc-bg-inset)",
        }}
      >
        <StatusIndicator status={match.status} />
        {series && (
          <span
            style={{
              fontSize: "var(--lc-text-micro)",
              color: "var(--lc-text-tertiary)",
              fontWeight: "var(--lc-weight-medium)" as any,
            }}
          >
            {series.format}: {series.score_a}-{series.score_b}
          </span>
        )}
      </div>

      {/* Participant rows */}
      {renderParticipantRow(match.participant_a, match.score_a, aIsWinner, aIsLoser, "a", "top")}
      {renderParticipantRow(match.participant_b, match.score_b, bIsWinner, bIsLoser, "b", "bottom")}
    </div>
  );
}
