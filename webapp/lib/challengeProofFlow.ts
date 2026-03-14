import { keccak256, toBytes, concatHex } from "viem";

export type Hex32 = `0x${string}`;

export type ChallengeBindingInput = {
  challengeId: bigint;
  subject: `0x${string}`;
  modelId: string;
  modelHash: Hex32;
  params: Record<string, any>;
  benchmarkHash?: Hex32;
};

export type ChallengeBindingResolved = {
  schemaVersion: 1;
  challengeId: bigint;
  subject: `0x${string}`;
  modelId: string;
  modelDigest: Hex32;
  params: Record<string, any>;
  paramsHash: Hex32;
  benchmarkHash: Hex32;
  taskId: Hex32;
};

export type BuildAivmRequestArgsResult = {
  model: string;
  promptHash: Hex32;
  promptId: Hex32;
  modelDigest: Hex32;
  detConfigHash: Hex32;
};

export type CanonicalAivmParamsStateInput = {
  templateId: string;
  form: Record<string, unknown>;
  intent: unknown;
  /** Fitness or gaming rule produced by template.ruleBuilder — stored as proof.params.rule */
  rule?: Record<string, unknown> | null;
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sortValue(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        const next = sortValue(value[key]);
        if (next !== undefined) acc[key] = next;
        return acc;
      }, {});
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function hashStableJson(value: unknown): Hex32 {
  return keccak256(toBytes(stableStringify(value)));
}

export function buildCanonicalAivmParamsPayload(
  input: CanonicalAivmParamsStateInput
): Record<string, unknown> {
  const safeForm = { ...(input.form ?? {}) };
  delete safeForm.templateId;
  delete safeForm.paramsPayload;
  delete safeForm.paramsHash;

  return {
    templateId: input.templateId,
    form: safeForm,
    intent: input.intent ?? null,
    ...(input.rule != null && { rule: input.rule }),
  };
}

export function makeParamsHash(params: Record<string, any>): Hex32 {
  return hashStableJson(params);
}

export function buildCanonicalAivmParamsHash(
  input: CanonicalAivmParamsStateInput
): Hex32 {
  return makeParamsHash(
    buildCanonicalAivmParamsPayload(input) as Record<string, any>
  );
}

export function makeBenchmarkHash(input: {
  templateId: string;
  modelId: string;
  intent?: unknown;
  timeline?: unknown;
  extra?: unknown;
}): Hex32 {
  return hashStableJson({
    type: "challengepay.benchmark",
    version: 1,
    templateId: input.templateId,
    modelId: input.modelId,
    intent: input.intent ?? null,
    timeline: input.timeline ?? null,
    extra: input.extra ?? null,
  });
}

export function makeResponseHash(response: string): Hex32 {
  return keccak256(toBytes(response));
}

export function makeTaskId(input: {
  challengeId: bigint;
  subject: `0x${string}`;
  modelId: string;
  paramsHash: Hex32;
  benchmarkHash: Hex32;
}): Hex32 {
  return hashStableJson({
    type: "challengepay.task",
    version: 1,
    challengeId: input.challengeId.toString(),
    subject: input.subject.toLowerCase(),
    modelId: input.modelId,
    paramsHash: input.paramsHash,
    benchmarkHash: input.benchmarkHash,
  });
}

export function resolveChallengeBinding(
  input: ChallengeBindingInput
): ChallengeBindingResolved {
  const paramsHash = makeParamsHash(input.params);
  const benchmarkHash =
    input.benchmarkHash ??
    hashStableJson({
      type: "challengepay.default-benchmark",
      version: 1,
      challengeId: input.challengeId.toString(),
      modelId: input.modelId,
    });

  const taskId = makeTaskId({
    challengeId: input.challengeId,
    subject: input.subject,
    modelId: input.modelId,
    paramsHash,
    benchmarkHash,
  });

  return {
    schemaVersion: 1,
    challengeId: input.challengeId,
    subject: input.subject,
    modelId: input.modelId,
    modelDigest: input.modelHash,
    params: input.params,
    paramsHash,
    benchmarkHash,
    taskId,
  };
}

export function buildChallengeAivmRequestArgs(
  binding: ChallengeBindingResolved
): BuildAivmRequestArgsResult {
  const promptHash = hashStableJson({
    type: "challengepay.prompt",
    version: 1,
    modelId: binding.modelId,
    params: binding.params,
  });

  const promptId = hashStableJson({
    type: "challengepay.prompt-id",
    version: 1,
    challengeId: binding.challengeId.toString(),
    subject: binding.subject.toLowerCase(),
    taskId: binding.taskId,
  });

  const detConfigHash = hashStableJson({
    type: "challengepay.det-config",
    version: 1,
    paramsHash: binding.paramsHash,
    benchmarkHash: binding.benchmarkHash,
  });

  return {
    model: binding.modelId,
    promptHash,
    promptId,
    modelDigest: binding.modelDigest,
    detConfigHash,
  };
}

function bigintToBytes32(value: bigint): Hex32 {
  const hex = value.toString(16).padStart(64, "0");
  return `0x${hex}` as Hex32;
}

export function makeAivmCommitment(input: {
  requestId: bigint;
  worker: `0x${string}`;
  secret: Hex32;
  responseHash: Hex32;
}): Hex32 {
  const packed = concatHex([
    bigintToBytes32(input.requestId),
    input.worker,
    input.secret,
    input.responseHash,
  ]);

  return keccak256(packed);
}