// webapp/lib/lightchain.ts
import { defineChain } from "viem"

export const LIGHTCHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 504)
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://light-testnet-rpc.lightchain.ai"
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.lightscan.app"

export const lightchain = defineChain({
  id: LIGHTCHAIN_ID,
  name: "Lightchain Testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public:  { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Lightscan", url: EXPLORER_URL },
  },
  testnet: true,
})