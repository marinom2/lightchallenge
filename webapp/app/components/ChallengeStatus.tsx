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
