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
