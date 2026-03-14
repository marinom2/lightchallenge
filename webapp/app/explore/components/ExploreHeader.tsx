"use client";

import * as React from "react";
import type { Status } from "@/lib/types/status";

export default function ExploreHeader({
  chainId,
  tallies,
  controls,
}: {
  chainId?: number;
  tallies: Record<Status, number>;
  controls: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--lc-space-4)" }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--lc-space-4)", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "var(--lc-text-title)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)" }}>
            Explore
          </h1>
          <p style={{ fontSize: "var(--lc-text-small)", color: "var(--lc-text-secondary)", marginTop: "var(--lc-space-1)" }}>
            Discover and join challenges on Lightchain
            {chainId !== 504 && (
              <span
                style={{
                  marginLeft: "var(--lc-space-2)",
                  padding: "2px 8px",
                  borderRadius: "var(--lc-radius-pill)",
                  fontSize: "var(--lc-text-caption)",
                  backgroundColor: "var(--lc-warning-muted)",
                  color: "var(--lc-warning)",
                }}
              >
                Switch to Lightchain (504)
              </span>
            )}
          </p>
        </div>

        {/* Status tallies */}
        <div style={{ display: "flex", gap: "var(--lc-space-6)", flexShrink: 0 }}>
          {(["Active", "Finalized", "Canceled"] as Status[]).map((s) => (
            <div key={s} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "var(--lc-text-heading)", fontWeight: "var(--lc-weight-bold)" as any, color: "var(--lc-text)", fontVariantNumeric: "tabular-nums" }}>
                {tallies?.[s] ?? 0}
              </div>
              <div style={{ fontSize: "var(--lc-text-caption)", color: "var(--lc-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {s}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls slot */}
      {controls}
    </div>
  );
}
