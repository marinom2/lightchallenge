// webapp/app/explore/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useChainId } from "wagmi"
import type { Address } from "viem"
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer"
import { Chip } from "@/lib/ui/Status"

type RowApi = {
  id?: string
  creator?: Address
  blockNumber?: string
  txHash?: `0x${string}`
}

type Row = {
  id: bigint
  creator?: Address
  blockNumber: bigint
  txHash: `0x${string}`
}

type ApiResponse = {
  range: { fromBlock: string; toBlock: string; span: string }
  kpis: {
    totalCreatedInWindow: number
    approvalsInWindow: number
    claimsInWindow: number
  }
  config: Record<string, unknown>
  recent: RowApi[]
}

const DEFAULT_SPAN = 10_000n // blocks per query window

export default function Explore() {
  const chainId = useChainId()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<{ fromBlock: bigint; toBlock: bigint } | null>(null)
  const [query, setQuery] = useState("")
  const [span, setSpan] = useState<bigint>(DEFAULT_SPAN)

  async function fetchWindow(toBlock?: bigint) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("span", span.toString())
      if (typeof toBlock === "bigint") params.set("toBlock", toBlock.toString())

      const res = await fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) {
        let msg = `API error ${res.status}`
        try {
          const j = await res.json()
          if (j?.error) msg = j.error
        } catch {}
        throw new Error(msg)
      }

      const data = (await res.json()) as ApiResponse
      const mapped: Row[] = (data.recent || [])
        .filter(r => r.txHash && r.blockNumber && r.id) // guard against partial rows
        .map(r => ({
          id: BigInt(r.id!),
          creator: r.creator,
          blockNumber: BigInt(r.blockNumber!),
          txHash: r.txHash!,
        }))

      // Derive current range from response
      const from = BigInt(data.range.fromBlock)
      const to = BigInt(data.range.toBlock)
      setRange({ fromBlock: from, toBlock: to })

      return mapped
    } catch (e: any) {
      setError(e?.message || String(e))
      return [] as Row[]
    } finally {
      setLoading(false)
    }
  }

  // Initial load & when span changes → reload from latest window
  useEffect(() => {
    let stop = false
    ;(async () => {
      const items = await fetchWindow()
      if (!stop) setRows(items)
    })()
    return () => {
      stop = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [span])

  // “Load older” = request older window ending before current oldest
  async function onLoadMore() {
    if (!range) return
    const olderTo = range.fromBlock > 0n ? range.fromBlock - 1n : 0n
    const older = await fetchWindow(olderTo)
    setRows(prev => [...prev, ...older])
  }

  // Filter by ID or creator address
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => {
      const idMatch = r.id.toString().includes(q)
      const creatorMatch = (r.creator?.toLowerCase() || "").includes(q)
      return idMatch || creatorMatch
    })
  }, [rows, query])

  return (
    <div className="container-narrow mx-auto px-4 py-8 space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">Explore</h1>
        <span className="text-white/50 text-xs">
          ChainId: {chainId} {chainId !== 504 && "(switch to Lightchain 504)"}
        </span>
      </div>

      <div className="card space-y-2">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            className="input"
            placeholder="Filter by ID or creator (0x…)"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="text-white/60 text-sm">
            Showing {filtered.length} of {rows.length}
            {range ? ` (blocks ${range.fromBlock.toString()} → ${range.toBlock.toString()})` : ""}
          </div>
          <div className="flex-1" />
          <select
            className="input w-36"
            value={span.toString()}
            onChange={e => setSpan(BigInt(e.target.value))}
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

      <div className="card">
        <h3>Recent Challenges (Newest First)</h3>
        {loading && <div className="text-white/60 text-sm">Reading logs from server…</div>}
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
                  <th className="text-left py-2 pr-3">Tx</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={`${r.txHash}-${r.id}`} className="border-t border-white/10">
                    <td className="py-2 pr-3">
                      <a className="underline" href={`/challenge/${r.id.toString()}`}>
                        #{r.id.toString()}
                      </a>
                    </td>
                    <td className="py-2 pr-3">
                      {r.creator ? (
                        <a
                          className="underline"
                          href={addressUrl(r.creator)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.creator.slice(0, 6)}…{r.creator.slice(-4)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <a
                        className="underline"
                        href={blockUrl(r.blockNumber)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.blockNumber.toString()}
                      </a>
                    </td>
                    <td className="py-2 pr-3">
                      <a
                        className="underline"
                        href={txUrl(r.txHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.txHash.slice(0, 12)}…
                      </a>
                    </td>
                    <td className="py-2">
                      <Chip color="bg-emerald-500/20">Created</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}