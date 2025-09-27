"use client"

import { PropsWithChildren, useMemo } from "react"
import { WagmiProvider, createConfig, http, createStorage } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { lightchain } from "@/lib/lightchain"
import { connectors } from "@/lib/wallets"

function getWagmiStorage() {
  if (typeof window === "undefined") return undefined
  try {
    return createStorage({ storage: window.localStorage })
  } catch {
    return undefined
  }
}

const queryClient = new QueryClient()

export default function Providers({ children }: PropsWithChildren) {
  const wagmiStorage = useMemo(getWagmiStorage, [])
  const config = useMemo(
    () =>
      createConfig({
        chains: [lightchain],
        transports: {
          [lightchain.id]: http(lightchain.rpcUrls.default.http[0]!),
        },
        connectors,
        autoConnect: false, // 🔒 prevent surprise popups
        ssr: true,
        storage: wagmiStorage,
      }),
    [wagmiStorage],
  )

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}