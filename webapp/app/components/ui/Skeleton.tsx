"use client";

/**
 * Skeleton — Shimmer loading placeholders.
 *
 * Matches the lc-shimmer keyframe from tokens.css.
 * Use for text lines, cards, stat boxes, and avatars.
 *
 * Variants:
 *   text   — Single line placeholder (default)
 *   card   — Rectangular card placeholder
 *   circle — Circular avatar/icon placeholder
 *   stat   — Compact stat box placeholder
 */

import React from "react";

type SkeletonVariant = "text" | "card" | "circle" | "stat";

type SkeletonProps = {
  variant?: SkeletonVariant;
  /** Width — CSS string. Defaults vary by variant. */
  width?: string;
  /** Height — CSS string. Defaults vary by variant. */
  height?: string;
  /** Number of repeated skeleton items (for text lines). */
  count?: number;
  className?: string;
};

const VARIANT_DEFAULTS: Record<SkeletonVariant, { width: string; height: string; radius: string }> = {
  text: { width: "100%", height: "14px", radius: "var(--lc-radius-sm)" },
  card: { width: "100%", height: "180px", radius: "var(--lc-radius-lg)" },
  circle: { width: "40px", height: "40px", radius: "50%" },
  stat: { width: "100px", height: "48px", radius: "var(--lc-radius-md)" },
};

function SkeletonItem({
  variant = "text",
  width,
  height,
  className = "",
}: Omit<SkeletonProps, "count">) {
  const defaults = VARIANT_DEFAULTS[variant!];
  return (
    <div
      className={`lc-skeleton ${className}`}
      aria-hidden
      style={{
        width: width || defaults.width,
        height: height || defaults.height,
        borderRadius: defaults.radius,
        background: `linear-gradient(
          90deg,
          var(--lc-bg-overlay) 25%,
          var(--lc-bg-raised) 50%,
          var(--lc-bg-overlay) 75%
        )`,
        backgroundSize: "200% 100%",
        animation: "lc-shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}

export default function Skeleton({
  variant = "text",
  width,
  height,
  count = 1,
  className = "",
}: SkeletonProps) {
  if (count <= 1) {
    return <SkeletonItem variant={variant} width={width} height={height} className={className} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-2)" }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonItem
          key={i}
          variant={variant}
          width={i === count - 1 && variant === "text" ? "60%" : width}
          height={height}
          className={className}
        />
      ))}
    </div>
  );
}

/** Preset: Challenge card skeleton matching ChallengeCard layout. */
export function ChallengeCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`lc-challenge-card lc-challenge-card--skeleton ${className}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--lc-space-3)",
        padding: "var(--lc-space-5)",
        backgroundColor: "var(--lc-bg-raised)",
        border: "1px solid var(--lc-border)",
        borderRadius: "var(--lc-radius-lg)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <SkeletonItem variant="text" width="60px" height="20px" />
        <SkeletonItem variant="text" width="70px" height="20px" />
      </div>
      <SkeletonItem variant="text" width="85%" height="18px" />
      <SkeletonItem variant="text" width="65%" height="14px" />
      <SkeletonItem variant="text" width="90px" height="22px" />
      <SkeletonItem variant="text" width="100%" height="36px" />
    </div>
  );
}
