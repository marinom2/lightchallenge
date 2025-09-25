"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import { Hex } from "viem"
import deployments from "../../public/deployments/lightchain.json"
import cpAbi from "../../public/abi/ChallengePay.abi.json"

export default function JoinChallenge() {
  const { writeContractAsync, isPending } = useWriteContract()
  const [chId, setChId] = useState("1")
  const [stake, setStake] = useState("0.01")

  async function join() {
    const amount = BigInt(Math.floor(parseFloat(stake) * 1e18))
    await writeContractAsync({
      abi: (cpAbi as any).abi,
      address: (deployments as any).ChallengePay as Hex,
      functionName: "join",
      args: [BigInt(chId), amount]
    })
  }

  return (
    <div className="p-4 border rounded">
      <h2 className="font-bold">Join Challenge</h2>
      <input className="border px-2 py-1 m-1" value={chId} onChange={e=>setChId(e.target.value)} placeholder="Challenge ID"/>
      <input className="border px-2 py-1 m-1" value={stake} onChange={e=>setStake(e.target.value)} placeholder="Stake (LCAI)"/>
      <button onClick={join} disabled={isPending} className="px-3 py-1 bg-green-500 text-white rounded">
        {isPending ? "Joining..." : "Join"}
      </button>
    </div>
  )
}
