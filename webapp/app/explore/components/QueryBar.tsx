"use client";

import * as React from "react";

export type SortKey = "newest" | "oldest" | "startingSoon";

export default function QueryBar({
  status, onStatusChange,
  span, onSpanChange,
  sort, onSortChange,
  view, onViewChange,
  loading, loadingMore,
  onRefresh, onLoadOlder, disabledLoadOlder,
  rangeLabel,
}: {
  status: "ALL" | "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused";
  onStatusChange: (s: any) => void;
  span: bigint;
  onSpanChange: (s: bigint) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  view: "grid" | "table";
  onViewChange: (v: "grid" | "table") => void;
  loading: boolean;
  loadingMore: boolean;
  onRefresh: () => void;
  onLoadOlder?: () => void;
  disabledLoadOlder?: boolean;
  rangeLabel?: string;
}) {
  return (
    <div className="card p-3 space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status */}
          <select
            className="input w-44"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as any)}
            title="Filter by status"
          >
            <option value="ALL">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Finalized">Finalized</option>
            <option value="Canceled">Canceled</option>
            <option value="Paused">Paused</option>
          </select>

          {/* Span */}
          <select
            className="input w-40"
            value={span.toString()}
            onChange={(e) => onSpanChange(BigInt(e.target.value))}
            title="Blocks to scan per request"
          >
            <option value="2000">2,000 blocks</option>
            <option value="5000">5,000 blocks</option>
            <option value="10000">10,000 blocks</option>
            <option value="20000">20,000 blocks</option>
            <option value="25000">25,000 blocks</option>
          </select>

          {/* Sort */}
          <select
            className="input w-40"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            title="Sort"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="startingSoon">Starting soon</option>
          </select>

          {/* View */}
          <div className="segmented">
            <button className={`segmented__btn ${view === "grid" ? "is-active" : ""}`} onClick={() => onViewChange("grid")} aria-pressed={view==="grid"}>Grid</button>
            <button className={`segmented__btn ${view === "table" ? "is-active" : ""}`} onClick={() => onViewChange("table")} aria-pressed={view==="table"}>Table</button>
          </div>

          {/* Actions */}
          <button className={`btn ${loadingMore ? "btn-primary loading" : "btn-ghost"}`} onClick={onLoadOlder} disabled={loadingMore || !onLoadOlder || disabledLoadOlder} title="Load older window">
            {loadingMore ? "Loading…" : "Load older"}
          </button>
          <button className={`btn ${loading ? "btn-primary loading" : "btn-ghost"}`} onClick={onRefresh} disabled={loading} title="Refresh current window">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="flex-1" />
        {rangeLabel && <div className="text-[color:var(--text-muted)] text-sm">{rangeLabel}</div>}
      </div>
    </div>
  );
}