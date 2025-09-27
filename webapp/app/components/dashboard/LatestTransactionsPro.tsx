// app/components/dashboard/LatestTransactionsPro.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { createPublicClient, http, parseAbiItem, decodeFunctionData, type Abi, type Address } from "viem"
import { lightchain, RPC_URL } from "@/lib/lightchain"
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer"

type TxRow = {
  hash: `0x${string}`
  from: Address
  to?: Address
  method?: string
  status: "Success" | "Failed" | "Pending"
  blockNumber?: bigint
  timestamp?: number
  fee?: string // in LCAI
}

export default function LatestTransactionsPro({
  watchAddresses,
  abi,
  limit = 10,
}: {
  watchAddresses: Address[]
  abi: Abi
  limit?: number
}) {
  const [rows, setRows] = useState<TxRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const client = createPublicClient({ chain: lightchain, transport: http(RPC_URL) })
        // Pull last ~N blocks and scan txs that touch watched addresses.
        const head = await client.getBlockNumber()
        const span = 120n // ~ couple of minutes window
        const from = head > span ? head - span : 0n
        const blocks = await Promise.all(
          Array.from({ length: Number(head - from + 1n) }).map((_, i) => client.getBlock({
            blockNumber: from + BigInt(i),
            includeTransactions: true,
          }))
        )
        const picked: TxRow[] = []

        for (const b of blocks.reverse()) {
          for (const tx of (b.transactions ?? [])) {
            const t = tx as any
            const to = t.to as Address | undefined
            const fromAddr = (t.from || "") as Address
            const touches =
              (to && watchAddresses.some(a => a.toLowerCase() === to.toLowerCase())) ||
              watchAddresses.some(a => a.toLowerCase() === fromAddr.toLowerCase())
            if (!touches) continue

            let method: string | undefined = undefined
            try {
              if (t.input && t.input !== "0x") {
                const dec = decodeFunctionData({ abi, data: t.input as `0x${string}` })
                method = dec.functionName
              }
            } catch {}

            // receipt for status + fee
            let status: TxRow["status"] = "Pending"
            let fee: string | undefined
            try {
              const rcp = await client.getTransactionReceipt({ hash: t.hash })
              status = rcp.status === "success" ? "Success" : "Failed"
              // gasUsed * effectiveGasPrice
              const wei = rcp.gasUsed * rcp.effectiveGasPrice
              fee = Number(wei) / 1e18 + "" // LCAI
            } catch {}

            picked.push({
              hash: t.hash,
              from: fromAddr,
              to,
              method,
              status,
              blockNumber: b.number,
              timestamp: Number(b.timestamp),
              fee,
            })
            if (picked.length >= limit) break
          }
          if (picked.length >= limit) break
        }

        if (!stop) setRows(picked)
      } catch (e: any) {
        if (!stop) setError(e?.message || String(e))
      }
    })()
    return () => { stop = true }
  }, [watchAddresses.join(","), limit, abi])

  if (error) return <div className="text-red-300 text-sm">{error}</div>
  if (rows.length === 0) return <div className="text-white/60 text-sm">No recent transactions.</div>

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.hash} className="tx-row">
          <div className="tx-left">
            <span className={`status ${r.status === "Success" ? "ok" : r.status === "Failed" ? "bad" : "pend"}`}>
              {r.status}
            </span>
            <a className="mono underline" href={txUrl(r.hash)} target="_blank" rel="noreferrer">
              {r.hash.slice(0,10)}…
            </a>
            {r.method && <span className="method">{r.method}</span>}
          </div>
          <div className="tx-right">
            {r.blockNumber !== undefined && (
              <a className="text-white/70 underline" href={blockUrl(r.blockNumber)} target="_blank" rel="noreferrer">
                #{r.blockNumber.toString()}
              </a>
            )}
            <span className="sep">•</span>
            <span className="text-white/60">{r.timestamp ? timeAgo(r.timestamp*1000) : "—"}</span>
            <div className="truncate">
              <a className="underline" href={addressUrl(r.from)} target="_blank" rel="noreferrer">
                {short(r.from)}
              </a>
              {r.to && <> → <a className="underline" href={addressUrl(r.to)} target="_blank" rel="noreferrer">{short(r.to)}</a></>}
            </div>
            {r.fee && <span className="fee">{Number(r.fee).toFixed(6)} LCAI</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function timeAgo(ms: number) {
  const sec = Math.max(1, Math.floor((Date.now() - ms) / 1000))
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec/60); if (m<60) return `${m}m ago`
  const h = Math.floor(m/60); if (h<48) return `${h}h ago`
  const d = Math.floor(h/24); return `${d}d ago`
}
function short(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}` }