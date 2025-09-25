#!/usr/bin/env bash
set -euo pipefail

# Ensure folders
mkdir -p app/components app/challenges/create app/proofs/submit app/claims

# ===== helpers appended to globals.css (only once) =====
if ! grep -q '/* LC helpers */' app/globals.css 2>/dev/null; then
  cat >> app/globals.css <<'CSS'

/* LC helpers */
.wrap { @apply min-h-screen flex flex-col bg-[#0d0f1a] text-white; }
.hdr { @apply sticky top-0 z-40 bg-[#0d0f1a]/70 backdrop-blur border-b border-white/10 flex items-center; }
.hdr .brand { @apply px-4 py-3 text-xl font-semibold; }
.hdr .right { @apply ml-auto px-4 py-3; }
.grid2 { @apply grid grid-cols-1 md:grid-cols-2 gap-4 p-4; }
.card { @apply rounded-2xl border border-white/10 bg-white/5 p-4; }
.card h3 { @apply text-lg font-semibold mb-2; }
.ftr { @apply mt-6 text-center text-white/60 text-sm pb-6; }
.btn { @apply inline-flex items-center justify-center rounded-xl px-4 py-2 font-medium transition; }
.btn-primary { background: linear-gradient(90deg, #5B4BFF 0%, #EE11FB 100%); }
.btn-primary:hover { filter: brightness(1.05); }
.link { @apply underline decoration-white/40 hover:decoration-white; }
.input { @apply w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-[#5B4BFF]; }
.label { @apply text-sm text-white/70 mb-1; }
CSS
fi

# ===== Connect button =====
cat > app/components/Connect.tsx <<'TSX'
"use client"
import { ConnectButton } from "@rainbow-me/rainbowkit"
export default function Connect() {
  return <ConnectButton chainStatus="icon" accountStatus="address" />
}
TSX

# ===== NetGuard =====
cat > app/components/NetGuard.tsx <<'TSX'
"use client"
import { useChainId, useSwitchChain } from "wagmi"
import { lightchain } from "../../lib/lightchain"

export default function NetGuard() {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  if (chainId && chainId !== lightchain.id) {
    return (
      <div className="mx-4 my-3 rounded-xl border border-white/10 bg-yellow-500/10 text-yellow-200 p-3 flex items-center justify-between">
        <div>Wrong network. Please switch to <b>Lightchain Testnet</b>.</div>
        <button className="btn btn-primary" onClick={() => switchChain({ chainId: lightchain.id })}>Switch</button>
      </div>
    )
  }
  return null
}
TSX

# ===== Dashboard tiles your app/page.tsx imports =====
cat > app/components/ChallengeStatus.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ChallengeStatus(){
  return (
    <div className="card">
      <h3>Inspect / Status</h3>
      <p className="text-white/70">Check proof configuration and current status of a challenge.</p>
      <div className="mt-3"><Link href="/proofs/submit" className="btn btn-primary">Inspect & Submit Proof</Link></div>
    </div>
  )
}
TSX

cat > app/components/ChallengeCreate.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ChallengeCreate(){
  return (
    <div className="card">
      <h3>Create Challenge</h3>
      <p className="text-white/70">Create a steps challenge with stake and validation policy.</p>
      <div className="mt-3"><Link href="/challenges/create" className="btn btn-primary">Create</Link></div>
    </div>
  )
}
TSX

cat > app/components/ChallengeJoin.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ChallengeJoin(){
  return (
    <div className="card">
      <h3>Join / Bet</h3>
      <p className="text-white/70">Find open challenges to participate or place a bet.</p>
      <div className="mt-3"><Link href="/explore" className="btn btn-primary">Explore Challenges</Link></div>
    </div>
  )
}
TSX

cat > app/components/ChallengeProof.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ChallengeProof(){
  return (
    <div className="card">
      <h3>Submit ZK Proof</h3>
      <p className="text-white/70">Paste your generated 0x… proof bytes and submit.</p>
      <div className="mt-3"><Link href="/proofs/submit" className="btn btn-primary">Submit Proof</Link></div>
    </div>
  )
}
TSX

cat > app/components/ChallengeFinalize.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ChallengeFinalize(){
  return (
    <div className="card">
      <h3>Finalize</h3>
      <p className="text-white/70">Finalize a completed challenge (settles outcome & payouts).</p>
      <div className="mt-3"><Link href="/claims" className="btn btn-primary">Go to Finalize / Claim</Link></div>
    </div>
  )
}
TSX

cat > app/components/ChallengeCancel.tsx <<'TSX'
"use client"
export default function ChallengeCancel(){
  return (
    <div className="card">
      <h3>Cancel (Admin)</h3>
      <p className="text-white/70">Admin-only: cancel a challenge (if permitted by policy).</p>
      <div className="mt-2 text-white/50 text-sm">Admin tooling will live under /admin (coming next).</div>
    </div>
  )
}
TSX

cat > app/components/ClaimWinner.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ClaimWinner(){
  return (
    <div className="card">
      <h3>Claim Winner</h3>
      <p className="text-white/70">Claim your winner rewards after finalization.</p>
      <div className="mt-3"><Link href="/claims" className="btn btn-primary">Claim</Link></div>
    </div>
  )
}
TSX

cat > app/components/ClaimLoser.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ClaimLoser(){
  return (
    <div className="card">
      <h3>Claim Loser Cashback</h3>
      <p className="text-white/70">Claim eligible cashback for losing side (if configured).</p>
      <div className="mt-3"><Link href="/claims" className="btn btn-primary">Claim</Link></div>
    </div>
  )
}
TSX

cat > app/components/ClaimValidator.tsx <<'TSX'
"use client"
import Link from "next/link"
export default function ClaimValidator(){
  return (
    <div className="card">
      <h3>Claim Validator</h3>
      <p className="text-white/70">Claim validator rewards for verified results.</p>
      <div className="mt-3"><Link href="/claims" className="btn btn-primary">Claim</Link></div>
    </div>
  )
}
TSX

# ===== Route stubs =====

# /challenges/create
cat > app/challenges/create/page.tsx <<'TSX'
"use client"
import { useState } from "react"

export default function CreateChallengePage() {
  const [title, setTitle] = useState("5k Steps Daily")
  const [daily, setDaily] = useState("5000")
  const [days, setDays] = useState("5")
  const [stake, setStake] = useState("0.02") // LCAI
  return (
    <div className="container-narrow mx-auto px-4 py-8">
      <div className="card max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Create Challenge</h1>
        <div className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Daily Steps Target</label>
            <input className="input" value={daily} onChange={e=>setDaily(e.target.value)} />
          </div>
          <div>
            <label className="label">Days</label>
            <input className="input" value={days} onChange={e=>setDays(e.target.value)} />
          </div>
          <div>
            <label className="label">Stake (LCAI)</label>
            <input className="input" value={stake} onChange={e=>setStake(e.target.value)} />
          </div>
          <div className="pt-2">
            <button className="btn btn-primary w-full">Continue (wire tx next)</button>
          </div>
        </div>
      </div>
    </div>
  )
}
TSX

# /proofs/submit
mkdir -p app/proofs/submit
cat > app/proofs/submit/page.tsx <<'TSX'
"use client"
import { useState } from "react"

export default function SubmitProofPage(){
  const [id, setId] = useState("1")
  const [proof, setProof] = useState("0x")
  return (
    <div className="container-narrow mx-auto px-4 py-8">
      <div className="card max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Submit ZK Proof</h1>
        <div className="space-y-3">
          <div>
            <label className="label">Challenge ID</label>
            <input className="input" value={id} onChange={e=>setId(e.target.value)} />
          </div>
          <div>
            <label className="label">Proof (0x… bytes)</label>
            <textarea className="input" rows={5} value={proof} onChange={e=>setProof(e.target.value)} />
          </div>
          <button className="btn btn-primary w-full">Submit (wire tx next)</button>
        </div>
      </div>
    </div>
  )
}
TSX

# /claims
cat > app/claims/page.tsx <<'TSX'
"use client"
import { useState } from "react"

export default function ClaimsPage(){
  const [id, setId] = useState("1")
  return (
    <div className="container-narrow mx-auto px-4 py-8">
      <div className="card max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">Claims</h1>
        <div>
          <label className="label">Challenge ID</label>
          <input className="input" value={id} onChange={e=>setId(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <button className="btn btn-primary">Claim Winner</button>
          <button className="btn bg-white/10 hover:bg-white/20">Claim Loser</button>
          <button className="btn bg-white/10 hover:bg-white/20">Claim Validator</button>
        </div>
        <p className="text-white/50 text-sm">We’ll hook these up to on-chain calls next.</p>
      </div>
    </div>
  )
}
TSX

echo "✅ Components, styles, and route stubs created."
