// webapp/lib/aivmProofPack.ts
import { encodeAbiParameters, type Hex } from "viem";

/**
 * Pack a signed AIVM inference for AivmProofVerifier.verify():
 * abi.encode(bytes32 modelId, uint256 modelVersion, bytes payload, bytes signature)
 */
export function packAivmProof(args: {
  modelId: Hex;          // 0x…32
  modelVersion: bigint;  // uint256
  payload: Hex;          // 0x…
  signature: Hex;        // 0x…
}): Hex {
  const { modelId, modelVersion, payload, signature } = args;
  return encodeAbiParameters(
    [
      { name: "modelId",      type: "bytes32" },
      { name: "modelVersion", type: "uint256" },
      { name: "payload",      type: "bytes"   },
      { name: "signature",    type: "bytes"   },
    ],
    [modelId, modelVersion, payload, signature]
  ) as Hex;
}