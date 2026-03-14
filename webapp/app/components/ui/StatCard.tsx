"use client";

/**
 * StatCard — Key metric display with label.
 *
 * Used in challenge detail hero, homepage stats row, dashboard.
 *
 * Layouts:
 *   vertical (default): value on top, label below
 *   horizontal: icon + value + label in a row
 */

import React from "react";

type StatCardProps = {
  label: string;
  value: string | number;
  /** Optional unit after value (e.g. "LCAI", "%"). */
  unit?: string;
  /** Optional icon element. */
  icon?: React.ReactNode;
  layout?: "vertical" | "horizontal";
  size?: "sm" | "md" | "lg";
  className?: string;
};

export default function StatCard({
  label,
  value,
  unit,
  icon,
  layout = "vertical",
  size = "md",
  className = "",
}: StatCardProps) {
  const valueSizes = { sm: "var(--lc-text-subhead)", md: "var(--lc-text-heading)", lg: "var(--lc-text-title)" };
  const labelSizes = { sm: "var(--lc-text-caption)", md: "var(--lc-text-small)", lg: "var(--lc-text-body)" };

  if (layout === "horizontal") {
    return (
      <div
        className={`lc-stat ${className}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--lc-space-3)",
        }}
      >
        {icon && <span style={{ color: "var(--lc-text-muted)", flexShrink: 0 }}>{icon}</span>}
        <span style={{ fontSize: valueSizes[size], fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
          {value}
          {unit && <span style={{ fontSize: labelSizes[size], fontWeight: "var(--lc-weight-normal)" as any, marginLeft: 4, color: "var(--lc-text-secondary)" }}>{unit}</span>}
        </span>
        <span style={{ fontSize: labelSizes[size], color: "var(--lc-text-secondary)" }}>{label}</span>
      </div>
    );
  }

  return (
    <div
      className={`lc-stat ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--lc-space-1)",
        padding: "var(--lc-space-4)",
      }}
    >
      {icon && <span style={{ color: "var(--lc-text-muted)", marginBottom: "var(--lc-space-1)" }}>{icon}</span>}
      <span style={{ fontSize: valueSizes[size], fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)", lineHeight: "var(--lc-leading-tight)" as any }}>
        {value}
        {unit && <span style={{ fontSize: labelSizes[size], fontWeight: "var(--lc-weight-normal)" as any, marginLeft: 4, color: "var(--lc-text-secondary)" }}>{unit}</span>}
      </span>
      <span style={{ fontSize: labelSizes[size], color: "var(--lc-text-secondary)" }}>{label}</span>
    </div>
  );
}
