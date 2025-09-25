"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import { Hex } from "viem"
import deployments from "../../public/deployments/lightchain.json"
import cpAbi from "../../public/abi/ChallengePay.abi.json"

export default function BetChallenge() {
  const { writeContractAsync, isPending } = useWriteContract()
  const [chId, setChId] = useState("1")
  const [amount, setAmount] = useState("0.01")

  async function bet() {
    const amt = BigInt(Math.floor(parseFloat(amount) * 1e18))
    await writeContractAsync({
      abi: (cpAbi as any).abi,
      address: (deployments as any).ChallengePay as Hex,
      functionName: "bet",
      args: [BigInt(chId), amt]
    })
  }

  return (
    <div className="p-4 border rounded">
      <h2 className="font-bold">Bet on Challenge</h2>
      <input className="border px-2 py-1 m-1" value={chId} onChange={e=>setChId(e.target.value)} placeholder="Challenge ID"/>
      <input className="border px-2 py-1 m-1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount LCAI"/>
      <button onClick={bet} disabled={isPending} className="px-3 py-1 bg-purple-500 text-white rounded">
        {isPending ? "Betting..." : "Bet"}
      </button>
    </div>
  )
}
