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
