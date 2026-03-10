// webapp/lib/verifierMap.ts
import { ADDR, ZERO_ADDR } from "./contracts";

export type CategoryOption = { value: string; label: string };

export const categoryOptions: CategoryOption[] = [
  { value: "fitness", label: "Fitness / Health" },
  { value: "gaming", label: "Gaming / Esports" },
  { value: "creative", label: "Creative / Content" },
  { value: "betting", label: "Betting / Events" },
  { value: "privacy", label: "Privacy / ZK" },
];

export function defaultVerifierForCategory(category: string) {
  // Current architecture: everything routes through ChallengePayAivmPoiVerifier
  const verifier =
    ADDR.ChallengePayAivmPoiVerifier !== ZERO_ADDR
      ? ADDR.ChallengePayAivmPoiVerifier
      : undefined;

  switch (category) {
    case "fitness":
    case "gaming":
    case "creative":
    case "betting":
    case "privacy":
      return verifier;
    default:
      return verifier;
  }
}