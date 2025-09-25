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
