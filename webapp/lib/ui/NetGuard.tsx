"use client"
import { useChainId, useSwitchChain } from "wagmi"
import { lightchain } from "@/lib/lightchain"

export default function NetGuard() {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  if (chainId && chainId !== lightchain.id) {
    return (
      <div className="mx-4 my-3 rounded-xl border border-white/10 bg-yellow-500/10 text-yellow-200 p-3 flex items-center justify-between">
        <span>
          Wrong network. You’re on {chainId}, app expects {lightchain.name} (id {lightchain.id}).
        </span>
        <button
          className="px-3 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30"
          onClick={() => switchChain({ chainId: lightchain.id })}
        >
          Switch
        </button>
      </div>
    )
  }
  return null
}