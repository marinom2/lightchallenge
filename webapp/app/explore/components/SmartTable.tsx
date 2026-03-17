// app/explore/components/SmartTable.tsx
"use client";

import * as React from "react";
import type { Address } from "viem";
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer";
import { formatWeiAsUSD } from "@/lib/tokenPrice";
import { useTokenPrice } from "@/lib/useTokenPrice";
import type { Status } from "@/lib/types/status";
type Row = {
  id: bigint;
  creator?: Address;
  blockNumber: bigint;
  txHash: `0x${string}`;
  status: Status;
  badges?: Record<string, unknown>;
  category: "all" | "gaming" | "fitness" | "social" | "custom";
  title?: string;
  description?: string;
  startTs?: bigint;
  game?: string | null;
  mode?: string | null;
  // optional extras if you want to wire them later
  stakeWei?: string | null;
  poolCommittedWei?: string | null;
};

const statusClass = (s: Status) => (
  s === "Active" ? "chip chip--ok" :
  s === "Finalized" ? "chip chip--info" :
  s === "Canceled" ? "chip chip--warn" : "chip"
);

export default function SmartTable({
  rows,
  isFav,
  onToggleFav,
  loading,
  onLoadOlder,
}: {
  rows: Row[];
  isFav: (id: string) => boolean;
  onToggleFav: (id: string) => void;
  loading?: boolean;
  onLoadOlder?: () => void;
}) {
  const tokenPrice = useTokenPrice();
  const fmtUSD = (wei?: string | null) => wei ? formatWeiAsUSD(wei, tokenPrice) : "\u2014";

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="font-semibold">Recent Challenges (newest first)</div>
      </div>
      <div className="panel-body">
        {loading && <div className="text-(--text-muted) text-sm">Loading…</div>}
        {!loading && rows.length === 0 && <div className="empty">No challenges in the scanned range.</div>}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table table--compact" style={{ borderSpacing: 0, minWidth: 1120 }}>
              <thead className="sticky top-0 z-10" style={{ background: "color-mix(in oklab, var(--card) 88%, #000 12%)", backdropFilter: "blur(6px)" }}>
                <tr>
                  <th className="w-[64px]">ID</th>
                  <th className="max-w-[260px]">Title</th>
                  <th className="w-[180px]">Game / Mode</th>
                  <th>Creator</th>
                  <th className="w-[120px]">Block</th>
                  <th className="w-[140px]">Tx</th>
                  <th className="w-[120px]">Status</th>
                  <th className="min-w-[210px]">Badges / Tier</th>
                  <th className="w-[140px] text-right">Stake / Pool</th>
                  <th className="w-[64px] text-center">Fav</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const idStr = r.id.toString();
                  const b = r.badges || {};
                  return (
                    <tr key={`${r.txHash}-${idStr}`} className="align-middle">
                      <td><a className="link" href={`/challenge/${idStr}`}>#{idStr}</a></td>
                      <td className="truncate">{r.title || "—"}</td>
                      <td className="truncate">
                        <div className="flex gap-1 items-center">
                          <span className="chip">{r.game || "—"}</span>
                          {r.mode && <span className="chip chip--info">{r.mode}</span>}
                        </div>
                      </td>
                      <td>
                        {r.creator ? (
                          <a className="link" href={addressUrl(r.creator)} target="_blank" rel="noreferrer">
                            {r.creator.slice(0, 6)}…{r.creator.slice(-4)}
                          </a>
                        ) : "—"}
                      </td>
                      <td>
                        <a className="link" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                          {r.blockNumber.toString()}
                        </a>
                      </td>
                      <td>
                        <a className="link mono" href={txUrl(r.txHash)} target="_blank" rel="noreferrer">
                          {r.txHash.slice(0, 12)}…
                        </a>
                      </td>
                      <td><span className={statusClass(r.status)}>{r.status}</span></td>
                      <td>
                        <div className="flex gap-2">
                          <span className="chip">{r.category}</span>
                        </div>
                      </td>
                      <td className="text-right mono">
                        <span>{fmtUSD(r.stakeWei)} / {fmtUSD(r.poolCommittedWei)}</span>
                      </td>
                      <td className="text-center">
                        <button
                          className={`icon-btn star ${isFav(idStr) ? "is-fav" : ""}`}
                          onClick={() => onToggleFav(idStr)}
                          title="Favorite"
                          aria-pressed={isFav(idStr)}
                        >
                          ★
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {onLoadOlder && (
              <div className="mt-3">
                <button className="btn btn-primary" onClick={onLoadOlder}>Load older</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}