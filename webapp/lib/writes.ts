"use client"
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { useState } from "react"

export function useSafeWrite() {
  const { writeContractAsync } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | null>(null)
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: hash ?? undefined })

  async function safeWrite(args: Parameters<typeof writeContractAsync>[0]) {
    const tx = await writeContractAsync(args)
    setHash(tx as `0x${string}`)
    return tx
  }

  return { safeWrite, txHash: hash, isMining, isSuccess }
}