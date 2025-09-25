import type { Chain } from "wagmi"
export const lightchain: Chain = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504),
  name: "Lightchain Testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.lightchain.net"] } },
  blockExplorers: { default: { name: "Lightscan", url: "https://testnet.lightscan.app" } },
}
