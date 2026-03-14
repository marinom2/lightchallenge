// webapp/lib/chainAddresses.ts
export type ChainDeployments = {
  chainId: number;
  rpcUrl?: string;
  contracts: Record<string, string>;
};

function assertAddr(v: any, name: string) {
  if (!v || typeof v !== "string" || !v.startsWith("0x") || v.length < 10) {
    throw new Error(`Missing/invalid address for ${name}`);
  }
  return v as `0x${string}`;
}

/**
 * Loads /public/deployments/lightchain.json in both server + client.
 * - Server: reads via fs
 * - Client: fetches from /deployments/lightchain.json
 */
export async function loadChainDeployments(): Promise<ChainDeployments> {
  if (typeof window === "undefined") {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const p = join(process.cwd(), "public", "deployments", "lightchain.json");
    return JSON.parse(readFileSync(p, "utf8"));
  }

  const res = await fetch("/deployments/lightchain.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load deployments/lightchain.json");
  return res.json();
}

export async function loadAddresses() {
  const d = await loadChainDeployments();

  const ChallengePay = assertAddr(d.contracts.ChallengePay, "ChallengePay");
  const Treasury = assertAddr(d.contracts.Treasury, "Treasury");
  const ChallengeTaskRegistry = assertAddr(
    d.contracts.ChallengeTaskRegistry,
    "ChallengeTaskRegistry"
  );
  const ChallengePayAivmPoiVerifier = assertAddr(
    d.contracts.ChallengePayAivmPoiVerifier,
    "ChallengePayAivmPoiVerifier"
  );
  const AIVMInferenceV2 = assertAddr(
    d.contracts.AIVMInferenceV2,
    "AIVMInferenceV2"
  );

  return {
    chainId: d.chainId,
    rpcUrl: d.rpcUrl,
    ChallengePay,
    Treasury,
    ChallengeTaskRegistry,
    ChallengePayAivmPoiVerifier,
    AIVMInferenceV2,
    raw: d,
  };
}
