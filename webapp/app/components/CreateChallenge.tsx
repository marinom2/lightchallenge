"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import { Hex } from "viem"
import deployments from "../../public/deployments/lightchain.json"
import cpAbi from "../../public/abi/ChallengePay.abi.json"

export default function CreateChallenge() {
  const { writeContractAsync, isPending } = useWriteContract()
  const [goal, setGoal] = useState("5000")
  const [stake, setStake] = useState("0.01")

  async function create() {
    const amount = BigInt(Math.floor(parseFloat(stake) * 1e18))
    await writeContractAsync({
      abi: (cpAbi as any).abi,
      address: (deployments as any).ChallengePay as Hex,
      functionName: "createChallenge",
      args: [BigInt(goal), amount]
    })
  }

  return (
    <div className="p-4 border rounded">
      <h2 className="font-bold">Create Challenge</h2>
      <input className="border px-2 py-1 m-1" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Steps goal"/>
      <input className="border px-2 py-1 m-1" value={stake} onChange={e=>setStake(e.target.value)} placeholder="Stake (LCAI)"/>
      <button onClick={create} disabled={isPending} className="px-3 py-1 bg-blue-500 text-white rounded">
        {isPending ? "Creating..." : "Create"}
      </button>
    </div>
  )
}
