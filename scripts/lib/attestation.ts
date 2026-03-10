/* scripts/lib/attestation.ts */

import { keccak256, AbiCoder, getBytes, ethers } from "ethers";

export type Attestation = {
  challengeId: bigint;
  subject: string;
  periodStart: number;  // uint64
  periodEnd: number;    // uint64
  ruleKind: number;     // uint8
  minDaily: number;     // uint32
  datasetHash: string;  // bytes32 (0x + 32 bytes)
  pass: boolean;
  chainId: bigint;      // uint256
  verifier: string;     // address
};

const coder = AbiCoder.defaultAbiCoder();

// keccak256("Attestation(uint256,address,uint64,uint64,uint8,uint32,bytes32,bool,uint256,address)")
export const TYPEHASH =
  "0x3b94011e0cfe69b0a03951dca1e445e2ea0292a290a59e7e1a04e1f2a8b615b3";

export function attestationHash(a: Attestation): string {
  const enc = coder.encode(
    [
      "bytes32","uint256","address","uint64","uint64","uint8","uint32","bytes32","bool","uint256","address"
    ],
    [ TYPEHASH, a.challengeId, a.subject, a.periodStart, a.periodEnd, a.ruleKind, a.minDaily, a.datasetHash, a.pass, a.chainId, a.verifier ]
  );
  return keccak256(enc);
}

export async function signAttestation(a: Attestation, signer: any): Promise<string> {
  // EOA prefixing is handled by signMessage
  return signer.signMessage(getBytes(attestationHash(a)));
}

export function buildProof(a: Attestation, signatures: string[]): string {
  // Note: we pass the struct as a named tuple; ethers will encode in positional order
  return coder.encode(
    [
      "tuple(uint256 challengeId,address subject,uint64 periodStart,uint64 periodEnd,uint8 ruleKind,uint32 minDaily,bytes32 datasetHash,bool pass,uint256 chainId,address verifier)",
      "bytes[]"
    ],
    [a, signatures]
  );
}