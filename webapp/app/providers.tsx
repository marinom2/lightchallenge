// webapp/app/providers.tsx
"use client"

import { ReactNode, useEffect, useState } from "react"
import { WagmiProvider, Hydrate } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { wagmiConfig } from "../lib/wagmi"

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>
        {/* Important: pass config into Hydrate */}
        <Hydrate config={wagmiConfig}>
          {mounted ? children : null}
        </Hydrate>
      </QueryClientProvider>
    </WagmiProvider>
  )
}