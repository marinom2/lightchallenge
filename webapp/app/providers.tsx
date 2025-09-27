"use client"

import { PropsWithChildren, useEffect } from "react"
import { WagmiConfig } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { wagmiConfig, ensureWeb3Modal } from "@/lib/wallets"

const queryClient = new QueryClient()

export default function Providers({ children }: PropsWithChildren) {
  useEffect(() => { ensureWeb3Modal() }, [])
  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfig>
  )
}
