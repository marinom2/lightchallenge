"use client"
import { useState } from "react"
import { useWriteContract } from "wagmi"
import { ADDR, ABI } from "@/lib/contracts"
import { useTx } from "@/lib/tx"
import { useToasts } from "@/lib/ui/toast"

const FNS = ["claimWinner","claimLoserCashback","claimValidator","claimRejectContribution","claimRejectCreator"] as const
type Fn = typeof FNS[number]

export default function ClaimsPage(){
  const [id, setId] = useState("1")
  const { writeContractAsync, isPending } = useWriteContract()
  const { simulateAndSend } = useTx()
  const { push } = useToasts()

  async function call(fn: Fn) {
    try {
      const sim = await simulateAndSend({
        address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: fn, args: [BigInt(id)]
      })
      const req = sim.request as Parameters<typeof writeContractAsync>[0]
      const hash = await writeContractAsync(req)
      push(`${fn} sent: ${hash}`)
    } catch (e: unknown) { push(e instanceof Error ? e.message : "Tx failed") }
  }

  return (
    <div className="container-narrow mx-auto px-4 py-8">
      <div className="card max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Claims</h1>
        <div>
          <label className="label">Challenge ID</label>
          <input className="input" value={id} onChange={e=>setId(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {FNS.map(fn => (
            <button key={fn} className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={()=>call(fn)}>{fn}</button>
          ))}
        </div>
      </div>
    </div>
  )
}