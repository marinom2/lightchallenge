// offchain/inference/zk/plonk_adapter.ts
// Compose bytes payload: (bytes32 modelHash, bytes proofData, uint256[] publicSignals)
import { hexlify, toUtf8Bytes, zeroPadValue } from "ethers";

export function composeProofBlob(params: {
  modelHash: `0x${string}`;
  proofData: `0x${string}`;
  publicSignals: bigint[]; // include binding at index 0 if enforceBinding=true
}): `0x${string}` {
  const abi = require("ethers").AbiCoder.defaultAbiCoder();
  return abi.encode(
    ["bytes32","bytes","uint256[]"],
    [params.modelHash, params.proofData, params.publicSignals.map(v => BigInt(v.toString()))]
  ) as `0x${string}`;
}