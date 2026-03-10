import type { Address } from "viem";
import { loadChainPolicyHints } from "../lib/chainRulesLoader";

export async function loadPolicyHints(currencyType: "NATIVE" | "ERC20", token: Address | null) {
  // wraps your existing loader
  return await loadChainPolicyHints({
    currencyType,
    token,
  } as any);
}