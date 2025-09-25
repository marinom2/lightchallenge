"use client"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { getChallenge, getSnapshot } from "../../../lib/query"
import { ADDR, ABI } from "../../../lib/contracts"
import { useAccount, useWriteContract } from "wagmi"
import { useMaxBudget, simulateAndGuard } from "../../../lib/tx"

export default function ChallengeDetail(){
  const { id } = useParams() as { id:string }
  const [view,setView]=useState<any>()
  const [snap,setSnap]=useState<any>()
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { max } = useMaxBudget()

  useEffect(()=>{ (async()=>{
    const cid=BigInt(id)
    setView(await getChallenge(cid))
    try{ setSnap(await getSnapshot(cid)) }catch{}
  })() },[id])

  async function call(name:string, args:any[], value?:bigint){
    if(!address) throw new Error("Connect wallet")
    const sim = await simulateAndGuard({
      account: address,
      abi: ABI.ChallengePay,
      address: ADDR.ChallengePay,
      functionName: name,
      args,
      value,
      maxBudgetLCAI: max
    })
    return writeContractAsync(sim.request as any)
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Challenge #{id}</h1>
      <pre className="bg-[#14152C] p-3 rounded-lg border border-[#2a2b4d] overflow-auto">
        {JSON.stringify(view,null,2)}
      </pre>
      {snap && (
        <div className="card">
          <div className="font-medium mb-2">Snapshot</div>
          <pre>{JSON.stringify(snap,null,2)}</pre>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <button className="btn" onClick={()=>call("joinChallenge",[BigInt(id)], view?.stake ?? 0n)}>Join (pay stake)</button>
        <button className="btn" onClick={()=>call("betOn",[BigInt(id), 1], view?.stake ?? 0n)}>Bet: YES</button>
        <button className="btn" onClick={()=>call("betOn",[BigInt(id), 2], view?.stake ?? 0n)}>Bet: NO</button>
        <button className="btn" onClick={()=>call("approveChallenge",[BigInt(id), true])}>Approve</button>
        <button className="btn" onClick={()=>call("peerVote",[BigInt(id), true])}>Peer Pass</button>
        <button className="btn" onClick={()=>call("finalize",[BigInt(id)])}>Finalize</button>
        <button className="btn" onClick={()=>call("claimWinner",[BigInt(id)])}>Claim Winner</button>
        <button className="btn" onClick={()=>call("claimLoserCashback",[BigInt(id)])}>Claim Loser Cashback</button>
        <button className="btn" onClick={()=>call("claimValidator",[BigInt(id)])}>Claim Validator</button>
      </div>
      <style jsx global>{`
        .btn{background:linear-gradient(135deg,#5B4BFF,#EE11FB); padding:10px 14px; border-radius:12px;}
        .card{background:rgba(20,21,44,.7);border:1px solid #2a2b4d;padding:16px;border-radius:16px;}
      `}</style>
    </main>
  )
}
