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
