"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import { Hex } from "viem"
import deployments from "../../public/deployments/lightchain.json"
import cpAbi from "../../public/abi/ChallengePay.abi.json"

export default function FinalizeChallenge() {
  const { writeContractAsync, isPending } = useWriteContract()
  const [chId, setChId] = useState("1")

  async function finalize() {
    await writeContractAsync({
      abi: (cpAbi as any).abi,
      address: (deployments as any).ChallengePay as Hex,
      functionName: "finalize",
      args: [BigInt(chId)]
    })
  }

  return (
    <div className="p-4 border rounded">
      <h2 className="font-bold">Finalize Challenge</h2>
      <input className="border px-2 py-1 m-1" value={chId} onChange={e=>setChId(e.target.value)} placeholder="Challenge ID"/>
      <button onClick={finalize} disabled={isPending} className="px-3 py-1 bg-red-500 text-white rounded">
        {isPending ? "Finalizing..." : "Finalize"}
      </button>
    </div>
  )
}
