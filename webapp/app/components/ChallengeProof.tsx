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
