// webapp/lib/viem.ts
import { createPublicClient, http } from "viem";
import { lightchain } from "./lightchain";

/**
 * Decide which RPC URL to use.
 * - On the server: use the real LightChain RPC directly.
 * - In the browser: use /api/rpc proxy to avoid CORS.
 */
const SERVER_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";

const RPC_URL =
  typeof window === "undefined" ? SERVER_RPC_URL : "/api/rpc";

if (typeof window === "undefined" && !process.env.NEXT_PUBLIC_RPC_URL) {
  console.warn(
    "[⚠️ viem] NEXT_PUBLIC_RPC_URL not set — using fallback RPC:",
    SERVER_RPC_URL
  );
}

export const publicClient = createPublicClient({
  chain: lightchain,
  transport: http(RPC_URL),
});