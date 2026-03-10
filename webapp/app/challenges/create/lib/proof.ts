// webapp/app/challenges/create/lib/proof.ts
import type { Address } from "viem";

/**
 * Canonical proof taxonomy for the current create flow.
 * We now support only:
 * - AIVM (settled through Lightchain PoI)
 * - PLONK
 * - ZK
 */
export type ProofMode = "AIVM" | "PLONK" | "ZK";

export type CreateUxMode = ProofMode;

/**
 * Backend is the actual settlement / verification rail.
 */
export type VerificationBackend =
  | "LIGHTCHAIN_POI"
  | "PLONK_ONCHAIN"
  | "ZK_ONCHAIN";

export type ProofMeta = {
  mode: ProofMode;
  backend?: VerificationBackend;
  verifier?: Address;
  label?: string;
};

export const PROOF_MODE_LABEL: Record<ProofMode, string> = {
  AIVM: "Lightchain AIVM",
  PLONK: "PLONK Verifier",
  ZK: "ZK Proof",
};

export const VERIFICATION_BACKEND_LABEL: Record<VerificationBackend, string> = {
  LIGHTCHAIN_POI: "Lightchain AIVM + PoI",
  PLONK_ONCHAIN: "PLONK On-Chain Verifier",
  ZK_ONCHAIN: "ZK On-Chain Verifier",
};

export function defaultProofModeForIntent(
  _intentType: "FITNESS" | "GAMING"
): ProofMode {
  return "AIVM";
}

export function toCreateUxMode(mode: ProofMode): CreateUxMode {
  return mode;
}

export function defaultVerificationBackendForMode(
  mode: ProofMode
): VerificationBackend {
  switch (mode) {
    case "AIVM":
      return "LIGHTCHAIN_POI";
    case "PLONK":
      return "PLONK_ONCHAIN";
    case "ZK":
    default:
      return "ZK_ONCHAIN";
  }
}

export function isAivmFamily(mode: ProofMode) {
  return mode === "AIVM";
}

export function isPlonk(mode: ProofMode) {
  return mode === "PLONK";
}

export function isZk(mode: ProofMode) {
  return mode === "ZK";
}