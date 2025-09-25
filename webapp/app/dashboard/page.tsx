// webapp/app/dashboard/page.tsx
"use client"

import { useMemo, useState } from "react"
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi"
import { formatEther, parseEther } from "viem"
import { ABI, ADDR } from "../../lib/contracts"

type RowState = {
  amountInput: string
  lastTx?: `0x${string}`
  sending?: boolean
  error?: string
}

function fmtAddr(a?: `0x${string}`) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ""
}
function fmtWei(n?: bigint) {
  if (!n) return "0"
  try {
    return Number(formatEther(n)).toLocaleString(undefined, { maximumFractionDigits: 6 })
  } catch {
    return String(n)
  }
}
function rel(ts: number) {
  const now = Math.floor(Date.now() / 1000)
  const d = ts - now
  const abs = Math.abs(d)
  const unit = abs >= 86400 ? "d" : abs >= 3600 ? "h" : abs >= 60 ? "m" : "s"
  const val =
    unit === "d" ? Math.round(abs / 86400)
    : unit === "h" ? Math.round(abs / 3600)
    : unit === "m" ? Math.round(abs / 60)
    : abs
  return d >= 0 ? `in ${val}${unit}` : `${val}${unit} ago`
}
function badge(color: "green" | "amber" | "red" | "slate", text: string) {
  const bg = {
    green: "bg-green-500/15 text-green-300",
    amber: "bg-amber-500/15 text-amber-300",
    red: "bg-red-500/15 text-red-300",
    slate: "bg-white/10 text-white/80",
  }[color]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${bg}`}>
      {text}
    </span>
  )
}

export default function DashboardPage() {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [limit, setLimit] = useState(20)
  const [rows, setRows] = useState<Record<number, RowState>>({})

  // 1) Total / next id
  const { data: nextId } = useReadContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "nextChallengeIdView",
  })

  // 2) Decide which IDs to show (latest first)
  const ids = useMemo(() => {
    const n = Number(nextId ?? 0n)
    if (n <= 0) return [] as number[]
    const from = Math.max(0, n - limit)
    return Array.from({ length: n - from }, (_, i) => n - 1 - i)
  }, [nextId, limit])

  // 3) Batch read challenges & snapshots
  const { data: challengesData } = useReadContracts({
    contracts: ids.map((id) => ({
      address: ADDR.ChallengePay,
      abi: ABI.ChallengePay,
      functionName: "getChallenge",
      args: [BigInt(id)],
    })),
    allowFailure: true,
  })

  const { data: snapshotsData } = useReadContracts({
    contracts: ids.map((id) => ({
      address: ADDR.ChallengePay,
      abi: ABI.ChallengePay,
      functionName: "getSnapshot",
      args: [BigInt(id)],
    })),
    allowFailure: true,
  })

  // 4) Are we a validator?
  const { data: myStakeBn } = useReadContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "validatorStake",
    args: [address ?? ("0x0000000000000000000000000000000000000000" as `0x${string}`)],
  }) as { data?: bigint }

  const isPotentialValidator = (typeof myStakeBn === "bigint" ? myStakeBn : 0n) > 0n

  // helpers to read row state
  function getRowState(id: number): RowState {
    return rows[id] ?? { amountInput: "" }
  }
  function setRow(id: number, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...getRowState(id), ...patch } }))
  }

  async function sendTx(label: string, fn: () => Promise<`0x${string}`>, id: number) {
    try {
      setRow(id, { sending: true, error: undefined })
      const txHash = await fn()
      setRow(id, { lastTx: txHash })
    } catch (e: any) {
      setRow(id, { error: e?.shortMessage || e?.message || String(e) })
    } finally {
      setRow(id, { sending: false })
    }
  }

  function canFinalize(c: any) {
    const now = Math.floor(Date.now() / 1000)
    const status = Number(c?.status ?? 0)
    const approvalDeadline = Number(c?.approvalDeadline ?? 0)
    const startTs = Number(c?.startTs ?? 0)
    if (status === 0 /* Pending */) return now > approvalDeadline
    if (status === 2 /* Rejected */) return true
    if (status === 1 /* Approved */) return now >= startTs
    return false
  }

  return (
    <div className="space-y-4">
      <div className="section max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h1 className="h1">Challenges</h1>
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-sm">Show</span>
            <select
              className="input !w-auto"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {ids.length === 0 && (
          <div className="text-white/60">
            No challenges yet.
          </div>
        )}

        <div className="space-y-3">
          {ids.map((id, idx) => {
            const cRes = challengesData?.[idx]
            const sRes = snapshotsData?.[idx]
            const c = cRes && !cRes.error ? (cRes.result as any) : undefined
            const s = sRes && !sRes.error ? (sRes.result as any) : undefined

            const status = Number(c?.status ?? 0)
            const st = getRowState(id)

            let statusBadge = badge("slate", "Unknown")
            if (status === 0) statusBadge = badge("amber", "Pending")
            if (status === 1) statusBadge = badge("green", "Approved")
            if (status === 2) statusBadge = badge("red", "Rejected")
            if (status === 3) statusBadge = badge("green", "Finalized")

            const now = Math.floor(Date.now() / 1000)
            const approvalDeadline = Number(c?.approvalDeadline ?? 0)
            const startTs = Number(c?.startTs ?? 0)
            const canJoin = status === 1 && now < startTs
            const showFinalize = c && canFinalize(c)

            return (
              <div key={id} className="rounded-xl border border-white/10 bg-[#0f1117] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-white/70 text-sm">#{id}</div>
                    {statusBadge}
                    {status === 3 && s?.success === true && badge("green", "Success")}
                    {status === 3 && s?.success === false && badge("red", "Fail")}
                    {c?.proofRequired &&
                      badge(c?.proofOk ? "green" : "amber", c?.proofOk ? "Proof OK" : "Proof req.")}
                    {Number(c?.peerApprovalsNeeded ?? 0) > 0 &&
                      badge(
                        "slate",
                        `Peer ${Number(c?.peerApprovals ?? 0)}/${Number(c?.peerApprovalsNeeded ?? 0)}`
                      )}
                  </div>
                  <div className="text-white/50 text-sm">
                    Challenger: <span className="text-white/80">{fmtAddr(c?.challenger)}</span>
                  </div>
                </div>

                <div className="mt-3 grid md:grid-cols-5 gap-3 text-sm">
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-white/60">Approval deadline</div>
                    <div className="text-white">
                      {approvalDeadline ? new Date(approvalDeadline * 1000).toLocaleString() : "-"}
                    </div>
                    <div className="text-white/60">{approvalDeadline ? rel(approvalDeadline) : ""}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-white/60">Start time</div>
                    <div className="text-white">
                      {startTs ? new Date(startTs * 1000).toLocaleString() : "-"}
                    </div>
                    <div className="text-white/60">{startTs ? rel(startTs) : ""}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-white/60">Pools</div>
                    <div className="text-white">
                      ✅ {fmtWei(c?.poolSuccess)} / ❌ {fmtWei(c?.poolFail)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-white/60">Participants</div>
                    <div className="text-white">
                      {Number(c?.participantsCount ?? 0)} /{" "}
                      {Number(c?.maxParticipants ?? 0) === 0 ? "∞" : Number(c?.maxParticipants ?? 0)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="text-white/60">Charity</div>
                    <div className="text-white">
                      {Number(c?.charityBps ?? 0)} bps{" "}
                      {Number(c?.charityBps ?? 0) > 0 && `→ ${fmtAddr(c?.charity)}`}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {/* Left column */}
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-white/70 mb-2 text-sm">Participate</div>
                    <div className="flex items-center gap-2">
                      <input
                        className="input"
                        placeholder="Amount (LCAI)"
                        value={st.amountInput}
                        onChange={(e) => setRow(id, { amountInput: e.target.value })}
                        inputMode="decimal"
                      />
                      <button
                        className="btn btn-primary disabled:opacity-50"
                        disabled={!canJoin || st.sending || !st.amountInput}
                        onClick={() =>
                          sendTx("join", async () => {
                            const v = parseEther(st.amountInput)
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "joinChallenge",
                              args: [BigInt(id)],
                              value: v,
                            })
                          }, id)
                        }
                      >
                        Join ✅
                      </button>
                      <button
                        className="btn btn-primary disabled:opacity-50"
                        disabled={!canJoin || st.sending || !st.amountInput}
                        onClick={() =>
                          sendTx("betFail", async () => {
                            const v = parseEther(st.amountInput)
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "betOn",
                              args: [BigInt(id), 2],
                              value: v,
                            })
                          }, id)
                        }
                      >
                        Bet ❌
                      </button>
                    </div>

                    <div className="mt-3">
                      <button
                        className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 disabled:opacity-50"
                        disabled={!showFinalize || st.sending}
                        onClick={() =>
                          sendTx("finalize", async () => {
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "finalize",
                              args: [BigInt(id)],
                            })
                          }, id)
                        }
                      >
                        Finalize
                      </button>
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-white/70 mb-2 text-sm">Validator / Claims</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 disabled:opacity-50"
                        disabled={!(status === 0 && isPotentialValidator) || st.sending}
                        onClick={() =>
                          sendTx("approveYes", async () => {
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "approveChallenge",
                              args: [BigInt(id), true],
                            })
                          }, id)
                        }
                      >
                        Approve ✅
                      </button>
                      <button
                        className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 disabled:opacity-50"
                        disabled={!(status === 0 && isPotentialValidator) || st.sending}
                        onClick={() =>
                          sendTx("approveNo", async () => {
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "approveChallenge",
                              args: [BigInt(id), false],
                            })
                          }, id)
                        }
                      >
                        Reject ❌
                      </button>

                      <button
                        className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 disabled:opacity-50"
                        disabled={!(s?.set) || st.sending}
                        onClick={() =>
                          sendTx("claimWinner", async () => {
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "claimWinner",
                              args: [BigInt(id)],
                            })
                          }, id)
                        }
                      >
                        Claim Winner
                      </button>
                      <button
                        className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 disabled:opacity-50"
                        disabled={!(s?.set) || st.sending}
                        onClick={() =>
                          sendTx("claimLoserCashback", async () => {
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "claimLoserCashback",
                              args: [BigInt(id)],
                            })
                          }, id)
                        }
                      >
                        Claim Cashback
                      </button>
                      <button
                        className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2 disabled:opacity-50"
                        onClick={() =>
                          sendTx("claimValidator", async () => {
                            return await writeContractAsync({
                              address: ADDR.ChallengePay,
                              abi: ABI.ChallengePay,
                              functionName: "claimValidator",
                              args: [BigInt(id)],
                            })
                          }, id)
                        }
                      >
                        Claim Validator
                      </button>
                    </div>
                  </div>
                </div>

                {(st.lastTx || st.error) && (
                  <div className="mt-3 text-sm">
                    {st.lastTx && (
                      <div className="text-white/70">
                        Tx:{" "}
                        <a
                          className="underline"
                          href={`https://testnet.lightscan.app/tx/${st.lastTx}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {st.lastTx}
                        </a>
                      </div>
                    )}
                    {st.error && <div className="text-red-300">{st.error}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}