"use client";

/**
 * ChallengeCard — Unified challenge card for explore grid, homepage, my-challenges.
 *
 * Shows: category pill, status badge, title, pool amount, participant count,
 * deadline countdown, and a contextual CTA.
 */

import React from "react";
import Badge from "./Badge";
import Countdown from "./Countdown";

export type ChallengeCardData = {
  id: number | string;
  title: string;
  /** Category label (e.g. "Gaming", "Fitness", "Custom"). */
  category?: string;
  /** On-chain status. */
  status: "Active" | "Finalized" | "Canceled";
  /** Total pool amount (formatted string, e.g. "5.0"). */
  pool?: string;
  /** Currency/token symbol. */
  poolUnit?: string;
  /** Number of participants. */
  participants?: number;
  /** Deadline as ISO string, Date, or unix timestamp (seconds). */
  deadline?: string | Date | number;
  /** User-specific state for CTA label. */
  userState?: "none" | "joined" | "evidence-submitted" | "verifying" | "claimable" | "claimed";
};

type ChallengeCardProps = {
  challenge: ChallengeCardData;
  /** Click handler — typically router.push. */
  onClick?: (id: number | string) => void;
  className?: string;
};

const CTA_LABELS: Record<string, string> = {
  none: "Join Challenge",
  joined: "Submit Evidence",
  "evidence-submitted": "Verifying\u2026",
  verifying: "Awaiting Finalization",
  claimable: "Claim Reward",
  claimed: "Reward Claimed",
};

export default function ChallengeCard({ challenge, onClick, className = "" }: ChallengeCardProps) {
  const { id, title, category, status, pool, poolUnit = "LCAI", participants, deadline, userState } = challenge;
  const ctaLabel = userState ? CTA_LABELS[userState] || "View" : "View";
  const isEnded = status !== "Active";

  return (
    <div
      className={`lc-challenge-card ${className}`}
      role="article"
      tabIndex={0}
      onClick={() => onClick?.(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(id);
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--lc-space-3)",
        padding: "var(--lc-space-5)",
        backgroundColor: "var(--lc-bg-raised)",
        border: "1px solid var(--lc-border)",
        borderRadius: "var(--lc-radius-lg)",
        cursor: onClick ? "pointer" : "default",
        transition: `border-color var(--lc-dur-base) var(--lc-ease), box-shadow var(--lc-dur-base) var(--lc-ease)`,
      }}
    >
      {/* Top row: category + status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {category && (
          <Badge variant="category" size="sm">
            {category}
          </Badge>
        )}
        <Badge variant="status" status={status} dot size="sm">
          {status}
        </Badge>
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: "var(--lc-text-body)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: "var(--lc-text)",
          lineHeight: "var(--lc-leading-tight)" as any,
          margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as any,
          overflow: "hidden",
          minHeight: "2.6em",
        }}
      >
        {title}
      </h3>

      {/* Metrics row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--lc-space-2)",
          fontSize: "var(--lc-text-small)",
          color: "var(--lc-text-secondary)",
        }}
      >
        {pool != null && (
          <span>
            <strong style={{ color: "var(--lc-text)", fontWeight: "var(--lc-weight-semibold)" as any }}>{pool}</strong>{" "}
            {poolUnit} pool
          </span>
        )}
        {pool != null && participants != null && <span style={{ opacity: 0.4 }}>&middot;</span>}
        {participants != null && (
          <span>
            <strong style={{ color: "var(--lc-text)", fontWeight: "var(--lc-weight-semibold)" as any }}>
              {participants}
            </strong>{" "}
            joined
          </span>
        )}
      </div>

      {/* Deadline */}
      {deadline && !isEnded && <Countdown deadline={deadline} size="sm" />}
      {isEnded && (
        <Badge variant="urgency" urgency="ended" dot size="sm">
          Ended
        </Badge>
      )}

      {/* CTA */}
      {onClick && (
        <button
          style={{
            marginTop: "auto",
            padding: "8px 0",
            width: "100%",
            fontSize: "var(--lc-text-small)",
            fontWeight: "var(--lc-weight-medium)" as any,
            color:
              userState === "claimable"
                ? "var(--lc-accent-text)"
                : userState === "claimed"
                  ? "var(--lc-success)"
                  : "var(--lc-accent)",
            backgroundColor:
              userState === "claimable" ? "var(--lc-accent)" : "transparent",
            border:
              userState === "claimable" || userState === "claimed"
                ? "none"
                : "1px solid var(--lc-border)",
            borderRadius: "var(--lc-radius-md)",
            cursor: userState === "claimed" || userState === "evidence-submitted" ? "default" : "pointer",
            opacity: userState === "evidence-submitted" ? 0.6 : 1,
            transition: `all var(--lc-dur-base) var(--lc-ease)`,
          }}
          tabIndex={-1}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
