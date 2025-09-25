// webapp/lib/wagmi.ts
import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { walletConnect } from 'wagmi/connectors' // v2 wagmi exports wc connector
// NOTE: in wagmi v2, walletConnect is exported from 'wagmi/connectors'

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504)
const RPC_URL  = (process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.lightchain.net').trim()
const WC_PID   = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '').trim()

export const lightchain = defineChain({
  id: CHAIN_ID,
  name: 'Lightchain Testnet',
  nativeCurrency: { name: 'Light AI', symbol: 'LCAI', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: 'Lightscan', url: 'https://testnet.lightscan.app' },
  },
})

const connectors = [
  injected({ shimDisconnect: true }),
  ...(WC_PID
    ? [walletConnect({
        projectId: WC_PID,
        showQrModal: true,          // <-- QR modal for desktop & deep link for mobile
        metadata: {
          name: 'LightChallenge',
          description: 'Steps challenges on Lightchain',
          url: 'https://lightchain.ai', // your site (used by wallets)
          icons: ['https://lightchain.ai/favicon.ico'],
        },
      })]
    : [])
]

export const wagmiConfig = createConfig({
  chains: [lightchain],
  multiInjectedProviderDiscovery: true,
  transports: {
    [lightchain.id]: http(RPC_URL),
  },
  connectors,
})