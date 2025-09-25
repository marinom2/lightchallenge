"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import { Hex } from "viem"
import deployments from "../../public/deployments/lightchain.json"
import cpAbi from "../../public/abi/ChallengePay.abi.json"

export default function ClaimRewards() {
  const { writeContractAsync, isPending } = useWriteContract()
  const [chId, setChId] = useState("1")

  async function claimWinner() {
    await writeContractAsync({
      abi: (cpAbi as any).abi,
      address: (deployments as any).ChallengePay as Hex,
      functionName: "claimWinner",
      args: [BigInt(chId)]
    })
  }

  return (
    <div className="p-4 border rounded">
      <h2 className="font-bold">Claim Rewards</h2>
      <input className="border px-2 py-1 m-1" value={chId} onChange={e=>setChId(e.target.value)} placeholder="Challenge ID"/>
      <button onClick={claimWinner} disabled={isPending} className="px-3 py-1 bg-indigo-500 text-white rounded">
        {isPending ? "Claiming..." : "Claim Winner"}
      </button>
    </div>
  )
}
