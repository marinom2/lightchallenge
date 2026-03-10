// webapp/app/components/LatestTransactions.tsx
"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import type { Address, Hex } from "viem";
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer";

type LiteTx = {
  hash: Hex;
  blockNumber: bigint;
  to?: Address | null;
  from?: Address;
  ok?: boolean;
  label?: string;
};

function shortAddr(a?: string | null) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function labelForTx(to?: Address | null, labels?: Record<string, string>) {
  if (!to) return "Contract creation";
  const key = to.toLowerCase();
  return labels?.[key] || "External";
}

export default function LatestTransactions({
  watchAddresses,
  labels,
  logSpan = 2_000n,
  limit = 8,
}: {
  watchAddresses: Address[];
  labels?: Record<string, string>;
  logSpan?: bigint;
  limit?: number;
}) {
  const client = usePublicClient();
  const [recentTxs, setRecentTxs] = useState<LiteTx[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || watchAddresses.length === 0) return;
    let stop = false;

    (async () => {
      try {
        setError(null);
        const head = await client.getBlockNumber();
        const from = head > logSpan ? head - logSpan : 0n;

        // Pull logs touching any of these addresses
        const logs = await client.getLogs({
          address: watchAddresses,
          fromBlock: from,
          toBlock: head,
        });

        // Deduplicate by tx hash, newest first
        const seen = new Set<string>();
        const items: LiteTx[] = [];
        for (const lg of [...logs].reverse()) {
          if (!lg.transactionHash) continue;
          const h = lg.transactionHash.toLowerCase();
          if (seen.has(h)) continue;
          seen.add(h);

          const rc = await client.getTransactionReceipt({ hash: lg.transactionHash });
          items.push({
            hash: rc.transactionHash,
            blockNumber: rc.blockNumber,
            to: rc.to as Address | null,
            from: rc.from as Address,
            ok: rc.status === "success",
            label: labelForTx(rc.to as Address | null, labels),
          });

          if (items.length >= limit) break;
        }

        if (!stop) setRecentTxs(items);
      } catch (e: any) {
        if (!stop) {
          setRecentTxs([]);
          setError(e?.message || "Failed to scan recent logs.");
        }
      }
    })();

    return () => {
      stop = true;
    };
  }, [client, watchAddresses, labels, logSpan, limit]);

  if (error) {
    return <div className="chip chip--bad">{error}</div>;
  }
  if (recentTxs.length === 0) {
    return <div className="text-[color:var(--text-muted)] text-sm">Scanning recent logs…</div>;
  }

  return (
    <div className="space-y-1">
      {recentTxs.map((t) => (
        <div key={t.hash} className="list-row">
          <div className="flex flex-col">
            <a className="link mono" href={txUrl(t.hash)} target="_blank" rel="noreferrer">
              {t.hash.slice(0, 12)}…
            </a>
            <div className="text-[color:var(--text-muted)] text-xs">
              {t.label} • Block{" "}
              <a
                className="link"
                href={blockUrl(t.blockNumber.toString())}
                target="_blank"
                rel="noreferrer"
              >
                {t.blockNumber.toString()}
              </a>
            </div>
          </div>

          <div className="text-xs text-[color:var(--text-muted)]">
            {t.from ? (
              <a className="link" href={addressUrl(t.from)} target="_blank" rel="noreferrer">
                {shortAddr(t.from)}
              </a>
            ) : (
              "—"
            )}
            {" → "}
            {t.to ? (
              <a className="link" href={addressUrl(t.to)} target="_blank" rel="noreferrer">
                {shortAddr(t.to)}
              </a>
            ) : (
              "—"
            )}
          </div>

          <span className={`chip ${t.ok ? "chip--ok" : "chip--bad"}`}>
            {t.ok ? "Success" : "Failed"}
          </span>
        </div>
      ))}
    </div>
  );
}