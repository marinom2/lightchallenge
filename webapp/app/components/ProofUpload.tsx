"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import deployments from "../../public/deployments/lightchain.json"
import cpAbi from "../../public/abi/ChallengePay.abi.json"
import { Hex } from "viem"

export default function ProofUpload() {
  const { writeContractAsync, isPending } = useWriteContract()
  const [chId, setChId] = useState("1")
  const [proofHex, setProofHex] = useState("0x")

  async function submit() {
    await writeContractAsync({
      abi: (cpAbi as any).abi,
      address: (deployments as any).ChallengePay as Hex,
      functionName: "submitProof",
      args: [BigInt(chId), proofHex as Hex]
    })
  }

  return (
    <div className="p-4 border rounded">
      <h2 className="font-bold">Submit Proof</h2>
      <input className="border px-2 py-1 m-1" value={chId} onChange={e=>setChId(e.target.value)} placeholder="Challenge ID"/>
      <textarea className="border px-2 py-1 m-1 w-full h-24" value={proofHex} onChange={e=>setProofHex(e.target.value)} placeholder="0x..."/>
      <button onClick={submit} disabled={isPending} className="px-3 py-1 bg-orange-500 text-white rounded">
        {isPending ? "Submitting..." : "Submit"}
      </button>
    </div>
  )
}
