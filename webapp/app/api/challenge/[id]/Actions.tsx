// app/challenge/[id]/Actions.tsx
"use client"

import { useState } from "react"
import { usePublicClient, useAccount, useWriteContract } from "wagmi"
import { ABI, ADDR } from "@/lib/contracts"
import type { Abi } from "viem"
import { Toasts } from "@/lib/ui/toast"

type Props = {
  id: string | bigint
  status: "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused"
  onChanged?: () => void
}

export default function ChallengeActions({ id, status, onChanged }: Props) {
  const [busy, setBusy] = useState<null | "finalize" | "claim">(null)
  const pc = usePublicClient()
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const challengeId = typeof id === "string" ? BigInt(id) : id

  async function run(label: "Finalize" | "Claim winner", fn: "finalize" | "claimWinner") {
    try {
      if (!pc) throw new Error("No public client")
      setBusy(fn === "finalize" ? "finalize" : "claim")
      notify.info(`${label} submitted…`)

      const hash = await writeContractAsync({
        abi: ABI.ChallengePay as Abi,
        address: ADDR.ChallengePay,
        functionName: fn,
        args: [challengeId],
      })

      notify.info(`${label} • waiting for confirmation…`)
      const receipt = await pc.waitForTransactionReceipt({ hash })
      if (receipt.status === "success") {
        notify.success(`${label} confirmed`)
        onChanged?.()
      } else {
        notify.error(`${label} failed`)
      }
    } catch (e: any) {
      notify.error(e?.shortMessage || e?.message || String(e))
    } finally {
      setBusy(null)
    }
  }

  const canFinalize = status === "Approved" || status === "Paused"
  const canClaim    = status === "Finalized"

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
        disabled={!canFinalize || busy !== null}
        onClick={() => run("Finalize", "finalize")}
        title={canFinalize ? "Finalize this challenge" : "Not finalizable in the current state"}
      >
        {busy === "finalize" ? "Finalizing…" : "Finalize"}
      </button>

      <button
        className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
        disabled={!canClaim || busy !== null}
        onClick={() => run("Claim winner", "claimWinner")}
        title={canClaim ? "Claim winner payout" : "Not claimable yet"}
      >
        {busy === "claim" ? "Claiming…" : "Claim winner"}
      </button>

      {address && (
        <span className="text-white/40 text-xs self-center">
          Connected: {address.slice(0, 6)}…{address.slice(-4)}
        </span>
      )}
    </div>
  )
}

// — toast shim —
const notify = {
  success: (m: string) => safeToast("success", m),
  error:   (m: string) => safeToast("error", m),
  info:    (m: string) => safeToast("info", m),
}

function safeToast(type: "success" | "error" | "info", message: string) {
  try {
    // Prefer named helpers if present
    // @ts-ignore
    if (Toasts?.[type]) return Toasts[type](message)
    // Common variants
    // @ts-ignore
    if (Toasts?.push)   return Toasts.push({ type, message })
    // @ts-ignore
    if (Toasts?.add)    return Toasts.add({ type, message })
  } catch {}
  console.log(`[${type}]`, message)
}