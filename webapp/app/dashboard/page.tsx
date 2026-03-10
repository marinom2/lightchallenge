// webapp/app/dashboard/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Abi, Address } from "viem";
import { isAddress, formatEther } from "viem";
import { useChainId } from "wagmi";

import { ADDR, ABI, publicClient } from "@/lib/contracts";
import { addressUrl, blockUrl, txUrl } from "@/lib/explorer";
import {
  fetchCreatedWindow,
  fetchMoreCreated,
  type ChallengeCreatedEvt,
} from "@/lib/events";
import LatestTransactionsPro from "@/app/components/dashboard/LatestTransactionsPro";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────────
   Types & constants
   ─────────────────────────────────────────────────────────────────────────── */
type Status =
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Finalized"
  | "Canceled"
  | "Paused";

type Row = {
  id: string;
  creator?: Address;
  blockNumber: string;
  txHash: `0x${string}`;
  status: Status;
};

const DEFAULT_SPAN = 10_000n;

const STATUS_MAP: Status[] = [
  "Pending",   // 0
  "Approved",  // 1
  "Rejected",  // 2
  "Finalized", // 3
  "Canceled",  // 4
  "Paused",    // 5
];

/* ────────────────────────────────────────────────────────────────────────────
   Small utils
   ─────────────────────────────────────────────────────────────────────────── */
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

