#!/usr/bin/env zsh
set -euo pipefail

ROOT="${0:a:h}"
cd "$ROOT"

if [ ! -d "webapp" ]; then
  echo "❌ webapp/ folder not found at $ROOT. Run from your repo root (lightchallenge)."
  exit 1
fi

cd webapp

echo "▶ Ensuring required folders…"
mkdir -p app app/challenges/create app/challenge lib lib/components lib/ui public public/abi public/deployments

# 0) Next workspace confusion guard
cat > next.config.ts <<'TS'
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
};
export default nextConfig;
TS

# 1) Ensure deployment addresses JSON
if [ -f ../deployments/lightchain.json ]; then
  cp -f ../deployments/lightchain.json public/deployments/lightchain.json
else
  cat > public/deployments/lightchain.json <<'JSON'
{
  "ChallengePay": "0x20E2F8c50816Ba7587DB4d7E36C4F19f1BcA6919",
  "ZkProofVerifier": "0xa4d924C0576AB3342f0786b7dA0EB9d4fEA43255",
  "PlonkVerifier":   "0x77c4cd9421B19d622D6020E85C53Ac5098bC1668",
  "DaoTreasury":     "0x95A4CE3c93dBcDb9b3CdFb4CCAE6EFBDb4cCA217"
}
JSON
fi

# 2) Export ABI to public (prefer artifacts, fallback keep existing)
if [ -f ../artifacts/contracts/ChallengePay.sol/ChallengePay.json ]; then
  jq '{abi:.abi}' ../artifacts/contracts/ChallengePay.sol/ChallengePay.json > public/abi/ChallengePay.abi.json
elif [ ! -f public/abi/ChallengePay.abi.json ]; then
  echo "❌ Missing public/abi/ChallengePay.abi.json and no artifacts found."
  exit 1
fi

if [ -f ../artifacts/contracts/zk/ZkProofVerifier.sol/ZkProofVerifier.json ]; then
  jq '{abi:.abi}' ../artifacts/contracts/zk/ZkProofVerifier.sol/ZkProofVerifier.json > public/abi/ZkProofVerifier.abi.json
elif [ ! -f public/abi/ZkProofVerifier.abi.json ]; then
  # Not critical for create flow, create a placeholder
  echo '{"abi":[]}' > public/abi/ZkProofVerifier.abi.json
fi

# 3) Env for Lightchain
if ! grep -q 'NEXT_PUBLIC_CHAIN_ID' .env.local 2>/dev/null; then
  printf '%s\n' "NEXT_PUBLIC_CHAIN_ID=504" "NEXT_PUBLIC_RPC_URL=https://testnet-rpc.lightchain.net" >> .env.local
fi

# 4) Core libs: chain, contracts, reads, wagmi, providers, header, netguard
cat > lib/lightchain.ts <<'TS'
import type { Chain } from "wagmi"
export const lightchain: Chain = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504),
  name: "Lightchain Testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.lightchain.net"] } },
  blockExplorers: { default: { name: "Lightscan", url: "https://testnet.lightscan.app" } },
}
TS

cat > lib/contracts.ts <<'TS'
import dep from "../public/deployments/lightchain.json"
import cpAbi from "../public/abi/ChallengePay.abi.json"
import zkAbi from "../public/abi/ZkProofVerifier.abi.json"

export const ADDR = {
  ChallengePay: dep.ChallengePay as `0x${string}`,
  ZkProofVerifier: dep.ZkProofVerifier as `0x${string}`,
  PlonkVerifier: dep.PlonkVerifier as `0x${string}`,
  DaoTreasury: dep.DaoTreasury as `0x${string}`,
} as const

export const ABI = {
  ChallengePay: (cpAbi as any).abi,
  ZkProofVerifier: (zkAbi as any).abi,
} as const
TS

cat > lib/challenge.ts <<'TS'
export type ChallengeView = {
  id: bigint
  kind: number
  status: number
  outcome: number
  challenger: `0x${string}`
  daoTreasury: `0x${string}`
  currency: `0x${string}` | string
  stake: bigint
  proposalBond: bigint
  approvalDeadline: bigint
  startTs: bigint
  maxParticipants: number
  yesWeight: bigint
  noWeight: bigint
  partWeight: bigint
  peers: number
  peerApprovalsNeeded: number
  peerApprovals: number
  peerRejections: number
  charityBps: number
  charity: `0x${string}`
  poolSuccess: bigint
  poolFail: bigint
  proofRequired: boolean
  verifier: `0x${string}`
  proofOk: boolean
  participantsCount: number
}

export function mapChallengeTuple(t: any[]): ChallengeView {
  return {
    id: t[0],
    kind: Number(t[1]),
    status: Number(t[2]),
    outcome: Number(t[3]),
    challenger: t[4],
    daoTreasury: t[5],
    currency: t[6],
    stake: t[7],
    proposalBond: t[8],
    approvalDeadline: t[9],
    startTs: t[10],
    maxParticipants: Number(t[11]),
    yesWeight: t[12],
    noWeight: t[13],
    partWeight: t[14],
    peers: Number(t[15]),
    peerApprovalsNeeded: Number(t[16]),
    peerApprovals: Number(t[17]),
    peerRejections: Number(t[18]),
    charityBps: Number(t[19]),
    charity: t[20],
    poolSuccess: t[21],
    poolFail: t[22],
    proofRequired: !!t[23],
    verifier: t[24],
    proofOk: !!t[25],
    participantsCount: Number(t[26]),
  }
}

