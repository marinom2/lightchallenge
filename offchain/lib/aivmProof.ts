/**
 * offchain/lib/aivmProof.ts
 *
 * Shared library for constructing AIVM inference proofs and prompts.
 *
 * This module mirrors the on-chain logic in ChallengePayAivmPoiVerifier.sol
 * and is used by:
 *   - runChallengePayAivmJob.ts — to build promptHash / promptId for AIVM requests
 *   - aivmIndexer.ts           — to build and submit the proof after PoI finalization
 *
 * IMPORTANT: buildCanonicalResultString() MUST stay byte-for-byte identical
 * to _buildCanonicalResultString() in ChallengePayAivmPoiVerifier.sol.
 * Any change here requires a matching contract update.
 */

import {
  keccak256,
  encodeAbiParameters,
  encodePacked,
  toHex,
  type Hex,
  type Address,
} from "viem";

export const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

// ─── Types ───────────────────────────────────────────────────────────────────

export type AivmPoiProofFields = {
  requestId: bigint;
  taskId: Hex;
  challengeId: bigint;
  subject: Address;
  passed: boolean;
  /** Defaults to 0 if omitted; not used in current evaluators. */
  score?: bigint;
  evidenceHash: Hex;
  benchmarkHash: Hex;
  /** Defaults to ZERO32 if omitted; not used in current evaluators. */
  metricHash?: Hex;
  /** Unix timestamp (seconds) of the off-chain verdict. */
  evaluatedAt: bigint;
  modelDigest: Hex;
  paramsHash: Hex;
};

// ─── Canonical result string ──────────────────────────────────────────────────

/**
 * Build the canonical result string that Lightchain workers MUST produce
 * for the ChallengePayAivmPoiVerifier to accept the proof.
 *
 * This exactly mirrors _buildCanonicalResultString() in
 * ChallengePayAivmPoiVerifier.sol.  Solidity uses Strings.toHexString()
 * which produces lowercase 0x-prefixed hex; we match that here.
 */
export function buildCanonicalResultString(p: AivmPoiProofFields): string {
  // Lightchain testnet workers produce: {"challengeId":"N","verified":true}
  // This must match _buildCanonicalResultString() in ChallengePayAivmPoiVerifier.sol
  return `{"challengeId":"${p.challengeId}","verified":true}`;
}

// ─── Proof encoding ───────────────────────────────────────────────────────────

/**
 * ABI-encode an AivmPoiProofV1 struct as bytes.
 *
 * This is what ChallengePay.submitProofFor(challengeId, subject, proof) expects.
 * The contract decodes with: AivmPoiProofV1 memory p = abi.decode(proof, (AivmPoiProofV1))
 */
export function encodeAivmPoiProofV1(p: AivmPoiProofFields): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
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
      },
    ],
    [
      {
        schemaVersion: 1,
        requestId: p.requestId,
        taskId: p.taskId,
        challengeId: p.challengeId,
        subject: p.subject,
        passed: p.passed,
        score: p.score ?? 0n,
        evidenceHash: p.evidenceHash,
        benchmarkHash: p.benchmarkHash,
        metricHash: p.metricHash ?? ZERO32,
        evaluatedAt: p.evaluatedAt,
        modelDigest: p.modelDigest,
        paramsHash: p.paramsHash,
      },
    ]
  );
}

// ─── Prompt construction ──────────────────────────────────────────────────────

/**
 * Build a unique, stable promptId for a (challengeId, subject) pair.
 *
 * This is bytes32-sized and unique per challenge + participant.
 * It does NOT change when the verdict changes (stable across re-evaluations).
 */
export function buildPromptId(challengeId: bigint, subject: Address): Hex {
  return keccak256(encodePacked(["uint256", "address"], [challengeId, subject]));
}

/**
 * Build a deterministic evaluation prompt payload.
 *
 * This payload contains all the information needed for a Lightchain AIVM
 * worker running our registered model to produce the canonical result string
 * (see buildCanonicalResultString).
 *
 * Key design decisions:
 * - Fixed key order → byte-identical JSON across implementations
 * - All hex values lowercase → no checksum ambiguity
 * - evaluatedAt included so the prompt is specific to this evaluation
 * - Any change to this structure is a protocol version change
 */
export function buildPromptPayload(p: {
  challengeId: bigint;
  subject: Address;
  modelId: string;
  modelDigest: Hex;
  paramsHash: Hex;
  benchmarkHash: Hex;
  verdictPass: boolean;
  evidenceHash: Hex;
  evaluatedAt: bigint;
}): string {
  return JSON.stringify({
    schema: "lc-aivm-eval-v1",
    challengeId: p.challengeId.toString(),
    subject: p.subject.toLowerCase(),
    modelId: p.modelId,
    modelDigest: p.modelDigest.toLowerCase(),
    paramsHash: p.paramsHash.toLowerCase(),
    benchmarkHash: p.benchmarkHash.toLowerCase(),
    verdict: {
      pass: p.verdictPass,
      score: 0,
      evidenceHash: p.evidenceHash.toLowerCase(),
      metricHash: ZERO32,
      evaluatedAt: p.evaluatedAt.toString(),
    },
  });
}

/**
 * Hash a prompt payload string to produce a bytes32 promptHash.
 */
export function buildPromptHash(promptPayload: string): Hex {
  return keccak256(toHex(Buffer.from(promptPayload)));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensure a value is a valid bytes32 hex string (0x + 64 hex chars).
 * Returns ZERO32 if the value is not valid.
 */
export function ensureBytes32(value: unknown): Hex {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) {
    return value as Hex;
  }
  return ZERO32;
}

/**
 * Parse a unix timestamp (seconds or milliseconds) to bigint seconds.
 * Accepts: Date, ISO string, number (ms or s), or bigint (s).
 */
export function toEpochSeconds(value: Date | string | number | bigint): bigint {
  if (value instanceof Date) {
    return BigInt(Math.floor(value.getTime() / 1000));
  }
  if (typeof value === "string") {
    return BigInt(Math.floor(new Date(value).getTime() / 1000));
  }
  if (typeof value === "number") {
    // Heuristic: if > 1e12 it's milliseconds
    return value > 1e12 ? BigInt(Math.floor(value / 1000)) : BigInt(value);
  }
  return value;
}