function statusChipClass(s: Status) {
  switch (s) {
    case "Approved":
      return "chip chip--ok";
    case "Rejected":
      return "chip chip--bad";
    case "Finalized":
      return "chip chip--info";
    case "Canceled":
      return "chip chip--warn";
    case "Paused":
      return "chip";
    default:
      return "chip"; // Pending
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Status resolver — multicalls getChallenge(id) and maps numeric -> label
   ─────────────────────────────────────────────────────────────────────────── */
async function getStatuses(ids: bigint[]): Promise<Record<string, Status>> {
  if (ids.length === 0) return {};
  const calls = ids.map((cid) => ({
    address: ADDR.ChallengePay!,
    abi: ABI.ChallengePay as Abi,
    functionName: "getChallenge" as const,
    args: [cid] as const,
  }));
  const out: Record<string, Status> = {};
  try {
    const mc = await publicClient.multicall({ contracts: calls });
    mc.forEach((r, i) => {
      const key = ids[i].toString();
      if (r.status === "success" && Array.isArray(r.result)) {
        const numeric = Number((r.result as any)[2] ?? 0);
        out[key] = STATUS_MAP[numeric] ?? "Pending";
      } else {
        out[key] = "Pending";
      }
    });
  } catch {
    ids.forEach((id) => (out[id.toString()] = "Pending"));
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
   KPI fetcher (typed)
   ─────────────────────────────────────────────────────────────────────────── */
type Kpis = {
  totalChallenges: string;
  totalValidatorStake: string;
  treasury: Address | null;
  treasuryBalance: string | null;
};

async function loadKpis(): Promise<Kpis> {
  const cp = ADDR.ChallengePay!;
  const abi = ABI.ChallengePay as Abi;

  const nextId = (await publicClient
    .readContract({ address: cp, abi, functionName: "nextChallengeId" })
    .catch(() => 0n)) as bigint;

  const totalStake = (await publicClient
    .readContract({ address: cp, abi, functionName: "totalValidatorStake" })
    .catch(() => 0n)) as bigint;

  let treasury: Address | null = null;
  try {
    const tre = (await publicClient.readContract({
      address: cp,
      abi,
      functionName: "treasury",
    })) as unknown;
    treasury = typeof tre === "string" && isAddress(tre) ? (tre as Address) : null;
  } catch {
    treasury = null;
  }

  let treBal: string | null = null;
  if (treasury) {
    try {
      const bal = await publicClient.getBalance({ address: treasury });
      treBal = `${formatEther(bal)} LCAI`;
    } catch {
      treBal = null;
    }
  }

  return {
    totalChallenges: (nextId > 0n ? nextId - 1n : 0n).toString(),
    totalValidatorStake: `${formatEther(totalStake)} LCAI`,
    treasury,
    treasuryBalance: treBal,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Inner page (uses useSearchParams) — under Suspense
   ─────────────────────────────────────────────────────────────────────────── */
function DashboardInner() {
  const chainId = useChainId();
  const router = useRouter();
  const search = useSearchParams();

  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState<{ fromBlock: bigint; toBlock: bigint } | null>(null);
  const [span, setSpan] = useState<string>(DEFAULT_SPAN.toString());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [blockAges, setBlockAges] = useState<Record<string, number>>({});

  const [kpi, setKpi] = useState<{
    totalChallenges?: string;
    totalValidatorStake?: string;
    treasury?: Address | null;
    treasuryBalance?: string | null;
  }>({});
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiErr, setKpiErr] = useState<string | null>(null);

  const statusFilter = (search.get("status") || "").toLowerCase();

  async function loadInitial() {
    setLoading(true);
    setErr(null);
    try {
      const head = await publicClient.getBlockNumber();
      const s = BigInt(span);
      const from = head >= (s - 1n) ? head - (s - 1n) : 0n;
      const to = head;

      const { items, fromBlock, toBlock } = await fetchCreatedWindow(from, to);
      const ids = items.map((i) => i.id);
      const statuses = await getStatuses(ids);

      const mapped: Row[] = items
        .slice()
        .reverse()
        .map((it: ChallengeCreatedEvt) => ({
          id: it.id.toString(),
          creator: it.creator,
          blockNumber: it.blockNumber.toString(),
          txHash: it.txHash,
          status: statuses[it.id.toString()] ?? "Pending",
        }));

      setRows(mapped);
      setRange({ fromBlock, toBlock });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onLoadOlder() {
    if (!range) return;
    setLoading(true);
    setErr(null);
    try {
      const s = BigInt(span);
      const nextFrom = range.fromBlock > s ? range.fromBlock - s : 0n;
      const nextTo = range.fromBlock > 0n ? range.fromBlock - 1n : 0n;

      const { items, fromBlock } = await fetchMoreCreated({ fromBlock: nextFrom, toBlock: nextTo });
      const ids = items.map((i) => i.id);
      const statuses = await getStatuses(ids);

      const more: Row[] = items
        .slice()
        .reverse()
        .map((it: ChallengeCreatedEvt) => ({
          id: it.id.toString(),
          creator: it.creator,
          blockNumber: it.blockNumber.toString(),
          txHash: it.txHash,
          status: statuses[it.id.toString()] ?? "Pending",
        }));

      setRows((prev) => [...prev, ...more]);
      setRange((prev) => (prev ? { fromBlock, toBlock: prev.toBlock } : { fromBlock, toBlock: nextTo }));
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [span, chainId]);

  useEffect(() => {
    let stop = false;
    (async () => {
      const uniques = Array.from(new Set(rows.map((r) => r.blockNumber))).filter((b) => !blockAges[b]);
      if (!uniques.length) return;
      try {
        const res = await fetch("/api/blocks?ids=" + uniques.join(","));
        if (!res.ok) return;
        const j = (await res.json()) as Record<string, number>;
        if (!stop) setBlockAges((prev) => ({ ...prev, ...j }));
      } catch {}
    })();
    return () => { stop = true; };
  }, [rows, blockAges]);

  useEffect(() => {
    let stop = false;
    (async () => {
      setKpiLoading(true);
      setKpiErr(null);
      try {
        const k = await loadKpis();
        if (!stop) setKpi(k);
      } catch (e: any) {
        if (!stop) setKpiErr(e?.message || String(e));
      } finally {
        if (!stop) setKpiLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [chainId]);

  function setStatusFilter(s?: Status) {
    const p = new URLSearchParams(search.toString());
    if (s) p.set("status", s.toLowerCase());
    else p.delete("status");
    const q = p.toString();
    const url = q ? `/dashboard?${q}` : "/dashboard";
    router.replace(url);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (statusFilter) out = out.filter((r) => r.status.toLowerCase() === statusFilter);
    if (!q) return out;
    return out.filter((r) => {
      const idMatch = r.id.includes(q);
      const creatorMatch = (r.creator?.toLowerCase() || "").includes(q);
      return idMatch || creatorMatch;
    });
  }, [rows, query, statusFilter]);

  const counts = useMemo(() => {
    const base: Record<Status, number> = {
      Pending: 0, Approved: 0, Rejected: 0, Finalized: 0, Canceled: 0, Paused: 0,
    };
    for (const r of rows) base[r.status] += 1;
    return base;
  }, [rows]);

  /* UI */
  return (
    <div className="container-narrow mx-auto py-8 space-y-8">
      {/* Hero */}
      <div className="panel relative overflow-hidden">
        <div className="panel-body">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="text-sm text-[color:var(--text-muted)]">LightChallenge</div>
              <h1 className="h1 h-gradient">Dashboard</h1>
              <div className="text-xs text-[color:var(--text-muted)] mt-1">
                ChainId: {chainId ?? "…"}
              </div>
            </div>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.25,
            background:
              "radial-gradient(1200px 600px at 120% -20%, color-mix(in oklab, var(--grad-2) 35%, transparent), transparent 55%)",
          }}
        />
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total Challenges"
          value={kpiLoading ? "…" : kpi.totalChallenges ?? "—"}
          onClick={() => setStatusFilter(undefined)}
        />
        <Kpi
          label="Finalized (in view)"
          value={`${counts.Finalized}`}
          onClick={() => setStatusFilter("Finalized")}
        />
        <Kpi
          label="Validator Stake"
          value={kpiLoading ? "…" : kpi.totalValidatorStake ?? "—"}
        />
        <Kpi
          label="Treasury"
          value={kpiLoading ? "…" : kpi.treasuryBalance ?? "—"}
          sub={kpi.treasury ? `${kpi.treasury.slice(0,6)}…${kpi.treasury.slice(-4)}` : ""}
          href={kpi.treasury ? addressUrl(kpi.treasury) : undefined}
        />
      </div>
      {kpiErr && <div className="text-sm text-[color:var(--text-muted)]">Metrics error: {kpiErr}</div>}

      {/* Latest Tx + search */}
      <div className="panel">
        <div className="panel-header">
          <div className="font-semibold text-lg">Latest Transactions</div>
        </div>
        <div className="panel-body">
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 ">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="m21 20.29-5.64-5.64a7 7 0 1 0-1.41 1.41L20.29 21zM5 11a6 6 0 1 1 6 6a6 6 0 0 1-6-6"
                />
              </svg>
            </span>
            <input
              className="input pl-8"
              placeholder="Search by challenge ID or creator (0x…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <LatestTransactionsPro
            watchAddresses={[ADDR.ChallengePay, ADDR.Treasury].filter(Boolean) as Address[]}
            abi={ABI.ChallengePay as Abi}
            limit={12}
          />
        </div>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {(["Pending","Approved","Rejected","Finalized","Canceled","Paused"] as Status[]).map((s) => (
          <button
            key={s}
            className={`${statusChipClass(s)} hover:brightness-110`}
            onClick={() => setStatusFilter(s)}
            title={`Show only ${s.toLowerCase()} challenges`}
          >
            {s} · {counts[s]}
          </button>
        ))}
        <button
          className="chip"
          onClick={() => setStatusFilter(undefined)}
          title="Clear filter"
        >
          Clear filter
        </button>
      </div>

      {/* Challenges table */}
      <div className="panel">
        <div className="panel-header">
          <div className="font-semibold text-lg">Challenges (newest first)</div>
          <div className="text-xs text-[color:var(--text-muted)]">
            {range ? (
              <>Blocks {range.fromBlock.toString()} → {range.toBlock.toString()}</>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div className="panel-body">
          {err && <div className="chip chip--bad mb-3">Metrics: {err}</div>}

          {filtered.length === 0 ? (
            <div className="text-[color:var(--text-muted)] text-sm">
              No challenges in the scanned window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Creator</th>
                    <th>Block</th>
                    <th>Age</th>
                    <th>Tx</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const ts = blockAges[r.blockNumber];
                    const age = ts ? timeAgo(ts * 1000) : "—";
                    return (
                      <tr key={`${r.txHash}-${r.id}`}>
                        <td>
                          <a className="link" href={`/challenge/${r.id}`}>#{r.id}</a>
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
                            {r.blockNumber}
                          </a>
                        </td>
                        <td>{age}</td>
                        <td>
                          <a className="link" href={txUrl(r.txHash)} target="_blank" rel="noreferrer">
                            {r.txHash.slice(0, 12)}…
                          </a>
                        </td>
                        <td>
                          <a
                            className={`${statusChipClass(r.status)} underline-offset-2 hover:underline`}
                            href={`/dashboard?status=${r.status.toLowerCase()}`}
                            title={`Show ${r.status.toLowerCase()} only`}
                          >
                            {r.status}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-3">
                <button className="btn btn-primary" disabled={loading} onClick={onLoadOlder}>
                  {loading ? "Loading…" : "Load older"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Span selector */}
      <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
        <span>Window:</span>
        <select
          className="input max-w-[180px]"
          value={span}
          onChange={(e) => setSpan(e.target.value)}
        >
          <option value="5000">5,000 blocks</option>
          <option value="10000">10,000 blocks</option>
          <option value="25000">25,000 blocks</option>
        </select>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Default export with Suspense boundary
   ──────────────────────────────────────────────────────────────────────────── */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="container-narrow mx-auto py-8 text-[color:var(--text-muted)]">
          Loading dashboard…
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   UI bits
   ──────────────────────────────────────────────────────────────────────────── */
function Kpi({
  label,
  value,
  sub,
  href,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  onClick?: () => void;
}) {
  const Body = (
    <div className={`metric ${onClick ? "cursor-pointer" : ""}`} onClick={onClick}>
      <div>
        <div className="text-sm text-[color:var(--text-muted)]">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {!!sub && <div className="text-[11px] text-[color:var(--text-muted)] mt-0.5">{sub}</div>}
      </div>
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {Body}
    </a>
  ) : (
    Body
  );
}