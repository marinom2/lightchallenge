// webapp/lib/aivmTemplate.ts
import type { Address, Hex } from "viem";

/** Must mirror AivmProofVerifier’s EIP-712 domain */
export const domain = (chainId: number, verifyingContract: Address) =>
  ({
    name: "AivmProofVerifier",
    version: "1",
    chainId,
    verifyingContract,
  } as const);

/** Must mirror the Solidity typehash exactly */
export const types = {
  Inference: [
    { name: "user",         type: "address" },
    { name: "challengeId",  type: "uint256" },
    { name: "modelId",      type: "bytes32" },
    { name: "modelVersion", type: "uint256" },
    { name: "payload",      type: "bytes"   },
  ],
} as const;

/** The message you sign (exact fields, exact order) */
export function message(input: {
  user: Address;
  challengeId: bigint;
  modelId: Hex;          // 0x…32
  modelVersion: bigint;
  payload: Hex;          
}) {
  return input;
}