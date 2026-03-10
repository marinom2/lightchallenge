"use client";

import * as React from "react";

type Status = "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";

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
            <div className="text-sm text-[color:var(--text-muted)]">LightChallenge</div>
            <h1 className="h1 h-gradient">Explore</h1>
            <div className="text-xs text-[color:var(--text-muted)] mt-1">
              ChainId: {chainId ?? "…"} {chainId !== 504 && "(switch to Lightchain 504)"}
            </div>
          </div>

          {/* Metrics */}
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-6 text-center">
            {(["Pending","Approved","Rejected","Finalized","Canceled","Paused"] as Status[]).map((s) => (
              <div key={s} className="metric">
                <div>
                  <div className="text-sm text-[color:var(--text-muted)]">{s}</div>
                  <div className="text-2xl font-bold mt-1">{tallies?.[s] ?? 0}</div>
                </div>
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