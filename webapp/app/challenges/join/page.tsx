"use client"
import { useState } from "react"
import { useAccount, useWriteContract } from "wagmi"
import dep from "../../../public/deployments/lightchain.json"
import cpAbi from "../../../public/abi/ChallengePay.abi.json"

export default function JoinPage() {
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useWriteContract()
  const [id, setId] = useState("1")
  const [amount, setAmount] = useState("0.01")

  async function onJoin() {
    await writeContractAsync({
      abi: (cpAbi as any).abi,
      address: (dep as any).ChallengePay,
      functionName: "join",
      args: [BigInt(id)],
      value: BigInt(Math.floor(Number(amount) * 1e18)),
    })
  }

  return (
    <div className="section">
      <h1 className="h1 mb-4">Join / Bet</h1>
      <label className="label">Challenge ID</label>
      <input className="input mb-3" value={id} onChange={e=>setId(e.target.value)} placeholder="1" />
      <label className="label">Amount (LCAI)</label>
      <input className="input mb-4" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.01" />
      <button onClick={onJoin} className="btn btn-primary w-full" disabled={isPending || !address}>
        {isPending ? "Joining..." : "Join"}
      </button>
    </div>
  )
}
