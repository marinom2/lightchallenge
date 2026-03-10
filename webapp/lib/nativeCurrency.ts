//webapp/lib/nativeCurrency.ts
// Read the connected chain's native currency (name/symbol/decimals) from wagmi.

"use client";
import { usePublicClient } from "wagmi";

export function useNativeCurrency() {
  const pc = usePublicClient();
  // viem/wagmi chain objects always define nativeCurrency
  return pc?.chain?.nativeCurrency; // { name: string; symbol: string; decimals: number }
}

export function useNativeSymbol() {
  return useNativeCurrency()?.symbol; // string | undefined
}