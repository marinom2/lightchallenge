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
