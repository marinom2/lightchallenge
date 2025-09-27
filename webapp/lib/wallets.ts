// webapp/lib/wallets.ts
import { cookieStorage, createStorage } from "wagmi"
import { defaultWagmiConfig, createWeb3Modal } from "@web3modal/wagmi/react"
import type { Config } from "wagmi" // ✅ use Config, not CreateConfig
import { lightchain } from "@/lib/lightchain"

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo"

const metadata = {
  name: "ChallengePay",
  description: "Bet on yourself. Set challenges and pay only if you fail.",
  url: "https://challengepay.app",
  icons: ["https://challengepay.app/icon.png"],
}

export const wagmiConfig: Config = defaultWagmiConfig({
  chains: [lightchain],
  projectId,
  metadata,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
})

export function ensureWeb3Modal() {
  if (typeof window === "undefined") return
  // @ts-expect-error prevent double init
  if (window.__w3m_inited) return
  createWeb3Modal({
    wagmiConfig: wagmiConfig as Config,
    projectId,
    chains: [lightchain],
    enableAnalytics: false,
    enableOnramp: false,
  })
  // @ts-expect-error
  window.__w3m_inited = true
}