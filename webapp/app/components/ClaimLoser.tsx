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
