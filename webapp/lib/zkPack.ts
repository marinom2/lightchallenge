// lib/zkPack.ts
import { encodeAbiParameters, parseAbiParameters } from "viem";
/** modelHash: 0x…32, proofData: 0x.., publicSignals: bigint[] */
export function packZkProof(modelHash: `0x${string}`, proofData: `0x${string}`, publicSignals: bigint[]) {
  return encodeAbiParameters(
    parseAbiParameters("bytes32, bytes, uint256[]"),
    [modelHash, proofData, publicSignals]
  );
}
/** If enforceBinding=true, publicSignals[0] must equal keccak256(abi.encodePacked(challengeId, subject)) */