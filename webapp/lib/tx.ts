"use client"
import { createWalletClient, http } from "viem"
import { defineChain } from "viem"

const KEY = "lc_max_budget_lcai"

export function useMaxBudget() {
  const React = require("react")
  const [max, setMaxRaw] = React.useState("0.05")
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setMaxRaw(localStorage.getItem(KEY) || "0.05")
    }
  }, [])
  function setMax(v: string) {
    setMaxRaw(v)
    if (typeof window !== "undefined") localStorage.setItem(KEY, v)
  }
  return { max, setMax }
}

const rpcDefault = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.lightchain.net"
export const lightchain = defineChain({
  id: 504,
  name: "Lightchain Testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [rpcDefault] } },
})

export async function simulateAndGuard(params: {
  account: `0x${string}`
  abi: any
  address: `0x${string}`
  functionName: string
  args?: any[]
  value?: bigint
  maxBudgetLCAI: string
  rpc?: string
}) {
  const rpc = params.rpc || rpcDefault
  const client = createWalletClient({ chain: lightchain, transport: http(rpc) })
  const sim: any = await (client as any).simulateContract({ ...params })
  const gas = sim.request.gas ?? 0n
  // crude estimate until you wire exact gasPrice
  const est = Number(gas) * 1e-9
  if (est > Number(params.maxBudgetLCAI)) {
    throw new Error(`Gas ${est.toFixed(6)} > max budget ${params.maxBudgetLCAI} LCAI`)
  }
  return sim
}