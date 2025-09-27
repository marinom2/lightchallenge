// app/challenge/[id]/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { usePublicClient, useWriteContract, useAccount } from "wagmi"
import { parseEther } from "viem"
import { ADDR, ABI } from "@/lib/contracts"
import { addressUrl, blockUrl, txUrl } from "@/lib/explorer"
import { Chip } from "@/lib/ui/Status"
import ProofPanel from "@/app/components/ProofPanel"

type Api = {
  id: string
  status: "Pending" | "Approved" | "Rejected" | "Finalized" | "Canceled" | "Paused"
  creator?: `0x${string}`
  startTs?: string
  createdBlock?: string
  createdTx?: `0x${string}`
  winnersClaimed?: number
  proofRequired?: boolean
  proofOk?: boolean
  // merged metadata from /api route (optional)
  title?: string
  description?: string
  params?: string
  category?: string
  verifier?: `0x${string}`
  timeline: {
    name: string
    label: string
    tx: `0x${string}`
    block: string | number | bigint
    timestamp?: number
  }[]
}

type ValidatorInfo = {
  snapshotSet: boolean
  isRejected: boolean
  voted: boolean
  rightSide: boolean
  alreadyClaimedFinal: boolean
  alreadyClaimedReject: boolean
  perValidatorFinal: bigint
  perValidatorReject: bigint
}

type SnapshotView = {
  set: boolean
  success: boolean
  rightSide: number
  eligibleValidators: bigint
  winnersPool: bigint
  losersPool: bigint
  loserCashback: bigint
  losersAfterCashback: bigint
  charityAmt: bigint
  daoAmt: bigint
  creatorAmt: bigint
  validatorsAmt: bigint
  perWinnerBonusX: bigint
  perLoserCashbackX: bigint
  perValidatorAmt: bigint
}

