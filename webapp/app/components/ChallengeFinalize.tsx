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
