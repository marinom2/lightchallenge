"use client"
import { useState } from "react"
import { useAccount, useReadContract, useWriteContract } from "wagmi"
import { formatEther, parseEther } from "viem"
import { ADDR, ABI } from "@/lib/contracts"
import { useTx } from "@/lib/tx"
import { useToasts } from "@/lib/ui/toast"

export default function ValidatorsPage(){
  const { address } = useAccount()
  const who = (address || '0x0000000000000000000000000000000000000000') as `0x${string}`
  const { data: minStakeBn } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName:"minValidatorStake" })
  const { data: stakeBn } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName:"validatorStake", args:[who] })
  const { data: pendingBn } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName:"pendingUnstake", args:[who] })
  const { data: unlockAtBn } = useReadContract({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName:"pendingUnstakeUnlockAt", args:[who] })

  const { writeContractAsync, isPending } = useWriteContract()
  const { simulateAndSend } = useTx()
  const { push } = useToasts()

  const [stakeInput,setStakeInput]=useState("0.05")
  const [unstakeInput,setUnstakeInput]=useState("0.02")

  async function doStake() {
    try{
      const sim = await simulateAndSend({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName:"stakeValidator", args:[], value: parseEther(stakeInput||"0") })
      const req = sim.request as Parameters<typeof writeContractAsync>[0]
      const hash = await writeContractAsync(req); push(`stakeValidator sent: ${hash}`)
    }catch(e: unknown){ push(e instanceof Error ? e.message : "Stake failed") }
  }
  async function requestUnstake() {
    try{
      const sim = await simulateAndSend({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName:"requestUnstake", args:[parseEther(unstakeInput||"0")] })
      const req = sim.request as Parameters<typeof writeContractAsync>[0]
      const hash = await writeContractAsync(req); push(`requestUnstake sent: ${hash}`)
    }catch(e: unknown){ push(e instanceof Error ? e.message : "Request failed") }
  }
  async function withdrawUnstaked() {
    try{
      const sim = await simulateAndSend({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName:"withdrawUnstaked", args:[] })
      const req = sim.request as Parameters<typeof writeContractAsync>[0]
      const hash = await writeContractAsync(req); push(`withdrawUnstaked sent: ${hash}`)
    }catch(e: unknown){ push(e instanceof Error ? e.message : "Withdraw failed") }
  }

  return (
    <div className="container-narrow mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-semibold">Validators</h1>
      <div className="card space-y-1">
        <div>Min Stake: {minStakeBn? formatEther(minStakeBn as bigint):"-"} LCAI</div>
        <div>Your Stake: {stakeBn? formatEther(stakeBn as bigint):"-"} LCAI</div>
        <div>Pending Unstake: {pendingBn? formatEther(pendingBn as bigint):"-"} LCAI</div>
        <div>Unlock At: {unlockAtBn? new Date(Number(unlockAtBn as bigint)*1000).toLocaleString():"-"}</div>
      </div>
      <div className="card space-y-2">
        <label className="label">Stake (LCAI)</label>
        <input className="input" value={stakeInput} onChange={e=>setStakeInput(e.target.value)} />
        <button className="btn btn-primary" disabled={isPending} onClick={doStake}>Stake</button>
      </div>
      <div className="card space-y-2">
        <label className="label">Request Unstake (LCAI)</label>
        <input className="input" value={unstakeInput} onChange={e=>setUnstakeInput(e.target.value)} />
        <div className="flex gap-3">
          <button className="btn" disabled={isPending} onClick={requestUnstake}>Request Unstake</button>
          <button className="btn" disabled={isPending} onClick={withdrawUnstaked}>Withdraw Unstaked</button>
        </div>
      </div>
    </div>
  )
}