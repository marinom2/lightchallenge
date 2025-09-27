"use client"

import { useEffect, useState } from "react"
import { usePublicClient } from "wagmi"
import type { Address, Hex } from "viem"
import { txUrl, addressUrl, blockUrl } from "@/lib/explorer"
import { Chip } from "@/lib/ui/Status"

type LiteTx = {
  hash: Hex
  blockNumber: bigint
  to?: Address | null
  from?: Address
  ok?: boolean
  label?: string
}

function shortAddr(a?: string | null) {
  if (!a) return "—"
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function labelForTx(to?: Address | null, labels?: Record<string, string>) {
  if (!to) return "Contract creation"
  const key = to.toLowerCase()
  return labels?.[key] || "External"
}

export default function LatestTransactions({
  watchAddresses,
  labels,
  logSpan = 2000n,
  limit = 8,
}: {
  watchAddresses: Address[]
  labels?: Record<string, string> // { [lowercasedAddress]: "ChallengePay" }
  logSpan?: bigint
  limit?: number
}) {
  const client = usePublicClient()
  const [recentTxs, setRecentTxs] = useState<LiteTx[]>([])

  useEffect(() => {
    if (!client || watchAddresses.length === 0) return
    let stop = false
    ;(async () => {
      const head = await client.getBlockNumber()
      const from = head - logSpan

      const logs = await client.getLogs({
        address: watchAddresses,
        fromBlock: from,
        toBlock: head,
      })

      const seen = new Set<string>()
      const items: LiteTx[] = []
      for (const lg of logs.reverse()) {
        if (seen.has(lg.transactionHash)) continue
        seen.add(lg.transactionHash)
        const rc = await client.getTransactionReceipt({ hash: lg.transactionHash })
        items.push({
          hash: rc.transactionHash,
          blockNumber: rc.blockNumber,
          to: rc.to,
          from: rc.from,
          ok: rc.status === "success",
          label: labelForTx(rc.to, labels),
        })
        if (items.length >= limit) break
      }
      if (!stop) setRecentTxs(items)
    })()
    return () => { stop = true }
  }, [client, watchAddresses, labels, logSpan, limit])

  return (
    <div className="space-y-2">
      {recentTxs.map((t) => (
        <div key={t.hash} className="flex items-center justify-between border-b border-white/10 py-2">
          <div className="flex flex-col">
            <a className="underline" href={txUrl(t.hash)} target="_blank" rel="noreferrer">
              {t.hash.slice(0, 12)}…
            </a>
            <div className="text-xs text-white/60">
              {t.label} • Block&nbsp;
              <a className="underline" href={blockUrl(t.blockNumber.toString())} target="_blank" rel="noreferrer">
                {t.blockNumber.toString()}
              </a>
            </div>
          </div>
          <div className="text-xs text-white/60">
            {t.from ? <a className="underline" href={addressUrl(t.from)} target="_blank" rel="noreferrer">{shortAddr(t.from)}</a> : "—"}
            {" → "}
            {t.to ? <a className="underline" href={addressUrl(t.to)} target="_blank" rel="noreferrer">{shortAddr(t.to)}</a> : "—"}
          </div>
          <div>
            <Chip color={t.ok ? "bg-emerald-500/20" : "bg-rose-500/20"}>
              {t.ok ? "Success" : "Failed"}
            </Chip>
          </div>
        </div>
      ))}
      {recentTxs.length === 0 && <div className="text-white/60 text-sm">Scanning recent logs…</div>}
    </div>
  )
}