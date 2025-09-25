// webapp/app/page.tsx  (replace the grid with the 4 existing + Dashboard)
"use client"
import Link from "next/link"

export default function Home() {
  return (
    <div className="grid gap-6">
      <div className="section">
        <h1 className="h1">Your Overview</h1>
        <p className="mt-2 text-white/80">
          Connect wallet, explore challenges, submit proofs, and claim rewards on Lightchain Testnet.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link className="section hover:bg-white/10 transition" href="/dashboard">
          <div className="h2">Dashboard</div>
          <p className="text-white/80">Track approvals, peers, pools, and claims.</p>
        </Link>

        <Link className="section hover:bg-white/10 transition" href="/challenges/create">
          <div className="h2">Create Challenge</div>
          <p className="text-white/80">Open a new steps challenge.</p>
        </Link>

        <Link className="section hover:bg-white/10 transition" href="/explore">
          <div className="h2">Explore</div>
          <p className="text-white/80">Browse active challenges.</p>
        </Link>

        <Link className="section hover:bg-white/10 transition" href="/proofs/submit">
          <div className="h2">Submit Proof</div>
          <p className="text-white/80">Paste 0x proof bytes.</p>
        </Link>

        <Link className="section hover:bg-white/10 transition" href="/claims">
          <div className="h2">Claims</div>
          <p className="text-white/80">Claim winner/loser/validator.</p>
        </Link>
      </div>

      <div className="section">
        <div className="h2 mb-2">Quick Links</div>
        <ul className="list-disc pl-6 text-white/85">
          <li>
            <a
              className="link"
              href="https://testnet.lightscan.app/address/0x20E2F8c50816Ba7587DB4d7E36C4F19f1BcA6919"
              target="_blank"
              rel="noreferrer"
            >
              ChallengePay on Lightscan
            </a>
          </li>
          <li>
            <a className="link" href="https://lightchain.ai/brand" target="_blank" rel="noreferrer">
              Lightchain Brand
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}