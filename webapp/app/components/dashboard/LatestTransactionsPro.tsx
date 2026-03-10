// webapp/app/components/LatestTransactionsPro.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  http,
  decodeFunctionData,
  type Abi,
  type Address,
  formatEther,
} from "viem";
import { lightchain, RPC_URL } from "@/lib/lightchain";
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer";

type TxRow = {
  hash: `0x${string}`;
  from: Address;
  to?: Address;
  method?: string;
  status: "Success" | "Failed" | "Pending";
  blockNumber?: bigint;
  timestamp?: number;
  fee?: string; // human LCAI
};

export default function LatestTransactionsPro({
  watchAddresses,
  abi,
  limit = 10,
}: {
  watchAddresses: Address[];
  abi: Abi;
  limit?: number;
}) {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const watchSet = useMemo(
    () => new Set(watchAddresses.map((a) => a.toLowerCase())),
    [watchAddresses]
  );

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setError(null);
        const client = createPublicClient({ chain: lightchain, transport: http(RPC_URL) });
        const head = await client.getBlockNumber();
        const span = 140n; // ~ a few minutes worth of blocks on testnet
        const from = head > span ? head - span : 0n;

        const blocks = await Promise.all(
          Array.from({ length: Number(head - from + 1n) }).map((_, i) =>
            client.getBlock({
              blockNumber: from + BigInt(i),
              includeTransactions: true,
            })
          )
        );

        const picked: TxRow[] = [];
        outer: for (const b of blocks.reverse()) {
          for (const raw of (b.transactions ?? []) as any[]) {
            const to = raw.to as Address | undefined;
            const fromAddr = (raw.from || "") as Address;

            const touches =
              (to && watchSet.has(to.toLowerCase())) || watchSet.has(fromAddr.toLowerCase());
            if (!touches) continue;

            let method: string | undefined;
            try {
              if (raw.input && raw.input !== "0x") {
                const dec = decodeFunctionData({
                  abi,
                  data: raw.input as `0x${string}`,
                });
                method = dec.functionName;
              }
            } catch {
              /* ignore non-matching ABIs */
            }

            let status: TxRow["status"] = "Pending";
            let fee: string | undefined;
            try {
              const rcp = await client.getTransactionReceipt({ hash: raw.hash });
              status = rcp.status === "success" ? "Success" : "Failed";
              const wei = (rcp.gasUsed ?? 0n) * (rcp.effectiveGasPrice ?? 0n);
              fee = formatEther(wei);
            } catch {
              /* pending or no receipt yet */
            }

            picked.push({
              hash: raw.hash,
              from: fromAddr,
              to,
              method,
              status,
              blockNumber: b.number,
              timestamp: Number(b.timestamp),
              fee,
            });

            if (picked.length >= limit) break outer;
          }
        }

        if (!stop) setRows(picked);
      } catch (e: any) {
        if (!stop) setError(e?.message || "Failed to load recent transactions.");
      }
    })();

    return () => {
      stop = true;
    };
  }, [watchSet, limit, abi]);

  if (error) return <div className="chip chip--bad">{error}</div>;
  if (rows.length === 0)
    return <div className="text-[color:var(--text-muted)] text-sm">No recent transactions.</div>;

  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.hash} className="list-row">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`chip ${
                r.status === "Success" ? "chip--ok" : r.status === "Failed" ? "chip--bad" : ""
              }`}
            >
              {r.status}
            </span>
            <a className="link mono truncate" href={txUrl(r.hash)} target="_blank" rel="noreferrer">
              {r.hash.slice(0, 10)}…
            </a>
            {r.method && <span className="text-xs text-[color:var(--text-muted)]">{r.method}</span>}
          </div>

          <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
            {r.blockNumber !== undefined ? (
              <a className="link" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                #{r.blockNumber.toString()}
              </a>
            ) : (
              <span>#—</span>
            )}
            <span>•</span>
            <span>{r.timestamp ? timeAgo(r.timestamp * 1000) : "—"}</span>
            <span className="truncate">
              <a className="link" href={addressUrl(r.from)} target="_blank" rel="noreferrer">
                {short(r.from)}
              </a>
              {r.to && (
                <>
                  {" "}
                  →{" "}
                  <a className="link" href={addressUrl(r.to)} target="_blank" rel="noreferrer">
                    {short(r.to)}
                  </a>
                </>
              )}
            </span>
            {r.fee && <span className="kbd">{Number(r.fee).toFixed(6)} LCAI</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function timeAgo(ms: number) {
  const sec = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}