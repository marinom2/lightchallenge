// webapp/app/challenges/create/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  useAccount,
  useConnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi"
import { parseEther } from "viem"
import { ABI, ADDR } from "../../../lib/contracts"

type Draft = {
  title: string
  steps: string
  days: string
  stake: string
  maxParticipants: string
}

function useDraft(key = "lc_create_draft_v2") {
  const [draft, setDraft] = useState<Draft>({
    title: "",
    steps: "5000",
    days: "5",
    stake: "0.02",
    maxParticipants: "100",
  })
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) setDraft(JSON.parse(raw))
    } catch {}
  }, [key])
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(draft))
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [draft, key])
  return { draft, setDraft }
}

function fmtValue(v: bigint) {
  return Number(v) / 1e18
}

export default function CreatePage() {
  const { isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { writeContractAsync, data: hash, error, isPending } = useWriteContract()
  const { isSuccess: mined } = useWaitForTransactionReceipt({ hash })
  const { draft, setDraft } = useDraft()
  const [showSummary, setShowSummary] = useState(false)

  // Read approvalLeadTime from chain (authoritative)
  const { data: leadBn } = useReadContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "approvalLeadTime",
  })
  const approvalLeadTime = Number(leadBn ?? 0n) // seconds

  // Parse stake
  const value = useMemo(() => {
    try { return parseEther(draft.stake || "0") } catch { return 0n }
  }, [draft.stake])

  // Compute timestamps (client-side)
  const now = Math.floor(Date.now() / 1000)
  const days = Math.max(1, Math.min(30, Number(draft.days || "0")))
  const startTs = now + days * 24 * 3600
  const approvalDeadline = now + Math.min(24 * 3600, Math.max(300, Math.floor(days * 24 * 3600 * 0.25))) // ~25% of window, capped 24h

  // Validation
  const stakeOk = value > 0n
  const leadOk  = startTs >= now + approvalLeadTime
  const deadlineOk = approvalDeadline < startTs
  const stepsOk = Number(draft.steps) > 0
  const mp = Number.isFinite(Number(draft.maxParticipants)) ? Number(draft.maxParticipants) : NaN
  const maxPartOk = !Number.isNaN(mp) && mp >= 0 && mp <= 1000000

  const canSubmit = stakeOk && leadOk && deadlineOk && stepsOk && maxPartOk

  // Precomputed tx input for the summary / submit
  const txInput = useMemo(() => {
    const challenge = {
      kind: 1,
      currency: 0,
      token: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      stakeAmount: value,
      proposalBond: 0n,
      approvalDeadline: BigInt(approvalDeadline),
      startTs: BigInt(startTs),
      maxParticipants: BigInt(Number(draft.maxParticipants || "0")),
      peers: [] as `0x${string}`[],
      peerApprovalsNeeded: 0,
      charityBps: 0,
      charity: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      proofRequired: true,
      verifier: ADDR.ZkProofVerifier,
    }
    return { challenge, value }
  }, [value, approvalDeadline, startTs, draft.maxParticipants])

  async function ensureConnectedThen(cb: () => Promise<void>) {
    if (isConnected) return cb()
    const injected = connectors.find((c) => c.type === "injected")
    if (injected) {
      await connect({ connector: injected })
      return cb()
    }
    const wc = connectors.find((c) => c.type === "walletConnect")
    if (wc) {
      await connect({ connector: wc })
      return cb()
    }
    throw new Error("No wallet connectors available.")
  }

  function helperText() {
    if (!stakeOk) return "Enter a positive stake."
    if (!leadOk) return `Start must be ≥ now + approval lead time (${Math.ceil(approvalLeadTime/3600)}h).`
    if (!deadlineOk) return "Approval deadline must be before start."
    if (!stepsOk) return "Daily steps must be > 0."
    if (!maxPartOk) return "Max participants must be 0 (unlimited) or a positive integer."
    return ""
  }

  async function onOpenSummary() {
    if (!canSubmit) return
    setShowSummary(true)
  }

  async function onConfirmSubmit() {
    setShowSummary(false)
    await ensureConnectedThen(async () => {
      await writeContractAsync({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay,
        functionName: "createChallenge",
        args: [txInput.challenge],
        value: txInput.value,
      })
    })
  }

  const exUrl = hash ? `https://testnet.lightscan.app/tx/${hash}` : undefined

  return (
    <div className="space-y-4">
      <div className="section max-w-2xl mx-auto space-y-4">
        <h1 className="h1">Create Challenge</h1>

        <label className="label">Title</label>
        <input
          className="input"
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />

        <label className="label">Daily Steps Target</label>
        <input
          className="input"
          placeholder="Daily Steps Target"
          value={draft.steps}
          onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
          inputMode="numeric"
        />

        <label className="label">Days (1–30)</label>
        <input
          className="input"
          placeholder="Days"
          value={draft.days}
          onChange={(e) => setDraft({ ...draft, days: e.target.value })}
          inputMode="numeric"
        />

        <label className="label">Max participants (0 = unlimited)</label>
        <input
          className="input"
          placeholder="100"
          value={draft.maxParticipants}
          onChange={(e) => setDraft({ ...draft, maxParticipants: e.target.value })}
          inputMode="numeric"
        />

        <label className="label">Stake (LCAI)</label>
        <input
          className="input"
          placeholder="0.02"
          value={draft.stake}
          onChange={(e) => setDraft({ ...draft, stake: e.target.value })}
          inputMode="decimal"
        />

        {/* Inline helper/validation */}
        {!canSubmit && (
          <div className="text-amber-300/90 text-sm">{helperText()}</div>
        )}

        <button
          className="btn btn-primary w-full disabled:opacity-50"
          disabled={!canSubmit || isPending}
          onClick={onOpenSummary}
        >
          {isPending ? "Sending…" : "Review & Create"}
        </button>

        {hash && (
          <div className="text-white/70 text-sm">
            Sent:{" "}
            <a className="underline" href={exUrl} target="_blank" rel="noreferrer">
              {hash}
            </a>
            {mined && " — confirmed ✅"}
          </div>
        )}
        {error && (
          <div className="text-red-300 text-sm">
            {String((error as any)?.shortMessage || (error as any)?.message || error)}
          </div>
        )}
        {!isConnected && (
          <div className="text-white/60 text-sm">
            You’ll be prompted to connect a wallet before submitting.
          </div>
        )}

        {/* Chain guard display (read-only) */}
        <div className="text-white/50 text-xs">
          Approval lead time (chain): {Math.ceil(approvalLeadTime/3600)}h
        </div>
      </div>

      {/* Summary Modal */}
      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1117] p-5">
            <h3 className="text-lg font-semibold mb-3">Confirm Transaction</h3>
            <div className="space-y-2 text-sm text-white/85">
              <div>
                <div className="text-white/60">Contract</div>
                <div className="break-all">{ADDR.ChallengePay}</div>
              </div>
              <div>
                <div className="text-white/60">Function</div>
                <div>createChallenge(CreateParams)</div>
              </div>
              <div>
                <div className="text-white/60">Value (LCAI)</div>
                <div>{fmtValue(txInput.value)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-white/60">Approval deadline</div>
                  <div>{new Date(approvalDeadline*1000).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-white/60">Start</div>
                  <div>{new Date(startTs*1000).toLocaleString()}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-2"
                onClick={() => setShowSummary(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary disabled:opacity-50"
                disabled={!canSubmit}
                onClick={onConfirmSubmit}
              >
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}