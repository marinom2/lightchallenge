// webapp/app/components/Connect.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  type Connector,
} from "wagmi"

function short(addr?: `0x${string}`) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ""
}

export default function Connect() {
  const { address, isConnected, chainId: acctChainId } = useAccount()
  const appChainId = useChainId()
  const { connectors, connect, status, error, reset } = useConnect()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const ordered = useMemo(() => {
    const unique = connectors.filter(
      (c, i, a) => a.findIndex(x => x.id === c.id) === i
    )
    const usable = unique.filter((c) => typeof (c as any).connect === "function")
    const score = (c: Connector) =>
      c.type === "injected" ? 100 : c.id.includes("walletConnect") ? 90 : 50
    return usable.sort((a, b) => score(b) - score(a))
  }, [connectors])

  // Close the menu after a successful connect
  useEffect(() => {
    if (isConnected) setOpen(false)
  }, [isConnected])

  // While not mounted, render a stable “Connect” button to prevent hydration mismatch
  if (!mounted) {
    return (
      <button className="btn btn-primary px-3 py-2 rounded-xl" aria-haspopup="menu">
        Connect
      </button>
    )
  }

  const wrongChain = !!(acctChainId && appChainId && acctChainId !== appChainId)

  if (isConnected) {
    return (
      <div className="relative">
        <button
          className="btn btn-primary px-3 py-2 rounded-xl"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {wrongChain ? "Switch Network" : short(address)}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 min-w-56 rounded-xl border border-white/10 bg-[#0f1117] p-3 z-50">
            <div className="text-white/70 text-sm mb-2">
              {wrongChain ? "Connected (Wrong Network)" : "Connected"}
            </div>
            <div className="text-white break-all text-sm mb-3">{address}</div>
            <button
              className="w-full rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  // Not connected
  return (
    <div className="relative">
      <button
        className="btn btn-primary px-3 py-2 rounded-xl"
        onClick={() => {
          reset()
          setOpen(v => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Connect
      </button>

      {open && (
        <div className="absolute right-0 mt-2 min-w-64 rounded-xl border border-white/10 bg-[#0f1117] p-2 z-50">
          {ordered.map((c) => (
            <button
              key={c.id}
              className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/10"
              onClick={() => connect({ connector: c })}
            >
              {c.name}
            </button>
          ))}

          {status === "pending" && (
            <div className="px-3 py-2 text-sm text-white/60">Opening wallet…</div>
          )}
          {error && (
            <div className="px-3 py-2 text-sm text-red-300">
              {(error as any)?.shortMessage || (error as any)?.message || String(error)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}