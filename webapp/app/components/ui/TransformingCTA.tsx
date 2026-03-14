"use client";

/**
 * TransformingCTA — State-aware primary action button.
 *
 * Adapts label, color, and interactivity based on the user's challenge lifecycle state.
 *
 * States:
 *   connect       → "Connect Wallet to Join"   (accent outline)
 *   join          → "Join Challenge"            (accent filled)
 *   submit        → "Submit Evidence"           (accent filled)
 *   verifying     → "Verifying…"               (muted, disabled, spinner)
 *   awaiting      → "Awaiting Finalization"     (muted, disabled)
 *   claim         → "Claim Reward"              (success filled, celebration)
 *   claimed       → "Reward Claimed"            (success outline, check)
 */

import React from "react";

export type CTAState = "connect" | "join" | "submit" | "verifying" | "awaiting" | "claim" | "claimed";

type TransformingCTAProps = {
  state: CTAState;
  onClick?: () => void;
  /** Optional secondary text below the button (e.g. "Stake: 0.5 LCAI"). */
  subtitle?: string;
  /** Full width. */
  fullWidth?: boolean;
  className?: string;
};

const STATE_CONFIG: Record<
  CTAState,
  { label: string; bg: string; color: string; border: string; disabled: boolean }
> = {
  connect: {
    label: "Connect Wallet to Join",
    bg: "transparent",
    color: "var(--lc-accent)",
    border: "1px solid var(--lc-accent)",
    disabled: false,
  },
  join: {
    label: "Join Challenge",
    bg: "var(--lc-accent)",
    color: "var(--lc-accent-text)",
    border: "none",
    disabled: false,
  },
  submit: {
    label: "Submit Evidence",
    bg: "var(--lc-accent)",
    color: "var(--lc-accent-text)",
    border: "none",
    disabled: false,
  },
  verifying: {
    label: "Verifying\u2026",
    bg: "var(--lc-bg-overlay)",
    color: "var(--lc-text-muted)",
    border: "1px solid var(--lc-border)",
    disabled: true,
  },
  awaiting: {
    label: "Awaiting Finalization",
    bg: "var(--lc-bg-overlay)",
    color: "var(--lc-text-muted)",
    border: "1px solid var(--lc-border)",
    disabled: true,
  },
  claim: {
    label: "Claim Reward",
    bg: "var(--lc-success)",
    color: "#ffffff",
    border: "none",
    disabled: false,
  },
  claimed: {
    label: "Reward Claimed \u2713",
    bg: "transparent",
    color: "var(--lc-success)",
    border: "1px solid var(--lc-success)",
    disabled: true,
  },
};

export default function TransformingCTA({
  state,
  onClick,
  subtitle,
  fullWidth = true,
  className = "",
}: TransformingCTAProps) {
  const config = STATE_CONFIG[state];

  return (
    <div
      className={`lc-cta ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--lc-space-2)",
        width: fullWidth ? "100%" : "auto",
      }}
    >
      <button
        onClick={config.disabled ? undefined : onClick}
        disabled={config.disabled}
        style={{
          width: fullWidth ? "100%" : "auto",
          padding: "14px 24px",
          fontSize: "var(--lc-text-body)",
          fontWeight: "var(--lc-weight-semibold)" as any,
          color: config.color,
          backgroundColor: config.bg,
          border: config.border,
          borderRadius: "var(--lc-radius-md)",
          cursor: config.disabled ? "not-allowed" : "pointer",
          opacity: config.disabled ? 0.7 : 1,
          transition: `all var(--lc-dur-base) var(--lc-ease)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {state === "verifying" && (
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              border: "2px solid var(--lc-text-muted)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              marginRight: 8,
              verticalAlign: "middle",
              animation: "lc-spin 0.8s linear infinite",
            }}
          />
        )}
        {config.label}
      </button>
      {subtitle && (
        <span
          style={{
            fontSize: "var(--lc-text-caption)",
            color: "var(--lc-text-muted)",
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}
