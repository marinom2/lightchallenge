// webapp/lib/aivmPoiResult.ts
import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";

export const AIVM_POI_RESULT_SCHEMA_V1 = 1;

export type AivmPoiProofV1 = {
  schemaVersion: number;
  requestId: bigint;
  taskId: Hex;
  challengeId: bigint;
  subject: Address;
  passed: boolean;
  score: bigint;
  evidenceHash: Hex;
  benchmarkHash: Hex;
  metricHash: Hex;
  evaluatedAt: bigint;
  modelDigest: Hex;
  paramsHash: Hex;
};

function normalizeHex32(v: Hex): Hex {
  return v.toLowerCase() as Hex;
}

export function buildCanonicalAivmPoiResultString(p: AivmPoiProofV1): string {
  return [
    "CP-AIVM-POI-V1",
    `schemaVersion=${p.schemaVersion}`,
    `requestId=${p.requestId.toString()}`,
    `taskId=${normalizeHex32(p.taskId)}`,
    `challengeId=${p.challengeId.toString()}`,
    `subject=${p.subject.toLowerCase()}`,
    `passed=${p.passed ? "1" : "0"}`,
    `score=${p.score.toString()}`,
    `evidenceHash=${normalizeHex32(p.evidenceHash)}`,
    `benchmarkHash=${normalizeHex32(p.benchmarkHash)}`,
    `metricHash=${normalizeHex32(p.metricHash)}`,
    `evaluatedAt=${p.evaluatedAt.toString()}`,
    `modelDigest=${normalizeHex32(p.modelDigest)}`,
    `paramsHash=${normalizeHex32(p.paramsHash)}`,
  ].join("|");
}

export function hashCanonicalAivmPoiResult(p: AivmPoiProofV1): Hex {
  return keccak256(stringToHex(buildCanonicalAivmPoiResultString(p)));
}

export function packChallengePayAivmPoiProof(p: AivmPoiProofV1): Hex {
  return encodeAbiParameters(
    [
      { name: "schemaVersion", type: "uint16" },
      { name: "requestId", type: "uint256" },
      { name: "taskId", type: "bytes32" },
      { name: "challengeId", type: "uint256" },
      { name: "subject", type: "address" },
      { name: "passed", type: "bool" },
      { name: "score", type: "uint256" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "benchmarkHash", type: "bytes32" },
      { name: "metricHash", type: "bytes32" },
      { name: "evaluatedAt", type: "uint64" },
      { name: "modelDigest", type: "bytes32" },
      { name: "paramsHash", type: "bytes32" },
    ],
    [
      p.schemaVersion,
      p.requestId,
      p.taskId,
      p.challengeId,
      p.subject,
      p.passed,
      p.score,
      p.evidenceHash,
      p.benchmarkHash,
      p.metricHash,
      p.evaluatedAt,
      p.modelDigest,
      p.paramsHash,
    ]
  ) as Hex;
}