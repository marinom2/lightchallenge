"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import { ADDR, ABI } from "@/lib/contracts"
import { useTx } from "@/lib/tx"
import { useToasts } from "@/lib/ui/toast"

export default function SubmitProof(){
  const [id,setId]=useState("1")
  const [proof,setProof]=useState("0x")
  const { writeContractAsync, isPending } = useWriteContract()
  const { simulateAndSend } = useTx()
  const { push } = useToasts()

  async function submit(){
    try{
      const sim = await simulateAndSend({
        address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "submitProof",
        args: [BigInt(id), proof as `0x${string}`]
      })
      const req = sim.request as Parameters<typeof writeContractAsync>[0]
      const hash = await writeContractAsync(req)
      push(`submitProof sent: ${hash}`)
    }catch(e: unknown){ push(e instanceof Error ? e.message : "Tx failed") }
  }

  return (
    <div className="container-narrow mx-auto px-4 py-8">
      <div className="card max-w-2xl mx-auto space-y-3">
        <h1 className="text-2xl font-semibold">Submit ZK Proof</h1>
        <div>
          <label className="label">Challenge ID</label>
          <input className="input" value={id} onChange={e=>setId(e.target.value)} />
        </div>
        <div>
          <label className="label">Proof (0x… bytes)</label>
          <textarea className="input" rows={5} value={proof} onChange={e=>setProof(e.target.value)} />
        </div>
        <button className="btn btn-primary w-full" disabled={isPending} onClick={submit}>
          {isPending? "Submitting..." : "Submit Proof"}
        </button>
      </div>
    </div>
  )
}