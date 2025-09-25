"use client"
import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-[#0d0f1a]/70 backdrop-blur border-b border-white/10">
      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <Link href="/" className="text-2xl font-semibold">
          <span className="text-white">LIGHT</span><span className="text-lc-primary">CHAIN</span>
        </Link>
        <ConnectButton chainStatus="icon" accountStatus="address" />
      </div>
    </header>
  )
}
