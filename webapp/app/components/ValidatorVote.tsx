// components/ValidatorVote.tsx
"use client";
import { useWriteContract } from "wagmi";
import { ABI, ADDR } from "@/lib/contracts";
export function ValidatorVote({ id, canVote, minStakeMet, alreadyVoted, deadlinePassed }:{
  id: bigint; canVote:boolean; minStakeMet:boolean; alreadyVoted:boolean; deadlinePassed:boolean;
}) {
  const { writeContractAsync } = useWriteContract();
  const disabled = !canVote || !minStakeMet || alreadyVoted || deadlinePassed;
  async function cast(yes:boolean){
    await writeContractAsync({ abi: ABI.ChallengePay, address: ADDR.ChallengePay, functionName: "approveChallenge", args: [id, yes] });
  }
  return (
    <div className="rounded-2xl p-4 border border-white/10 space-y-2">
      <div className="text-sm font-semibold">Validator vote</div>
      <div className="flex gap-2">
        <button disabled={disabled} onClick={()=>cast(true)} className="px-3 py-2 rounded-xl bg-white/10">Approve</button>
        <button disabled={disabled} onClick={()=>cast(false)} className="px-3 py-2 rounded-xl bg-white/10">Reject</button>
      </div>
      {!minStakeMet && <div className="text-xs text-yellow-400 mt-1">Stake ≥ min required.</div>}
      {alreadyVoted && <div className="text-xs text-white/60">You already voted.</div>}
    </div>
  );
}