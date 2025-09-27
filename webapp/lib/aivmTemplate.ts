// webapp/lib/aivmTemplate.ts
export const domain = (chainId: number) =>
    ({
      name: "ChallengePay-AIVM",
      version: "1",
      chainId,
    } as const);
  
  export const types = {
    Inference: [
      { name: "challengeId", type: "uint256" },
      { name: "subject", type: "address" },
      { name: "chainId", type: "uint256" },
      { name: "challengeContract", type: "address" }, // <— matches solidity
      { name: "paramsHash", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "modelId", type: "bytes32" },
      { name: "modelVersion", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  } as const;
  
  export function message(input: {
    challengeId: bigint;
    subject: `0x${string}`;
    chainId: bigint;
    challengeContract: `0x${string}`;
    paramsHash: `0x${string}`;
    evidenceHash: `0x${string}`;
    modelId: `0x${string}`;
    modelVersion: bigint;
    deadline: bigint;
    nonce: bigint;
  }) {
    return input;
  }