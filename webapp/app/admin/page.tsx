"use client"

import { useState } from "react"
import { useAccount, useReadContract, useWriteContract } from "wagmi"
import { parseEther } from "viem"
import { ADDR, ABI } from "@/lib/contracts"
import { useTx } from "@/lib/tx"
import { useToasts } from "@/lib/ui/toast"

function Input({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function AdminPage() {
  // Only light hooks in the gate
  const { address } = useAccount()
  const { data: owner } = useReadContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "admin", 
  })
  const isOwner = !!owner && !!address && (owner as string).toLowerCase() === address.toLowerCase()
  if (!isOwner) return <div className="container-narrow mx-auto px-4 py-8">Not authorized.</div>
  return <AdminBody />
}

function AdminBody() {
  const { writeContractAsync, isPending } = useWriteContract()
  const { simulateAndSend } = useTx()
  const { push } = useToasts()

  // DAO
  const [dao, setDao] = useState<string>("0x")

  // Fee caps
  const [losersFeeMaxBps, setLFM] = useState<string>("5000")
  const [charityMaxBps, setCM] = useState<string>("1000")
  const [loserCashbackMaxBps, setLCM] = useState<string>("1000")

  // Fee config
  const [losersFeeBps, setLFB] = useState<string>("200")
  const [daoBps, setDB] = useState<string>("200")
  const [creatorBps, setCB] = useState<string>("0")
  const [validatorsBps, setVB] = useState<string>("200")
  const [rejectFeeBps, setRFB] = useState<string>("0")
  const [rejectDaoBps, setRDB] = useState<string>("0")
  const [rejectValidatorsBps, setRVB] = useState<string>("0")
  const [loserCashbackBps, setLCB] = useState<string>("100")

  // Validator params
  const [minStake, setMinStake] = useState<string>("0.1")
  const [thresholdBps, setThr] = useState<string>("6600")
  const [quorumBps, setQuo] = useState<string>("5000")
  const [cooldownSec, setCd] = useState<string>("86400")

  // Misc per-challenge
  const [leadSec, setLead] = useState<string>("3600")
  const [chId, setChId] = useState<string>("1")
  const [pause, setPause] = useState<boolean>(false)
  const [proofReq, setProofReq] = useState<boolean>(true)
  const [verifier, setVerifier] = useState<string>(ADDR.ZkProofVerifier ?? "0x0000000000000000000000000000000000000000")

  async function send(req: Parameters<typeof simulateAndSend>[0], label: string) {
    try {
      const sim = await simulateAndSend(req)
      const reqForWrite = sim.request as Parameters<typeof writeContractAsync>[0]
      const hash = await writeContractAsync(reqForWrite)
      push(`${label} sent: ${hash}`)
    } catch (e: unknown) {
      push(e instanceof Error ? e.message : "Tx failed")
    }
  }

  return (
    <div className="container-narrow mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      {/* DAO */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">DAO Treasury</h2>
        <Input label="DAO Address" value={dao} onChange={setDao} />
        <button className="btn btn-primary" disabled={isPending} onClick={() =>
          send({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "setDaoTreasury", args: [dao as `0x${string}`] }, "setDaoTreasury")
        }>Set DAO</button>
      </div>

      {/* Fee Caps */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Fee Caps</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Input label="losersFeeMaxBps" value={losersFeeMaxBps} onChange={setLFM} />
          <Input label="charityMaxBps" value={charityMaxBps} onChange={setCM} />
          <Input label="loserCashbackMaxBps" value={loserCashbackMaxBps} onChange={setLCM} />
        </div>
        <button className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={() =>
          send({
            address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "setFeeCaps",
            args: [{ losersFeeMaxBps: Number(losersFeeMaxBps), charityMaxBps: Number(charityMaxBps), loserCashbackMaxBps: Number(loserCashbackMaxBps) }]
          }, "setFeeCaps")
        }>Update Caps</button>
      </div>

      {/* Fee Config */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Fee Config</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <Input label="losersFeeBps" value={losersFeeBps} onChange={setLFB} />
          <Input label="daoBps" value={daoBps} onChange={setDB} />
          <Input label="creatorBps" value={creatorBps} onChange={setCB} />
          <Input label="validatorsBps" value={validatorsBps} onChange={setVB} />
          <Input label="rejectFeeBps" value={rejectFeeBps} onChange={setRFB} />
          <Input label="rejectDaoBps" value={rejectDaoBps} onChange={setRDB} />
          <Input label="rejectValidatorsBps" value={rejectValidatorsBps} onChange={setRVB} />
          <Input label="loserCashbackBps" value={loserCashbackBps} onChange={setLCB} />
        </div>
        <button className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={() =>
          send({
            address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "setFeeConfig",
            args: [{
              losersFeeBps: Number(losersFeeBps), daoBps: Number(daoBps), creatorBps: Number(creatorBps),
              validatorsBps: Number(validatorsBps), rejectFeeBps: Number(rejectFeeBps),
              rejectDaoBps: Number(rejectDaoBps), rejectValidatorsBps: Number(rejectValidatorsBps),
              loserCashbackBps: Number(loserCashbackBps),
            }]
          }, "setFeeConfig")
        }>Update FeeConfig</button>
      </div>

      {/* Validator params */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Validator Params</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <Input label="minStake (LCAI)" value={minStake} onChange={setMinStake} />
          <Input label="thresholdBps" value={thresholdBps} onChange={setThr} />
          <Input label="quorumBps" value={quorumBps} onChange={setQuo} />
          <Input label="cooldownSec" value={cooldownSec} onChange={setCd} />
        </div>
        <button className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={() =>
          send({
            address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "setValidatorParams",
            args: [parseEther(minStake || "0"), BigInt(thresholdBps), BigInt(quorumBps), BigInt(cooldownSec)]
          }, "setValidatorParams")
        }>Update Validator Params</button>
      </div>

      {/* Approval lead */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Approval Lead Time</h2>
        <Input label="lead seconds" value={leadSec} onChange={setLead} />
        <button className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={() =>
          send({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "setApprovalLeadTime", args: [BigInt(leadSec)] }, "setApprovalLeadTime")
        }>Set Lead</button>
      </div>

      {/* Per-challenge controls */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Per-Challenge Controls</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <Input label="Challenge ID" value={chId} onChange={setChId} />
          <div>
            <label className="label">Pause?</label>
            <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} />
          </div>
          <div>
            <label className="label">Proof required?</label>
            <input type="checkbox" checked={proofReq} onChange={(e) => setProofReq(e.target.checked)} />
          </div>
        </div>
        <Input label="Verifier address" value={verifier} onChange={setVerifier} />
        <div className="flex gap-3 flex-wrap">
          <button className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={() =>
            send({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "pauseChallenge", args: [BigInt(chId), pause] }, "pauseChallenge")
          }>Pause/Unpause</button>
          <button className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={() =>
            send({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "cancelChallenge", args: [BigInt(chId)] }, "cancelChallenge")
          }>Cancel</button>
          <button className="btn bg-white/10 hover:bg-white/20" disabled={isPending} onClick={() =>
            send({ address: ADDR.ChallengePay, abi: ABI.ChallengePay, functionName: "setProofConfig",
              args: [BigInt(chId), proofReq, verifier as `0x${string}`] }, "setProofConfig")
          }>Set Proof Config</button>
        </div>
      </div>

      <p className="text-white/50 text-xs">Owner-only. Transactions revert if not authorized.</p>
    </div>
  )
}