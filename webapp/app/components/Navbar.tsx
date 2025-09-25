// app/components/Navbar.tsx
"use client"

import Link from "next/link"
import Connect from "./Connect"

export default function Navbar() {
  return (
    <header className="hdr">
      <div className="container-narrow flex items-center gap-6 px-4 py-3">
        <Link href="/" className="text-lg font-semibold">LightChallenge</Link>
        <nav className="hidden md:flex items-center gap-4 text-white/80">
          <Link href="/" className="hover:underline">Dashboard</Link>
          <Link href="/explore" className="hover:underline">Explore</Link>
          <Link href="/challenges/create" className="hover:underline">Create</Link>
          <Link href="/claims" className="hover:underline">Claims</Link>
          <Link href="/proofs/submit" className="hover:underline">Submit Proof</Link>
        </nav>
        <div className="ml-auto">
          <Connect />
        </div>
      </div>
    </header>
  )
}