export const StatusLabel: Record<number,string> = {
  0: "Unknown",
  1: "Proposed",
  2: "Active",
  3: "Succeeded",
  4: "Failed",
  5: "Cancelled",
  6: "Finalized",
}
TS

cat > lib/reads.ts <<'TS'
import { createPublicClient, http } from "viem"
import { ADDR, ABI } from "./contracts"

const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.lightchain.net"
const client = createPublicClient({ transport: http(rpc) })

export async function readChallenge(id: bigint) {
  return client.readContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "getChallenge",
    args: [id],
  })
}
TS

cat > lib/wagmi.tsx <<'TSX'
"use client"
import { createConfig, http } from "wagmi"
import { injected } from "@wagmi/connectors"
import { lightchain } from "./lightchain"
const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.lightchain.net"

export const wagmiConfig = createConfig({
  chains: [lightchain],
  transports: { [lightchain.id]: http(rpc) },
  connectors: [injected({ shimDisconnect: true })],
  ssr: true,
})
TSX

cat > app/providers.tsx <<'TSX'
"use client"
import { ReactNode } from "react"
import { WagmiConfig } from "wagmi"
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { wagmiConfig } from "../lib/wagmi"
import "@rainbow-me/rainbowkit/styles.css"
const client = new QueryClient()
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={client}>
        <RainbowKitProvider theme={darkTheme()}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  )
}
TSX

cat > lib/ui/NetGuard.tsx <<'TSX'
"use client"
import { useChainId, useSwitchChain } from "wagmi"
import { lightchain } from "../lightchain"
export default function NetGuard() {
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  if (chainId && chainId !== lightchain.id) {
    return (
      <div className="mx-4 my-3 rounded-xl border border-white/10 bg-yellow-500/10 text-yellow-200 p-3 flex items-center justify-between">
        <div>Wrong network. Please switch to Lightchain Testnet.</div>
        <button className="btn btn-primary" onClick={() => switchChain({ chainId: lightchain.id })}>Switch</button>
      </div>
    )
  }
  return null
}
TSX

cat > lib/components/Header.tsx <<'TSX'
"use client"
import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-[#0d0f1a]/70 backdrop-blur border-b border-white/10">
      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <Link href="/" className="text-2xl font-semibold">
          <span className="text-white">LIGHT</span><span style={{color:"#5B4BFF"}}>CHAIN</span>
        </Link>
        <ConnectButton chainStatus="icon" accountStatus="address" />
      </div>
    </header>
  )
}
TSX

# 5) Root layout (keeps your globals.css)
cat > app/layout.tsx <<'TSX'
import "./globals.css"
import type { ReactNode } from "react"
import Providers from "./providers"
import Header from "../lib/components/Header"
import NetGuard from "../lib/ui/NetGuard"

