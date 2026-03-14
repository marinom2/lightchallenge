import hre from "hardhat";
const { ethers } = hre;;
import fs from "node:fs";
import { run as runEngine } from "../../offchain/inference/engine";

type Env = {
  LIGHTCHAIN_RPC?: string;
  PRIVATE_KEY?: string;
  AIVM_VERIFIER?: string;
  CHALLENGE_ID?: string;
  SUBJECT?: string;
  RULE_JSON?: string;
  ACTIVITIES_JSON?: string;
  MODEL_ID?: string;
  MODEL_VERSION?: string;
  EVIDENCE_URI?: string;
  PARAMS_JSON?: string;
  DEADLINE_SECS?: string;
  NONCE?: string;
  EXPECTED_CALLER?: string;
};

function assertNonEmpty(name: string, val?: string | null): string {
  if (!val || String(val).toLowerCase() === "null") {
    throw new Error(`Missing or null ${name}`);
  }
  return val;
}

function keccakUtf8(s: string): `0x${string}` {
  return ethers.keccak256(ethers.toUtf8Bytes(s)) as `0x${string}`;
}

async function main() {
  const env = process.env as Env;

  const rpc = assertNonEmpty("LIGHTCHAIN_RPC", env.LIGHTCHAIN_RPC);
  const pk = assertNonEmpty("PRIVATE_KEY", env.PRIVATE_KEY);

  // Require these three explicitly; fail fast if any are missing/“null”
  const verifierRaw = assertNonEmpty("AIVM_VERIFIER", env.AIVM_VERIFIER);
  const subjectRaw = assertNonEmpty(
    "SUBJECT",
    env.SUBJECT || "0x0000000000000000000000000000000000000000"
  );
  const callerRaw = assertNonEmpty(
    "EXPECTED_CALLER",
    env.EXPECTED_CALLER || "0x0000000000000000000000000000000000000000"
  );

  // Normalize to checksummed hex → prevents ENS resolution in ethers v6
  const verifier = ethers.getAddress(verifierRaw);
  const subject = ethers.getAddress(subjectRaw);
  const challengeContract = ethers.getAddress(callerRaw);

  // Inputs with sane defaults
  const challengeId = BigInt(env.CHALLENGE_ID || "0");
  const rulePath = env.RULE_JSON || "data/examples/rule_10k_3x_week.json";
  const actsPath = env.ACTIVITIES_JSON || "data/examples/activities_run.json";

  // Run the off-chain inference engine
  const verdict = runEngine(rulePath, actsPath);
  if (!verdict.pass) {
    console.error("INFERENCE: FAIL");
    console.error("Reasons:", verdict.reasons);
    process.exit(2);
  }

  // Bind optional model / evidence / params
  const modelIdStr = env.MODEL_ID || "model://challengepay-default";
  const modelVersion = BigInt(env.MODEL_VERSION || "1");
  const evidenceUri = env.EVIDENCE_URI || verdict.evidenceHash;
  const paramsJson = env.PARAMS_JSON || fs.readFileSync(rulePath, "utf8");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const net = await provider.getNetwork();

  const deadlineSecs = BigInt(env.DEADLINE_SECS || "3600");
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + deadlineSecs;
  const nonce = BigInt(env.NONCE || "1");

  // Hashes
  const paramsHash = keccakUtf8(paramsJson);
  const evidenceHash = keccakUtf8(evidenceUri);
  const modelId = keccakUtf8(modelIdStr);

  // EIP-712 domain + types + values must match the verifier contract
  const domain = {
    name: "ChallengePay-AIVM",
    version: "1",
    chainId: Number(net.chainId),
    verifyingContract: verifier, // raw hex (no ENS)
  };

  const types = {
    Inference: [
      { name: "challengeId", type: "uint256" },
      { name: "subject", type: "address" },
      { name: "chainId", type: "uint256" },
      { name: "challengeContract", type: "address" },
      { name: "paramsHash", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "modelId", type: "bytes32" },
      { name: "modelVersion", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "nonce", type: "uint256" }
    ]
  } as const;

  const value = {
    challengeId,
    subject,
    chainId: Number(net.chainId),
    challengeContract,
    paramsHash,
    evidenceHash,
    modelId,
    modelVersion,
    deadline,
    nonce
  };

  // Sign EIP-712 (ethers v6)
  const sig = await wallet.signTypedData(domain as any, types as any, value);

  // ABI-encode the proof blob expected by verifier
  const proof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256","bytes32","bytes32","bytes32","uint256","uint256","bytes"],
    [modelVersion, modelId, evidenceHash, paramsHash, deadline, nonce, sig]
  );

  console.log("INFERENCE: PASS");
  console.log("PROOF_HEX=", proof);
  console.log("Summary:", {
    challengeId: challengeId.toString(),
    subject,
    verifier,
    challengeContract,
    evidenceHash,
    paramsHash,
    modelId: modelIdStr,
    modelVersion: modelVersion.toString(),
    deadline: deadline.toString(),
    nonce: nonce.toString()
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});