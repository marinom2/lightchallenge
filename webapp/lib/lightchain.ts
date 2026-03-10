// webapp/lib/lightchain.ts
import { defineChain } from "viem";

// Prefer server-side vars when running on the server, then fall back to public, then default.
const SERVER_CHAIN_ID = process.env.CHAIN_ID || process.env.LIGHTCHAIN_CHAIN_ID;
const PUBLIC_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID;
export const LIGHTCHAIN_ID = Number(SERVER_CHAIN_ID ?? PUBLIC_CHAIN_ID ?? 504);

// RPC: server -> public -> default
const SERVER_RPC =
  process.env.RPC_URL ||
  process.env.LIGHTCHAIN_RPC ||
  process.env.LIGHTCHAIN_RPC_URL; // allow either
const PUBLIC_RPC = process.env.NEXT_PUBLIC_RPC_URL;
export const RPC_URL = SERVER_RPC ?? PUBLIC_RPC ?? "https://light-testnet-rpc.lightchain.ai";

// Explorer (public is fine, but add a non-public fallback just in case)
const SERVER_EXPLORER = process.env.EXPLORER_URL || process.env.LIGHTCHAIN_EXPLORER_URL;
const PUBLIC_EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL;
export const EXPLORER_URL = SERVER_EXPLORER ?? PUBLIC_EXPLORER ?? "https://testnet.lightscan.app";

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
});