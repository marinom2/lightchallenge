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
