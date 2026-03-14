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
    <div className="space-y-4">
      {/* Hero / title */}
      <div className="panel">
        <div className="panel-body flex items-center justify-between gap-3">
          <div>
            <h1 className="h1 h-gradient">Explore</h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Discover challenges — filtered by category in the sidebar.
              {chainId !== 504 && (
                <span className="ml-2 chip chip--warn text-xs">Switch to Lightchain (504)</span>
              )}
            </p>
          </div>

          {/* Status tallies — compact */}
          <div className="hidden sm:flex gap-3 shrink-0">
            {(["Active","Finalized","Canceled"] as Status[]).map((s) => (
              <div key={s} className="text-center">
                <div className="text-lg font-bold tabular-nums">{tallies?.[s] ?? 0}</div>
                <div className="text-[10px] uppercase tracking-widest text-(--text-muted)">{s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* divider line for subtle hierarchy */}
        <div
          aria-hidden
          className="h-px mx-3"
          style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklab, var(--border) 80%, transparent), transparent)" }}
        />
        <div className="p-3">{controls}</div>
      </div>
    </div>
  );
}