"use client";

/**
 * Badge — Semantic status and category indicator.
 *
 * Variants:
 *   status:   Active (green), Finalized (blue), Canceled (gray)
 *   category: Gaming, Fitness, Custom, etc.
 *   urgency:  safe (green), soon (yellow), imminent (red), ended (gray)
 *   tone:     accent, success, warning, danger, info, muted
 */

import React from "react";

export type BadgeVariant = "status" | "category" | "urgency" | "tone";

type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
  /** For status variant: Active | Finalized | Canceled */
  status?: "Active" | "Finalized" | "Canceled";
  /** For urgency variant: safe | soon | imminent | ended */
  urgency?: "safe" | "soon" | "imminent" | "ended";
  /** For tone variant: accent | success | warning | danger | info | muted */
  tone?: "accent" | "success" | "warning" | "danger" | "info" | "muted";
  /** Show a colored dot before the text */
  dot?: boolean;
  /** Size */
  size?: "sm" | "md";
  className?: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Active:    { bg: "var(--lc-success-muted)", text: "var(--lc-success)",       dot: "var(--lc-success)" },
  Finalized: { bg: "var(--lc-info-muted)",    text: "var(--lc-info)",          dot: "var(--lc-info)" },
  Canceled:  { bg: "transparent",             text: "var(--lc-text-muted)",    dot: "var(--lc-text-muted)" },
};

const URGENCY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  safe:      { bg: "var(--lc-success-muted)", text: "var(--lc-success)",       dot: "var(--lc-success)" },
  soon:      { bg: "var(--lc-warning-muted)", text: "var(--lc-warning)",       dot: "var(--lc-warning)" },
  imminent:  { bg: "var(--lc-danger-muted)",  text: "var(--lc-danger)",        dot: "var(--lc-danger)" },
  ended:     { bg: "transparent",             text: "var(--lc-text-muted)",    dot: "var(--lc-text-muted)" },
};

const TONE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  accent:  { bg: "var(--lc-accent-muted)", text: "var(--lc-accent)",       dot: "var(--lc-accent)" },
  success: { bg: "var(--lc-success-muted)", text: "var(--lc-success)",     dot: "var(--lc-success)" },
  warning: { bg: "var(--lc-warning-muted)", text: "var(--lc-warning)",     dot: "var(--lc-warning)" },
  danger:  { bg: "var(--lc-danger-muted)",  text: "var(--lc-danger)",      dot: "var(--lc-danger)" },
  info:    { bg: "var(--lc-info-muted)",    text: "var(--lc-info)",        dot: "var(--lc-info)" },
  muted:   { bg: "transparent",             text: "var(--lc-text-muted)",  dot: "var(--lc-text-muted)" },
};

export default function Badge({
  children,
  variant = "tone",
  status,
  urgency,
  tone = "muted",
  dot = false,
  size = "sm",
  className = "",
}: BadgeProps) {
  let colors = TONE_COLORS[tone] || TONE_COLORS.muted;

  if (variant === "status" && status) {
    colors = STATUS_COLORS[status] || STATUS_COLORS.Active;
  } else if (variant === "urgency" && urgency) {
    colors = URGENCY_COLORS[urgency] || URGENCY_COLORS.ended;
  } else if (variant === "category") {
    colors = TONE_COLORS.accent;
  }

  const fontSize = size === "sm" ? "var(--lc-text-caption)" : "var(--lc-text-small)";
  const padding = size === "sm" ? "2px 8px" : "4px 12px";

  return (
    <span
      className={`lc-badge ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding,
        borderRadius: "var(--lc-radius-pill)",
        fontSize,
        fontWeight: "var(--lc-weight-medium)" as any,
        lineHeight: "var(--lc-leading-tight)" as any,
        color: colors.text,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.bg === "transparent" ? "var(--lc-border)" : "transparent"}`,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: colors.dot,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
