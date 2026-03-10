// webapp/lib/aivm/bind.ts
import { Address, Hex, encodeAbiParameters, keccak256 } from "viem";

/** keccak256(abi.encode(uint256 challengeId, address subject)) → bigint */
export function computeBind(challengeId: bigint, subject: Address): bigint {
  const encoded = encodeAbiParameters(
    [
      { name: "challengeId", type: "uint256" },
      { name: "subject",     type: "address"  },
    ],
    [challengeId, subject]
  );
  return BigInt(keccak256(encoded));
}