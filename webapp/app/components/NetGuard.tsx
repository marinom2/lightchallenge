"use client"
import { useChainId, useSwitchChain } from "wagmi"
import { lightchain } from "../../lib/lightchain"

export default function NetGuard() {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  if (chainId && chainId !== lightchain.id) {
    return (
      <div className="container-narrow mx-auto px-4">
        <div className="panel mt-4">
          <div className="panel-body flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-yellow-200/90">
              Wrong network. Please switch to <b>Lightchain Testnet</b>.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => switchChain({ chainId: lightchain.id })}
            >
              Switch
            </button>
          </div>
        </div>
      </div>
    )
  }
  return null
}