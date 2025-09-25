"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { listOpen } from "../../lib/query"

export default function Explore() {
  const [items, setItems] = useState<{ id: bigint; v: any }[]>([])
  useEffect(() => { listOpen(30).then(setItems).catch(()=>{}) }, [])
  return (
    <main className="space-y-4">
      <h1 className="h1">Explore</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(({ id, v }) => (
          <Link key={id.toString()} className="section hover:bg-white/10 transition" href={`/challenge/${id.toString()}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Challenge #{id.toString()}</div>
              <span className="badge">{(v?.status ?? "-").toString()}</span>
            </div>
            <div className="text-sm text-white/80">Stake: {v?.stake?.toString?.() ?? "-"}</div>
            <div className="text-sm text-white/80">Participants: {v?.participantsCount?.toString?.() ?? "-"}</div>
          </Link>
        ))}
      </div>
    </main>
  )
}