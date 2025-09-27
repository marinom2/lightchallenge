// app/dashboard/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useChainId } from "wagmi"
import type { Abi, Address } from "viem"
import { ADDR, ABI } from "@/lib/contracts"
import {
  fetchCreatedWindow,
  fetchMoreCreated,
  type ChallengeCreatedEvt,
} from "@/lib/events"
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer"
import { Chip } from "@/lib/ui/Status"

// new, richer tx list
import LatestTransactionsPro from "@/app/components/dashboard/LatestTransactionsPro"

type Row = {
  id: string
  creator?: Address
  startTs?: string
  blockNumber: string
  txHash: `0x${string}`
  status: "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused"
  winnersClaimed?: string
}

const DEFAULT_SPAN = 10_000n
const PENDING: Row["status"] = "Pending"

export default function Dashboard() {
  const chainId = useChainId()
  const search = useSearchParams()
  const router = useRouter()
  const statusFilter = (search.get("status") || "").toLowerCase()

  const [rows, setRows] = useState<Row[]>([])
  const [range, setRange] = useState<{ fromBlock: bigint; toBlock: bigint } | null>(null)
  const [span, setSpan] = useState<string>(DEFAULT_SPAN.toString())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [blockAges, setBlockAges] = useState<Record<string, number>>({}) // blockNumber -> unix sec

  async function loadWindow(toBlock?: bigint) {
    setLoading(true)
    setError(null)
    try {
      const s = BigInt(span)
      const { items, fromBlock, toBlock: latest } = await fetchCreatedWindow(
        ADDR.ChallengePay,
        ABI.ChallengePay as Abi,
        { span: s, toBlock }
      )
      const mapped: Row[] = items.map((it: ChallengeCreatedEvt) => ({
        id: it.id.toString(),
        creator: it.creator,
        startTs: undefined,
        blockNumber: it.blockNumber.toString(),
        txHash: it.txHash,
        status: PENDING,
      }))
      setRange({ fromBlock, toBlock: latest })
      return mapped
    } catch (e: any) {
      setError(e?.message || String(e))
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let stop = false
    ;(async () => {
      const items = await loadWindow()
      if (!stop) setRows(items)
    })()
    return () => { stop = true }
  }, [span, chainId])

  async function onLoadMore() {
    if (!range) return
    setLoading(true)
    setError(null)
    try {
      const { items, fromBlock } = await fetchMoreCreated(
        ADDR.ChallengePay,
        ABI.ChallengePay as Abi,
        range.fromBlock,
        BigInt(span)
      )
      const more: Row[] = items.map((it: ChallengeCreatedEvt) => ({
        id: it.id.toString(),
        creator: it.creator,
        startTs: undefined,
        blockNumber: it.blockNumber.toString(),
        txHash: it.txHash,
        status: PENDING,
      }))
      setRows((prev) => [...prev, ...more])
      setRange((prev) => (prev ? { fromBlock, toBlock: prev.toBlock } : null))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // fetch block timestamps for visible rows (used to show "age")
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const uniques = Array.from(new Set(rows.map(r => r.blockNumber))).filter(b => !blockAges[b])
      if (uniques.length === 0) return
      try {
        const res = await fetch("/api/blocks?ids=" + uniques.join(","))
        if (!res.ok) return
        const j = await res.json() as Record<string, number>
        if (!cancelled) setBlockAges((prev) => ({ ...prev, ...j }))
      } catch {}
    })()
    return () => { cancelled = true }
  }, [rows]) // eslint-disable-line

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows
    if (statusFilter) {
      out = out.filter(r => r.status.toLowerCase().startsWith(statusFilter))
    }
    if (!q) return out
    return out.filter((r) => {
      const idMatch = r.id.includes(q)
      const creatorMatch = (r.creator?.toLowerCase() || "").includes(q)
      return idMatch || creatorMatch
    })
  }, [rows, query, statusFilter])

  const kpis = {
    pending: rows.length,
    approved: 0, active: 0, finalized: 0, unclaimed: 0
  }

  function goStatus(s: string){
    const p = new URLSearchParams(search.toString())
    if (s) p.set("status", s); else p.delete("status")
    router.replace(`/dashboard?${p.toString()}`)
  }

  return (
    <div className="container-narrow mx-auto py-10 space-y-8">
      {/* hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-[--lc-grad-1]/25 via-[#8a3ffc22] to-[--lc-grad-2]/25 p-5 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-sm text-white/60">LightChallenge</div>
            <h1 className="text-3xl font-semibold leading-tight h-gradient">Dashboard</h1>
            <div className="text-xs text-white/70 mt-1">
              ChainId: {chainId} {chainId !== 504 && "(switch to Lightchain 504)"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
            Scanning on-chain events in rolling windows
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ backgroundImage: "radial-gradient(1200px 600px at 120% -20%, rgba(255,255,255,.25), transparent 55%)" }}
        />
      </div>

      {/* KPI tiles — clickable filters */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {[
          { key: "pending",   label: "Pending",   value: kpis.pending,   icon: "clock" },
          { key: "approved",  label: "Approved",  value: kpis.approved,  icon: "check" },
          { key: "active",    label: "Active",    value: kpis.active,    icon: "bolt" },
          { key: "finalized", label: "Finalized", value: kpis.finalized, icon: "flag" },
          { key: "unclaimed", label: "Unclaimed", value: kpis.unclaimed, icon: "wallet" },
        ].map((k) => (
          <button key={k.key} className={`metric ${statusFilter===k.key ? "ring-1 ring-white/30" : ""}`} onClick={()=>goStatus(k.key)}>
            <div className="metric__icon" aria-hidden>
              {k.icon === "clock"  && <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.75a10.25 10.25 0 1 0 0 20.5a10.25 10.25 0 0 0 0-20.5M12 3.25a8.75 8.75 0 1 1 0 17.5a8.75 8.75 0 0 1 0-17.5m-.75 3.5v5.19l4.44 2.56l.75-1.29l-3.69-2.12V6.75z"/></svg>}
              {k.icon === "check"  && <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="m9.55 16.55l-4.1-4.1l1.4-1.4l2.7 2.7l7.8-7.8l1.4 1.4z"/></svg>}
              {k.icon === "bolt"   && <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M7 2v13h3v7l7-12h-4l4-8z"/></svg>}
              {k.icon === "flag"   && <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h2v8h8l-2-4l2-4H6v20H4V2z"/></svg>}
              {k.icon === "wallet" && <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21 7H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14V7m-2 7h-4v-3h4v3M19 3H5a2 2 0 0 0-2 2v1h2V5h14v2h2V5a2 2 0 0 0-2-2"/></svg>}
            </div>
            <div className="metric__content">
              <div className="metric__label">{k.label}</div>
              <div className="metric__value">{k.value.toLocaleString()}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Latest Transactions — full width */}
      <div className="panel">
        <div className="panel-header">
          <div className="font-semibold text-lg">Latest Transactions</div>
          <span className="text-xs text-white/60">Watching ChallengePay / Treasury</span>
        </div>
        <div className="panel-body">
          <LatestTransactionsPro
            watchAddresses={[ADDR.ChallengePay, ADDR.Treasury].filter(Boolean) as Address[]}
            abi={ABI.ChallengePay as Abi}
            limit={10}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="panel">
        <div className="panel-body space-y-2">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              className="input"
              placeholder="Filter by ID or creator (0x…)"
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
            />
            <div className="text-white/60 text-sm">
              Showing {filtered.length} of {rows.length}
              {range ? ` (blocks ${range.fromBlock.toString()} → ${range.toBlock.toString()})` : ""}
            </div>
            <div className="flex-1" />
            <select
              className="input w-40"
              value={span}
              onChange={(e)=>setSpan(e.target.value)}
              title="Blocks to scan per request"
            >
              <option value="2000">2,000 blocks</option>
              <option value="5000">5,000 blocks</option>
              <option value="10000">10,000 blocks</option>
              <option value="20000">20,000 blocks</option>
            </select>
            <button
              className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
              onClick={onLoadMore}
              disabled={loading || !range || range.fromBlock === 0n}
            >
              {loading ? "Loading…" : "Load older"}
            </button>
          </div>
          {error && <div className="text-red-300 text-sm">{error}</div>}
        </div>
      </div>

      {/* Challenges table */}
      <div className="panel">
        <div className="panel-header">
          <h3 className="font-semibold">Challenges (Newest First)</h3>
        </div>
        <div className="panel-body">
          {loading && <div className="text-white/60 text-sm">Reading logs…</div>}
          {!loading && filtered.length === 0 && (
            <div className="text-white/60 text-sm">No challenges in the scanned range.</div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-white/60">
                  <tr>
                    <th className="text-left py-2 pr-3">ID</th>
                    <th className="text-left py-2 pr-3">Creator</th>
                    <th className="text-left py-2 pr-3">Block</th>
                    <th className="text-left py-2 pr-3">Created</th>
                    <th className="text-left py-2 pr-3">Tx</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const ts = blockAges[r.blockNumber]
                    const age = ts ? timeAgo(ts*1000) : "—"
                    return (
                      <tr key={`${r.txHash}-${r.id}`} className="border-t border-white/10 hover:bg-white/[0.03]">
                        <td className="py-2 pr-3">
                          <a className="underline" href={`/challenge/${r.id}`}>#{r.id}</a>
                        </td>
                        <td className="py-2 pr-3">
                          {r.creator
                            ? <a className="underline" href={addressUrl(r.creator)} target="_blank" rel="noreferrer">
                                {r.creator.slice(0,6)}…{r.creator.slice(-4)}
                              </a>
                            : "—"}
                        </td>
                        <td className="py-2 pr-3">
                          <a className="underline" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                            {r.blockNumber}
                          </a>
                        </td>
                        <td className="py-2 pr-3">{age}</td>
                        <td className="py-2 pr-3">
                          <a className="underline" href={txUrl(r.txHash)} target="_blank" rel="noreferrer">
                            {r.txHash.slice(0,12)}…
                          </a>
                        </td>
                        <td className="py-2">
                          <Chip color={statusColor(r.status)}>{r.status}</Chip>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* helpers */
function statusColor(s: Row["status"]) {
  switch (s) {
    case "Approved": return "bg-emerald-500/20"
    case "Rejected": return "bg-rose-500/20"
    case "Finalized": return "bg-indigo-500/20"
    case "Canceled": return "bg-amber-500/20"
    case "Paused": return "bg-sky-500/20"
    default: return "bg-amber-500/20"
  }
}
function timeAgo(ms: number) {
  const sec = Math.max(1, Math.floor((Date.now() - ms) / 1000))
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec/60); if (m<60) return `${m}m ago`
  const h = Math.floor(m/60); if (h<48) return `${h}h ago`
  const d = Math.floor(h/24); return `${d}d ago`
}