export const metadata = { title: "LightChallenge" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <NetGuard />
          <main className="container-narrow px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
TSX

# 6) Create Challenge page (tuple-based, payable)
cat > app/challenges/create/page.tsx <<'TSX'
"use client"
import { useState } from "react"
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi"
import { parseEther } from "viem"
import { ABI, ADDR } from "../../../lib/contracts"

export default function CreatePage() {
  const { isConnected } = useAccount()
  const [title, setTitle]   = useState("")
  const [steps, setSteps]   = useState("5000")
  const [days, setDays]     = useState("5")
  const [stake, setStake]   = useState("0.02")

  const { writeContractAsync, data: hash, error, isPending } = useWriteContract()
  const { isSuccess: mined } = useWaitForTransactionReceipt({ hash })

  async function onCreate() {
    try {
      const value = parseEther(stake || "0")
      const now = Math.floor(Date.now()/1000)
      const challenge = {
        kind: 1,
        currency: 0, // native
        token: "0x0000000000000000000000000000000000000000",
        stakeAmount: value,
        proposalBond: 0n,
        approvalDeadline: BigInt(now + 24*3600),
        startTs: BigInt(now + 48*3600),
        maxParticipants: BigInt(100),
        peers: [] as `0x${string}`[],
        peerApprovalsNeeded: 0,
        charityBps: 0,
        charity: "0x0000000000000000000000000000000000000000",
        proofRequired: true,
        verifier: ADDR.ZkProofVerifier,
      }
      await writeContractAsync({
        address: ADDR.ChallengePay,
        abi: ABI.ChallengePay,
        functionName: "createChallenge",
        args: [challenge],
        value,
      })
    } catch (e) {
      console.error(e)
    }
  }

  const exUrl = hash ? `https://testnet.lightscan.app/tx/${hash}` : undefined

  return (
    <div className="container-narrow mx-auto px-4 py-8">
      <div className="section max-w-2xl mx-auto space-y-4">
        <h1 className="h1">Create Challenge</h1>
        <input className="input" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
        <input className="input" placeholder="Daily Steps Target" value={steps} onChange={e=>setSteps(e.target.value)} />
        <input className="input" placeholder="Days" value={days} onChange={e=>setDays(e.target.value)} />
        <input className="input" placeholder="Stake (LCAI)" value={stake} onChange={e=>setStake(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={!isConnected || isPending} onClick={onCreate}>
          {isPending ? "Sending…" : "Create Challenge"}
        </button>
        {hash && (<div className="text-white/70 text-sm">Sent: <a className="underline" href={exUrl} target="_blank" rel="noreferrer">{hash}</a>{mined && " — confirmed ✅"}</div>)}
        {error && (<div className="text-red-300 text-sm">{String((error as any)?.shortMessage || (error as any)?.message || error)}</div>)}
        {!isConnected && <div className="text-white/60 text-sm">Connect wallet to continue.</div>}
      </div>
    </div>
  )
}
TSX

# 7) Challenge Detail page
cat > app/challenge/\[id]/page.tsx <<'TSX'
"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useWriteContract } from "wagmi"
import { readChallenge } from "../../lib/reads"
import { mapChallengeTuple, StatusLabel } from "../../lib/challenge"
import { ADDR, ABI } from "../../lib/contracts"

export default function ChallengeDetail(){
  const params = useParams() as { id:string }
  const [view,setView]=useState<any>(null)
  const { writeContractAsync, isPending } = useWriteContract()

  useEffect(()=>{ (async()=>{
    const raw:any = await readChallenge(BigInt(params.id))
    setView(mapChallengeTuple(raw as any))
  })() },[params.id])

  if(!view) return <div className="section">Loading…</div>

  async function finalize(){
    await writeContractAsync({
      abi: ABI.ChallengePay,
      address: ADDR.ChallengePay,
      functionName:"finalize",
      args:[view.id]
    })
  }

  return (
    <div className="grid gap-4">
      <div className="section">
        <div className="flex items-center justify-between">
          <h1 className="h1">{`Challenge #${view.id}`}</h1>
          <div className="badge">{StatusLabel[view.status] || "Unknown"}</div>
        </div>
        <div className="mt-3 grid sm:grid-cols-2 gap-3" style={{color:"rgba(255,255,255,.85)"}}>
          <div>Challenger: <span className="text-white">{view.challenger}</span></div>
          <div>Stake (wei): <span className="text-white">{String(view.stake)}</span></div>
          <div>Proof required: <span className="text-white">{String(view.proofRequired)}</span></div>
          <div>Verifier: <span className="text-white">{view.verifier}</span></div>
        </div>
      </div>
      <div className="section grid sm:grid-cols-3 gap-3">
        <a className="btn" style={{background:"rgba(255,255,255,.1)"}} href={`/proofs/submit?chId=${String(view.id)}`}>Submit Proof</a>
        <button className="btn" style={{background:"rgba(255,255,255,.1)"}} onClick={finalize} disabled={isPending}>Finalize</button>
        <a className="btn" style={{background:"rgba(255,255,255,.1)"}} href={`/claims?chId=${String(view.id)}`}>Claims</a>
      </div>
    </div>
  )
}
TSX

# 8) Minimal design tokens to avoid Tailwind plugin issues (append safely)
touch app/globals.css
cat >> app/globals.css <<'CSS'

:root {
  --lc-bg: #0d0f1a;
  --lc-card: rgba(255,255,255,0.04);
  --lc-border: rgba(255,255,255,0.08);
  --lc-grad-1: #5B4BFF;
  --lc-grad-2: #EE11FB;
}
html, body { background: var(--lc-bg); color: white; }
.container-narrow { max-width: 1100px; margin: 0 auto; }
.section { background: var(--lc-card); border: 1px solid var(--lc-border); border-radius: 16px; padding: 16px; }
.h1 { font-size: 1.5rem; font-weight: 600; }
.btn { display:inline-flex; align-items:center; justify-content:center; border-radius:12px; padding:8px 14px; font-weight:600; }
.btn-primary { background: linear-gradient(90deg, var(--lc-grad-1), var(--lc-grad-2)); }
.input { width:100%; border-radius:12px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); padding: 8px 12px; }
.badge { border:1px solid rgba(255,255,255,.2); padding:4px 10px; border-radius:999px; font-size:.85rem; }
CSS

# 9) Dependencies (UI + web3)
echo "▶ Installing/aligning dependencies…"
npm i -s next react react-dom wagmi viem @tanstack/react-query @rainbow-me/rainbowkit
npm i -D @types/react @types/react-dom @types/node @tailwindcss/postcss autoprefixer || true

# 10) Start dev
pkill -f "next dev" 2>/dev/null || true
echo "▶ Starting dev server…"
npm run dev --silent >/dev/null 2>&1 || true
echo "✅ Done. Open:"
echo "   - http://localhost:3000/challenges/create"
echo "   - http://localhost:3000/challenge/1"
