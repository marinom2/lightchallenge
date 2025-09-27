// webapp/app/components/ConnectButton.tsx
"use client"

import { useAccount, useDisconnect, useChainId } from "wagmi"
import { useWeb3Modal } from "@web3modal/wagmi/react"

const LIGHTCHAIN_ID = 504

const themedButton =
  "px-4 py-2 rounded-lg font-semibold transition " +
  "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 " +
  "text-white shadow-md hover:opacity-90 focus:outline-none"

function short(addr?: string) {
  if (!addr) return ""
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function ConnectButton() {
  const { open } = useWeb3Modal()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const onLightchain = chainId === LIGHTCHAIN_ID

  if (!isConnected) {
    return (
      <button onClick={() => open({ view: "Connect" })} className={themedButton}>
        Connect Wallet
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => open({ view: "Account" })}
        className={themedButton}
        title={address}
      >
        {short(address)}
      </button>

      {!onLightchain && (
        <button
          onClick={() => open({ view: "Networks" })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-sm text-white/80"
          title="Switch network"
        >
          Network
        </button>
      )}

      {/* Optional quick disconnect:
      <button onClick={() => disconnect()} className="px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-sm">
        Disconnect
      </button> */}
    </div>
  )
}