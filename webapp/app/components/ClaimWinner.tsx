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
