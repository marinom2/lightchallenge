// webapp/lib/verifierMap.ts
import { ADDR } from "./contracts";

export type CategoryOption = { value: string; label: string };

export const categoryOptions: CategoryOption[] = [
  { value: "fitness", label: "Fitness / Health" },
  { value: "gaming", label: "Gaming / Esports" },
  { value: "creative", label: "Creative / Content" },
  { value: "betting", label: "Betting / Events" },
  { value: "privacy", label: "Privacy / ZK" },
];

export function defaultVerifierForCategory(category: string) {
  switch (category) {
    case "fitness": return ADDR.AivmProofVerifier;
    case "gaming":  return ADDR.AivmProofVerifier;
    case "creative": return (ADDR as any).MultiSigProofVerifier;
    case "betting":  return (ADDR as any).MultiSigProofVerifier;
    case "privacy":  return ADDR.ZkProofVerifier;
    default: return undefined;
  }
}