export default function ChallengeDetails() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Api | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const pc = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { address } = useAccount()

  // toasts + busy flags
  const [actBusy, setActBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // amounts
  const [joinAmt, setJoinAmt] = useState("")
  const [betAmt, setBetAmt] = useState("")
  const [betSide, setBetSide] = useState<"success" | "fail">("success")

  // on-chain enrichment
  const [peerApprovals, setPeerApprovals] = useState<number | null>(null)
  const [peerNeeded, setPeerNeeded] = useState<number | null>(null)
  const [proofRequired, setProofRequired] = useState<boolean | null>(null)
  const [proofOk, setProofOk] = useState<boolean | null>(null)
  const [adminAddr, setAdminAddr] = useState<`0x${string}` | null>(null)
  const [challenger, setChallenger] = useState<`0x${string}` | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotView | null>(null)
  const [contribSuccess, setContribSuccess] = useState<bigint | null>(null)
  const [contribFail, setContribFail] = useState<bigint | null>(null)
  const [vinfo, setVinfo] = useState<ValidatorInfo | null>(null)
  const [vinfoReason, setVinfoReason] = useState<string | null>(null)
  const [approvalDeadline, setApprovalDeadline] = useState<number | null>(null)
  const [startTs, setStartTs] = useState<number | null>(null)
  const [verifier, setVerifier] = useState<`0x${string}` | null>(null)

  // Fetch details (API)
  async function reload() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/challenge/${id}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const j = (await res.json()) as Api
      setData(j)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let stop = false
    ;(async () => {
      try { await reload() } catch (e: any) { if (!stop) setError(e?.message || String(e)) }
    })()
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Live on-chain reads (windows, peer/proof/admin/creator + snapshot + my contribs + validator info)
  useEffect(() => {
    (async () => {
      setPeerApprovals(null)
      setPeerNeeded(null)
      setProofRequired(null)
      setProofOk(null)
      setAdminAddr(null)
      setChallenger(null)
      setSnapshot(null)
      setApprovalDeadline(null)
      setStartTs(null)
      if (!pc || !data) return
      const cid = BigInt(data.id)

      try {
        const cv = await pc.readContract({
          abi: ABI.ChallengePay,
          address: ADDR.ChallengePay,
          functionName: "getChallenge",
          args: [cid],
        }) as any

        // indices: see ChallengeView in contract
        setChallenger(cv[4] as `0x${string}`)
        setApprovalDeadline(Number(cv[9] ?? 0n)) // seconds
        setStartTs(Number(cv[10] ?? 0n))         // seconds
        setPeerNeeded(Number(cv[16]))
        setPeerApprovals(Number(cv[17]))
        setProofRequired(Boolean(cv[23]))
        setVerifier(cv[24] as `0x${string}`)
        setProofOk(Boolean(cv[25]))

        try {
          const adm = await pc.readContract({
            abi: ABI.ChallengePay,
            address: ADDR.ChallengePay,
            functionName: "admin",
          }) as `0x${string}`
          setAdminAddr(adm)
        } catch {}

        const sv = await pc.readContract({
          abi: ABI.ChallengePay,
          address: ADDR.ChallengePay,
          functionName: "getSnapshot",
          args: [cid],
        }) as any
        const s: SnapshotView = {
          set: sv[0], success: sv[1], rightSide: Number(sv[2]),
          eligibleValidators: sv[3], winnersPool: sv[4], losersPool: sv[5],
          loserCashback: sv[6], losersAfterCashback: sv[7], charityAmt: sv[8],
          daoAmt: sv[9], creatorAmt: sv[10], validatorsAmt: sv[11],
          perWinnerBonusX: sv[12], perLoserCashbackX: sv[13], perValidatorAmt: sv[14],
        }
        setSnapshot(s)

        if (address) {
          const cc = await pc.readContract({
            abi: ABI.ChallengePay,
            address: ADDR.ChallengePay,
            functionName: "contribOf",
            args: [cid, address],
          }) as any
          setContribSuccess(cc[0] as bigint)
          setContribFail(cc[1] as bigint)

          const out = await pc.readContract({
            abi: ABI.ChallengePay,
            address: ADDR.ChallengePay,
            functionName: "getValidatorClaimInfo",
            args: [cid, address as `0x${string}`],
          }) as any
          const info: ValidatorInfo = {
            snapshotSet: out[0], isRejected: out[1], voted: out[2], rightSide: out[3],
            alreadyClaimedFinal: out[4], alreadyClaimedReject: out[5],
            perValidatorFinal: out[6], perValidatorReject: out[7],
          }
          setVinfo(info)

          let reason: string | null = null
          if (!info.voted) reason = "You didn't vote on this challenge."
          else if (info.snapshotSet) {
            if (!info.rightSide) reason = "Only validators on the 'right' side are eligible."
            else if (info.perValidatorFinal === 0n) reason = "No validator reward allocated in final snapshot."
            else if (info.alreadyClaimedFinal) reason = "Already claimed."
          } else if (info.isRejected) {
            if (info.perValidatorReject === 0n) reason = "Reject path has 0% allocated for validators."
            else if (info.alreadyClaimedReject) reason = "Already claimed."
          }
          setVinfoReason(reason)
        }
      } catch {
        // ignore UI reads failing
      }
    })()
  }, [pc, data, address])

  // Derived
  const createdAge = useMemo(() => {
    if (!data?.timeline?.length) return "—"
    const first = data.timeline[0]
    return timeAgo((first?.timestamp ?? 0) * 1000)
  }, [data])

  const nowSec = Math.floor(Date.now() / 1000)

  const inPendingWindow = useMemo(() => {
    if (!approvalDeadline) return true
    return nowSec < approvalDeadline
  }, [approvalDeadline, nowSec])

  const beforeStart = useMemo(() => {
    if (!startTs) return true
    return nowSec < startTs
  }, [startTs, nowSec])

  const canFinalize = useMemo(() => {
    if (!data) return false
    return data.status === "Pending" || data.status === "Approved" || data.status === "Rejected"
  }, [data])

  const isFinalized = data?.status === "Finalized"
  const isRejected = data?.status === "Rejected"

  // --- Verifier auto-detect ---------------------------------------------------
  const useAivm = !!verifier && !!ADDR.AivmProofVerifier &&
    verifier.toLowerCase() === (ADDR.AivmProofVerifier as string).toLowerCase()

  // IMPORTANT: For PLONK, the verifier used by ChallengePay should be ZkProofVerifier (adapter),
  // not the raw PlonkVerifier contract.
  const usePlonk = !!verifier && !!ADDR.ZkProofVerifier &&
    verifier.toLowerCase() === (ADDR.ZkProofVerifier as string).toLowerCase()

  const useMultiSig = !!verifier && (ADDR as any).MultiSigProofVerifier &&
    verifier.toLowerCase() === ((ADDR as any).MultiSigProofVerifier as string).toLowerCase()

  const verifierLabel = useMemo(() => {
    if (!verifier) return "—"
    if (useAivm) return "AIVM (signed inference)"
    if (usePlonk) return "ZK (PLONK)"
    if (useMultiSig) return "Multi-Sig Attestation"
    return "Custom / Unknown"
  }, [verifier, useAivm, usePlonk, useMultiSig])

  // Proof panel visibility
  const shouldShowProofPanel = useMemo(() => {
    if (!data) return false
    if (data.status !== "Approved") return false
    const required = proofRequired ?? data.proofRequired
    const ok = proofOk ?? data.proofOk
    if (required === true) return ok !== true
    if (required === false) return false
    return true
  }, [data, proofRequired, proofOk])

  // Claim eligibility
  const canClaimValidator = useMemo(() => {
    if (!vinfo) return true
    if (!vinfo.voted) return false
    if (vinfo.snapshotSet) return vinfo.rightSide && vinfo.perValidatorFinal > 0n && !vinfo.alreadyClaimedFinal
    if (vinfo.isRejected) return vinfo.perValidatorReject > 0n && !vinfo.alreadyClaimedReject
    return false
  }, [vinfo])

  const iAmAdmin = !!adminAddr && address?.toLowerCase() === adminAddr.toLowerCase()
  const iAmCreator = !!challenger && address?.toLowerCase() === challenger.toLowerCase()

  // Payout previews
  const winnerPrincipal = useMemo(() => {
    if (!snapshot || contribSuccess == null || contribFail == null) return 0n
    return snapshot.success ? contribSuccess : contribFail
  }, [snapshot, contribSuccess, contribFail])

  const loserPrincipal = useMemo(() => {
    if (!snapshot || contribSuccess == null || contribFail == null) return 0n
    return snapshot.success ? contribFail : contribSuccess
  }, [snapshot, contribSuccess, contribFail])

  const winnerBonus = useMemo(() => {
    if (!snapshot?.set || snapshot.perWinnerBonusX === 0n) return 0n
    return (winnerPrincipal * snapshot.perWinnerBonusX) / 1000000000000000000n
  }, [snapshot, winnerPrincipal])

  const loserCashback = useMemo(() => {
    if (!snapshot?.set || snapshot.perLoserCashbackX === 0n) return 0n
    return (loserPrincipal * snapshot.perLoserCashbackX) / 1000000000000000000n
  }, [snapshot, loserPrincipal])

  // ── Actions (tx helpers) ───────────────────────────────────────────────────
  async function tx<T extends { functionName: any; args?: any; value?: bigint }>(
    label: string,
    input: T
  ) {
    try {
      if (!pc) throw new Error("No public client")
      setActBusy(label)
      const hash = await writeContractAsync({
        abi: ABI.ChallengePay,
        address: ADDR.ChallengePay,
        ...input,
      })
      setToast(`${label} sent: ${short(hash)}`)
      const receipt = await pc.waitForTransactionReceipt({ hash })
      if (receipt.status !== "success") setToast(`${label} reverted`)
      await reload()
    } catch (e: any) {
      setToast(parseErr(e))
    } finally {
      setActBusy(null)
    }
  }

  // finalize/claims
  const onFinalize = () => data && tx("finalize", { functionName: "finalize", args: [BigInt(data.id)] })
  const onClaimWinner = () => data && tx("claim-winner", { functionName: "claimWinner", args: [BigInt(data.id)] })
  const onClaimLoser = () => data && tx("claim-loser", { functionName: "claimLoserCashback", args: [BigInt(data.id)] })
  const onClaimValidator = () => data && tx("claim-validator", { functionName: "claimValidator", args: [BigInt(data.id)] })
  const onClaimRejectContribution = () => data && tx("claim-reject-contrib", { functionName: "claimRejectContribution", args: [BigInt(data.id)] })
  const onClaimRejectCreator = () => data && tx("claim-reject-creator", { functionName: "claimRejectCreator", args: [BigInt(data.id)] })

  // validator vote (approval)
  const onValidatorApprove = (yes: boolean) =>
    data && tx(yes ? "approve-yes" : "approve-no", { functionName: "approveChallenge", args: [BigInt(data.id), yes] })

  // peer vote (after start)
  const onPeerVote = (pass: boolean) =>
    data && tx(pass ? "peer-pass" : "peer-fail", { functionName: "peerVote", args: [BigInt(data.id), pass] })

  // admin ops
  const onPause = (paused: boolean) =>
    data && tx(paused ? "pause" : "unpause", { functionName: "setPaused", args: [BigInt(data.id), paused] })
  const onCancel = () =>
    data && tx("cancel", { functionName: "cancelChallenge", args: [BigInt(data.id)] })

  // join / bet (native)
  const onJoin = () => {
    if (!data) return
    const value = safeParseEther(joinAmt)
    if (value === null) { setToast("Enter a valid amount"); return }
    tx("join", { functionName: "joinChallenge", args: [BigInt(data.id)], value })
  }
  const onBet = () => {
    if (!data) return
    const value = safeParseEther(betAmt)
    if (value === null) { setToast("Enter a valid amount"); return }
    const outcome = betSide === "success" ? 1 : 2 // Outcome enum: Success=1, Fail=2
    tx("bet", { functionName: "betOn", args: [BigInt(data.id), outcome], value })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="container-narrow mx-auto py-10 text-white/70">Loading challenge…</div>
  if (error)   return <div className="container-narrow mx-auto py-10 text-red-300">{error}</div>
  if (!data)   return null

  const joinEnabled = data.status === "Approved" && beforeStart
  const betEnabled  = data.status === "Approved" && beforeStart
  const peerVoteEnabled = data.status === "Approved" && !beforeStart
  const canApproveVote = data.status === "Pending" && inPendingWindow

  // prefer on-chain verifier for ProofPanel; fall back to off-chain if available
  const effectiveVerifier = verifier ?? (data.verifier as `0x${string}` | undefined) ?? null

  return (
    <div className="container-narrow mx-auto py-8 space-y-8">
      {/* Toast */}
      {toast && (
        <div className="mx-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
          {toast}
          <button className="ml-2 underline text-white/60" onClick={()=>setToast(null)}>dismiss</button>
        </div>
      )}

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-[--lc-grad-1]/25 via-[#8a3ffc22] to-[--lc-grad-2]/25 p-5 sm:p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-sm text-white/60">Challenge</div>
            <h1 className="text-3xl font-semibold leading-tight">
              {data.title ? data.title : `#${data.id}`}
            </h1>
            <div className="text-xs text-white/70 mt-1">
              {data.title ? <>#{data.id} • </> : null}
              Created {createdAge}
              {data.createdBlock && <> • Block&nbsp;
                <a className="underline" href={blockUrl(data.createdBlock)} target="_blank" rel="noreferrer">
                  {data.createdBlock}
                </a></>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.category && <span className="badge">{data.category}</span>}
            <Chip color={statusColor(data.status)}>{data.status}</Chip>
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ backgroundImage: "radial-gradient(1200px 600px at 120% -20%, rgba(255,255,255,.25), transparent 55%)" }}
        />
      </div>

      {/* Details (off-chain metadata) */}
      {(data.title || data.description || data.params || data.category) && (
        <div className="panel">
          <div className="panel-header">
            <div className="font-semibold">Details</div>
          </div>
          <div className="panel-body grid gap-3 text-sm">
            {data.description && (
              <div>
                <div className="text-white/60 text-xs mb-1">Description</div>
                <div className="whitespace-pre-wrap">{data.description}</div>
              </div>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.params && <Fact label="Rules / Params">{data.params}</Fact>}
              {data.category && <Fact label="Category">{data.category}</Fact>}
              {effectiveVerifier && (
                <Fact label="Verifier">
                  <a className="underline" href={addressUrl(effectiveVerifier)} target="_blank" rel="noreferrer">
                    {short(effectiveVerifier)}
                  </a>
                </Fact>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Facts */}
      <div className="panel">
        <div className="panel-body grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <Fact label="Creator">
            {data.creator
              ? <a className="underline" href={addressUrl(data.creator)} target="_blank" rel="noreferrer">
                  {short(data.creator)}
                </a>
              : "—"}
          </Fact>
          <Fact label="Start time (if any)">
            {data.startTs ? dateish(Number(data.startTs) * 1000) : "—"}
          </Fact>
          <Fact label="Winners claimed">{data.winnersClaimed ?? 0}</Fact>
          <Fact label="Created tx">
            {data.createdTx
              ? <a className="underline" href={txUrl(data.createdTx)} target="_blank" rel="noreferrer">
                  {data.createdTx.slice(0, 12)}…
                </a>
              : "—"}
          </Fact>
          <Fact label="Proof">
            {proofRequired === false || data.proofRequired === false
              ? "Not required"
              : (proofOk || data.proofOk) ? "Provided ✓" : "Required (not yet OK)"}
          </Fact>
        </div>
      </div>

      {/* Peer/proof + windows */}
      {(peerNeeded !== null || proofRequired !== null || approvalDeadline || startTs) && (
        <div className="panel">
          <div className="panel-body flex flex-wrap items-center gap-4 text-sm">
            {peerNeeded !== null && (
              <div className="flex items-center gap-2">
                <span className="badge">Peers</span>
                <span className="text-white/80">{peerApprovals ?? 0}/{peerNeeded}</span>
              </div>
            )}
            {proofRequired !== null && (
              <div className="flex items-center gap-2">
                <span className="badge">Proof</span>
                <span className="text-white/80">
                  {proofRequired ? (proofOk ? "OK ✓" : "Required") : "Not required"}
                </span>
              </div>
            )}
            {approvalDeadline ? (
              <div className="flex items-center gap-2">
                <span className="badge">Approve window</span>
                <span className="text-white/80">{nowSec < approvalDeadline ? "open" : "closed"}</span>
              </div>
            ) : null}
            {startTs ? (
              <div className="flex items-center gap-2">
                <span className="badge">Join window</span>
                <span className="text-white/80">{beforeStart ? "open" : "closed"}</span>
              </div>
            ) : null}
            {challenger && (
              <div className="ml-auto text-xs text-white/60">
                Creator: <a className="underline" href={addressUrl(challenger)} target="_blank" rel="noreferrer">{short(challenger)}</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* You mini-cards */}
      {(address || snapshot?.set) && (
        <div className="panel">
          <div className="panel-header"><div className="font-semibold">You</div></div>
          <div className="panel-body grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            <MiniCard label="Your success contributions">{fmt(contribSuccess)} LCAI</MiniCard>
            <MiniCard label="Your fail contributions">{fmt(contribFail)} LCAI</MiniCard>
            {snapshot?.set ? (
              <>
                <MiniCard label="Winner bonus (preview)">{fmt(winnerBonus)} LCAI</MiniCard>
                <MiniCard label="Loser cashback (preview)">{fmt(loserCashback)} LCAI</MiniCard>
                <MiniCard label="Validator reward (final)">{vinfo?.perValidatorFinal ? fmt(vinfo.perValidatorFinal) : "—"} LCAI</MiniCard>
                <MiniCard label="Validator reward (reject)">{vinfo?.perValidatorReject ? fmt(vinfo.perValidatorReject) : "—"} LCAI</MiniCard>
              </>
            ) : isRejected ? (
              <MiniCard label="Reject path">
                {iAmCreator ? "Creator + contributor claims available" : "Contributor refund available"}
              </MiniCard>
            ) : null}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="panel">
        <div className="panel-header">
          <div className="font-semibold text-lg">Status timeline</div>
        </div>
        <div className="panel-body">
          {data.timeline.length === 0 ? (
            <div className="text-white/60 text-sm">No events found for this challenge.</div>
          ) : (
            <div className="space-y-2">
              {data.timeline.map((t) => (
                <div key={`${t.tx}-${t.block}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-block rounded-md border border-white/10 bg-white/10 px-2 py-0.5 text-xs">{t.name}</span>
                    <div className="text-sm">{t.label}</div>
                    <div className="text-xs text-white/60">{t.timestamp ? timeAgo(t.timestamp * 1000) : "—"}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <a className="underline" href={blockUrl(t.block)} target="_blank" rel="noreferrer">Block {String(t.block)}</a>
                    <span className="text-white/40">•</span>
                    <a className="underline" href={txUrl(t.tx)} target="_blank" rel="noreferrer">{(t.tx as string).slice(0, 12)}…</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Proof panel (auto-detected) */}
      {shouldShowProofPanel && effectiveVerifier && (
        <div className="panel">
          <div className="panel-header">
            <div className="font-semibold">Submit Proof</div>
            <div className="text-xs text-white/60">
              Verifier: <code className="break-all">{effectiveVerifier}</code> · <span>{verifierLabel}</span>
            </div>
          </div>
          <div className="panel-body space-y-3">
            {/* Only render ProofPanel when a user needs to paste/submit something */}
            {(useAivm || usePlonk) && (
              <ProofPanel
                id={BigInt(data.id)}
                verifier={effectiveVerifier}
                requireAivm={useAivm}
                requireZk={usePlonk}
              />
            )}

            {/* Multi-Sig has nothing for the user to paste — show guidance instead */}
            {useMultiSig && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                This challenge uses a <span className="font-medium">Multi-Sig attestation</span>.
                There’s no proof to submit here. Once the required signers attest off-chain,
                the contract will accept it during finalize/claims.
              </div>
            )}

            {/* Unknown verifier note */}
            {!useAivm && !usePlonk && !useMultiSig && (
              <div className="text-xs text-amber-300">
                Unknown verifier; please check your deployment config.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interact: Join / Bet / Peer / Approvals */}
      <div className="panel">
        <div className="panel-header"><div className="font-semibold">Participate</div></div>
        <div className="panel-body space-y-3">
          {/* Join */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm font-medium">Join (success pool)</div>
            <div className="mt-2 flex gap-2">
              <input className="input" placeholder="Amount (LCAI)" value={joinAmt} onChange={(e)=>setJoinAmt(e.target.value)} />
              <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                onClick={onJoin} disabled={!joinEnabled || actBusy === "join"}
                title={joinEnabled ? "Join before start" : "Join window closed or not approved"}>
                {actBusy === "join" ? "Submitting…" : "Join"}
              </button>
            </div>
            <div className="mt-1 text-xs text-white/60">Native LCAI; funds go to Success side.</div>
          </div>

          {/* Bet */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm font-medium">Bet</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="input w-[150px]" value={betSide} onChange={(e)=>setBetSide(e.target.value as any)}>
                <option value="success">Success</option>
                <option value="fail">Fail</option>
              </select>
              <input className="input" placeholder="Amount (LCAI)" value={betAmt} onChange={(e)=>setBetAmt(e.target.value)} />
              <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                onClick={onBet} disabled={!betEnabled || actBusy === "bet"}
                title={betEnabled ? "Bet before start" : "Join window closed or not approved"}>
                {actBusy === "bet" ? "Submitting…" : "Place bet"}
              </button>
            </div>
          </div>

          {/* Peer vote */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm font-medium">Peer vote</div>
            <div className="mt-2 flex gap-2">
              <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                onClick={()=>onPeerVote(true)} disabled={!peerVoteEnabled || actBusy === "peer-pass"}
                title={peerVoteEnabled ? "If you are a peer, vote after start" : "Available after start if you are a peer"}>
                {actBusy === "peer-pass" ? "Submitting…" : "Pass"}
              </button>
              <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                onClick={()=>onPeerVote(false)} disabled={!peerVoteEnabled || actBusy === "peer-fail"}>
                {actBusy === "peer-fail" ? "Submitting…" : "Fail"}
              </button>
            </div>
            <div className="mt-1 text-xs text-white/60">Contract will revert if you’re not an assigned peer.</div>
          </div>

          {/* Validator approvals */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-sm font-medium">Validator approval</div>
            <div className="mt-2 flex gap-2">
              <button className="btn bg-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-50"
                onClick={()=>onValidatorApprove(true)} disabled={!canApproveVote || actBusy === "approve-yes"}>
                {actBusy === "approve-yes" ? "Submitting…" : "Approve (Yes)"}
              </button>
              <button className="btn bg-rose-500/20 hover:bg-rose-500/25 disabled:opacity-50"
                onClick={()=>onValidatorApprove(false)} disabled={!canApproveVote || actBusy === "approve-no"}>
                {actBusy === "approve-no" ? "Submitting…" : "Reject (No)"}
              </button>
            </div>
            <div className="mt-1 text-xs text-white/60">
              Must be a validator (staked ≥ min stake) and vote before approval deadline.
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="panel">
        <div className="panel-header"><div className="font-semibold">Actions</div></div>
        <div className="panel-body space-y-2">
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
              onClick={onFinalize} disabled={!canFinalize || actBusy === "finalize"}
              title={canFinalize ? "Finalize this challenge" : "Not finalizable now"}>
              {actBusy === "finalize" ? "Finalizing…" : "Finalize"}
            </button>

            <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
              onClick={onClaimWinner} disabled={actBusy === "claim-winner" || !isFinalized}
              title={!isFinalized ? "Available after finalize (snapshot path)" : undefined}>
              {actBusy === "claim-winner" ? "Claiming…" : "Claim winner"}
            </button>

            <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
              onClick={onClaimLoser} disabled={actBusy === "claim-loser" || !isFinalized}
              title={!isFinalized ? "Available after finalize (snapshot path)" : undefined}>
              {actBusy === "claim-loser" ? "Claiming…" : "Claim loser cashback"}
            </button>

            <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
              onClick={onClaimValidator} disabled={actBusy === "claim-validator" || !canClaimValidator}
              title={vinfoReason ?? undefined}>
              {actBusy === "claim-validator" ? "Claiming…" : "Claim validator"}
            </button>

            {/* Reject-path contributor & creator claims */}
            {isRejected && (
              <>
                <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                  onClick={onClaimRejectContribution}
                  disabled={actBusy === "claim-reject-contrib"}>
                  {actBusy === "claim-reject-contrib" ? "Claiming…" : "Claim contribution (reject)"}
                </button>
                {iAmCreator && (
                  <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                    onClick={onClaimRejectCreator}
                    disabled={actBusy === "claim-reject-creator"}>
                    {actBusy === "claim-reject-creator" ? "Claiming…" : "Claim creator (reject)"}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Admin controls */}
          {iAmAdmin && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="text-xs text-white/60 mb-2">Admin</div>
              <div className="flex flex-wrap gap-2">
                <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                  onClick={()=>onPause(true)} disabled={actBusy === "pause"}>
                  {actBusy === "pause" ? "Pausing…" : "Pause"}
                </button>
                <button className="btn bg-white/10 hover:bg-white/15 disabled:opacity-50"
                  onClick={()=>onPause(false)} disabled={actBusy === "unpause"}>
                  {actBusy === "unpause" ? "Unpausing…" : "Unpause"}
                </button>
                <button className="btn bg-rose-500/20 hover:bg-rose-500/25 disabled:opacity-50"
                  onClick={onCancel} disabled={actBusy === "cancel"}>
                  {actBusy === "cancel" ? "Canceling…" : "Cancel challenge"}
                </button>
              </div>
            </div>
          )}

          {vinfoReason && (
            <div className="text-xs text-white/60">{vinfoReason}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* helpers */
function MiniCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-white/50">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
function statusColor(s: Api["status"]) {
  switch (s) {
    case "Approved": return "bg-emerald-500/20"
    case "Rejected": return "bg-rose-500/20"
    case "Finalized": return "bg-indigo-500/20"
    case "Canceled": return "bg-amber-500/20"
    case "Paused": return "bg-sky-500/20"
    default: return "bg-amber-500/20"
  }
}
function timeAgo(ms: number) {
  if (!ms) return "—"
  const sec = Math.max(1, Math.floor((Date.now() - ms) / 1000))
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec/60); if (m<60) return `${m}m ago`
  const h = Math.floor(m/60); if (h<48) return `${h}h ago`
  const d = Math.floor(h/24); return `${d}d ago`
}
function dateish(ms: number) { try { return new Date(ms).toLocaleString() } catch { return "—" } }
function short(a: string) { return `${a.slice(0,6)}…${a.slice(-4)}` }
function fmt(v?: bigint | null) { if (v == null) return "0"; return (Number(v) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 }) }
function safeParseEther(s: string): bigint | null { try { const v = s.trim(); if (!v) return null; return parseEther(v as `${number}`) } catch { return null } }
function parseErr(e: any): string {
  const msg = e?.shortMessage || e?.message || String(e)
  if (msg.match(/ProofNotSet/)) return "This challenge doesn’t require a proof (or verifier not set)."
  if (msg.match(/PeersNotMet/)) return "Peer approvals not met yet."
  if (msg.match(/BeforeDeadline/)) return "Still before approval deadline."
  if (msg.match(/JoinWindowClosed/)) return "Join/bet window closed."
  if (msg.match(/NotApproved/)) return "Challenge must be Approved to join/bet."
  if (msg.match(/NotEligible/)) return "Not eligible for this claim."
  if (msg.match(/AlreadyClaimed/)) return "Already claimed."
  if (msg.match(/no reject share/i)) return "Reject path has 0% allocated for validators."
  if (msg.match(/NotValidator/)) return "Requires validator stake ≥ min stake."
  if (msg.match(/PausedOrCanceled/)) return "Challenge is paused or canceled."
  if (msg.match(/WrongMsgValue/)) return "Amount must be > 0."
  return msg
}