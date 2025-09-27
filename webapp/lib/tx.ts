"use client"

import { useEffect, useState } from "react"
import type { Abi, Address, Hex, Hash } from "viem"
import { formatEther } from "viem"
import { waitForTransactionReceipt } from "viem/actions"
import { useAccount, usePublicClient, useWalletClient } from "wagmi"

const BUDGET_KEY = "lc_max_budget_lcai"

// LocalStorage-backed gas budget (LCAI)
export function useMaxBudget() {
  const [max, setMaxRaw] = useState<string>("0.02")
  useEffect(() => {
    const envDefault = String(process.env.NEXT_PUBLIC_MAX_BUDGET_LCAI ?? "0.02")
    const stored = typeof window !== "undefined" ? localStorage.getItem(BUDGET_KEY) : null
    setMaxRaw(stored ?? envDefault)
  }, [])
  const setMax = (v: string) => {
    setMaxRaw(v)
    if (typeof window !== "undefined") localStorage.setItem(BUDGET_KEY, v)
  }
  return { max, setMax }
}

export function resolveMaxBudget(override?: number | string): number {
  if (override != null) return Number(override)
  if (typeof window !== "undefined") {
    const s = window.localStorage?.getItem(BUDGET_KEY)
    if (s) return Number(s)
  }
  return Number(process.env.NEXT_PUBLIC_MAX_BUDGET_LCAI ?? "0.02")
}

export type TxRequest = {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
  value?: bigint
}

export function useTx() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()

  async function simulateAndSend(
    request: TxRequest,
    maxBudgetOverride?: number | string
  ): Promise<{ txHash: Hex; estimatedLCAI: number; request: typeof simReq }> {
    if (!publicClient) throw new Error("Public client not ready")
    if (!walletClient) throw new Error("Wallet client not ready")
    if (!address) throw new Error("No connected account")

    const sim = await publicClient.simulateContract({ ...request, account: address })
    const simReq = sim.request

    const gas = simReq.gas ?? 0n
    const gasPrice = await publicClient.getGasPrice()
    const estimatedLCAI = Number(formatEther(gas * gasPrice))

    const max = resolveMaxBudget(maxBudgetOverride)
    if (estimatedLCAI > max) throw new Error(`Gas ${estimatedLCAI.toFixed(6)} LCAI > max ${max} LCAI`)

    const txHash = await walletClient.writeContract(simReq)
    return { txHash, estimatedLCAI, request: simReq }
  }

  return { simulateAndSend }
}

export async function waitReceipt(
  publicClient: Parameters<typeof waitForTransactionReceipt>[0],
  hash: Hash
) {
  const onReplaced = (log: unknown) => {
    console.warn("tx replaced", log)
  }
  return waitForTransactionReceipt(publicClient as any, {
    hash,
    confirmations: 1,
    onReplaced,
  })
}

export function txErrorMessage(e: unknown) {
  if (typeof e === "object" && e) {
    const anyE = e as any
    if (typeof anyE.shortMessage === "string") return anyE.shortMessage
    if (typeof anyE.message === "string") return anyE.message
  }
  return String(e)
}