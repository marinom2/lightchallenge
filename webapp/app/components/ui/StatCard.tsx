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
      <div className={`lc-stat row-3 ${className}`}>
        {icon && <span className="color-muted shrink-0">{icon}</span>}
        <span className="font-bold" style={{ fontSize: valueSizes[size], color: "var(--lc-text)" }}>
          {value}
          {unit && <span className="font-normal color-secondary" style={{ fontSize: labelSizes[size], marginLeft: 4 }}>{unit}</span>}
        </span>
        <span className="color-secondary" style={{ fontSize: labelSizes[size] }}>{label}</span>
      </div>
    );
  }

  return (
    <div className={`lc-stat flex-col items-center p-4 ${className}`} style={{ display: "flex", gap: "var(--lc-space-1)" }}>
      {icon && <span className="color-muted mb-1">{icon}</span>}
      <span className="font-bold leading-tight" style={{ fontSize: valueSizes[size], color: "var(--lc-text)" }}>
        {value}
        {unit && <span className="font-normal color-secondary" style={{ fontSize: labelSizes[size], marginLeft: 4 }}>{unit}</span>}
      </span>
      <span className="color-secondary" style={{ fontSize: labelSizes[size] }}>{label}</span>
    </div>
  );
}
