import { createPublicClient, http } from "viem"
import { lightchain } from "./lightchain"

const RPC = process.env.NEXT_PUBLIC_RPC_URL as string
if (!RPC) console.warn("[viem] NEXT_PUBLIC_RPC_URL is not set")

export const publicClient = createPublicClient({
  chain: lightchain,
  transport: http(RPC || "https://light-testnet-rpc.lightchain.ai"),
})
