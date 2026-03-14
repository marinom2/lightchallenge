import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEventLogs,
  defineChain,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Input for submitting a challenge to the Lightchain AIVM network.
 *
 * This orchestrator is a CLIENT of the Lightchain AIVM network. It submits
 * the inference request and records the binding in ChallengeTaskRegistry.
 *
 * Commit / reveal / PoI attestation are performed by the Lightchain network
 * workers and validators — NOT by this process. The aivmIndexer watches for
 * PoIAttested events emitted by AIVMInferenceV2 and updates DB state when
 * the network finalizes the task.
 */
export type ChallengePayAivmJobInput = {
  rpcUrl: string;
  chainId: number;
  aivmAddress: Address;
  registryAddress: Address;
  privateKey: Hex;

  challengeId: bigint;
  subject: Address;

  modelId: string;
  modelDigest: Hex;
  paramsHash: Hex;
  benchmarkHash: Hex;
  schemaVersion?: number;

  promptHash: Hex;
  promptId: Hex;
  detConfigHash?: Hex;

  requestFeeWei: bigint;

  onRequestMined?: (args: {
    requestId: bigint;
    taskId: Hex;
    requestTxHash: Hex;
    wallet: Address;
  }) => Promise<void> | void;
};

export type ChallengePayAivmJobResult = {
  wallet: Address;
  requestId: bigint;
  taskId: Hex;
  bindingRecorded: boolean;
  requestTxHash: Hex;
  bindTxHash: Hex;
};

const AIVM_ABI = parseAbi([
  "function requestInferenceV2(string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash) payable returns (uint256 requestId, bytes32 taskId)",
  "function requestIdByTaskId(bytes32 taskId) view returns (uint256)",
  "event InferenceRequestedV2(uint256 indexed requestId, address indexed requester, bytes32 indexed taskId, string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash)",
]);

const TASK_REGISTRY_ABI = parseAbi([
  "function recordBinding(uint256 challengeId, address subject, uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion)",
  "function getBinding(uint256 challengeId, address subject) view returns (uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion, bool exists)",
]);

type BindingTuple = readonly [
  requestId: bigint,
  taskId: Hex,
  modelDigest: Hex,
  paramsHash: Hex,
  benchmarkHash: Hex,
  schemaVersion: number,
  exists: boolean
];

function makeChain(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: `custom-${chainId}`,
    nativeCurrency: { name: "Native", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  });
}

async function retry<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 3,
  delayMs = 800
): Promise<T> {
  let lastErr: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) {
        console.warn(
          `[challengePayAivmJob] ${label} failed (attempt ${i + 1}/${retries}), retrying...`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastErr;
}

function assertHex32(name: string, value: Hex) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be bytes32 hex`);
  }
}

function assertAddress(name: string, value: Address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be address hex`);
  }
}

/**
 * Submit a challenge to Lightchain AIVM and record the binding.
 *
 * This orchestrator is a pure CLIENT of the Lightchain AIVM network.
 * It performs exactly two on-chain operations and then stops:
 *
 *   1. requestInferenceV2 — submit to AIVMInferenceV2, get requestId + taskId
 *   2. recordBinding — link challenge ↔ AIVM task in ChallengeTaskRegistry
 *   3. onRequestMined callback — persist binding early to DB (off-chain side effect)
 *
 * Everything after this is handled by the Lightchain network:
 *   - commitInference  — Lightchain workers
 *   - revealInference  — Lightchain workers
 *   - submitPoIAttestation — Lightchain validators (poiQuorum attestations)
 *   - _tryFinalize + InferenceFinalized event — AIVMInferenceV2 contract
 *
 * The aivmIndexer watches for InferenceFinalized and drives our finalization bridge.
 */
export async function runChallengePayAivmJob(
  input: ChallengePayAivmJobInput
): Promise<ChallengePayAivmJobResult> {
  assertAddress("aivmAddress", input.aivmAddress);
  assertAddress("registryAddress", input.registryAddress);
  assertAddress("subject", input.subject);
  assertHex32("privateKey", input.privateKey);
  assertHex32("modelDigest", input.modelDigest);
  assertHex32("paramsHash", input.paramsHash);
  assertHex32("benchmarkHash", input.benchmarkHash);
  assertHex32("promptHash", input.promptHash);
  assertHex32("promptId", input.promptId);

  const chain = makeChain(input.chainId, input.rpcUrl);
  const account = privateKeyToAccount(input.privateKey);

  const publicClient = createPublicClient({
    chain,
    transport: http(input.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(input.rpcUrl),
  });

  const schemaVersion = input.schemaVersion ?? 1;
  const detConfigHash = input.detConfigHash ?? input.paramsHash;

  assertHex32("detConfigHash", detConfigHash);

  console.log("[challengePayAivmJob] starting", {
    challengeId: input.challengeId.toString(),
    subject: input.subject,
    aivmAddress: input.aivmAddress,
    registryAddress: input.registryAddress,
    wallet: account.address,
  });

  console.log("[challengePayAivmJob] requesting inference...");
  const requestTxHash = await retry(
    () =>
      walletClient.writeContract({
        address: input.aivmAddress,
        abi: AIVM_ABI,
        functionName: "requestInferenceV2",
        args: [
          input.modelId,
          input.promptHash,
          input.promptId,
          input.modelDigest,
          detConfigHash,
        ],
        value: input.requestFeeWei,
        account,
        chain,
      }),
    "requestInferenceV2:send"
  );

  const requestRcpt = await retry(
    () => publicClient.waitForTransactionReceipt({ hash: requestTxHash }),
    "requestInferenceV2:receipt"
  );

  const requestLogs = parseEventLogs({
    abi: AIVM_ABI,
    logs: requestRcpt.logs,
    eventName: "InferenceRequestedV2",
  });

  if (!requestLogs[0]?.args?.requestId || !requestLogs[0]?.args?.taskId) {
    throw new Error("InferenceRequestedV2 event not found.");
  }

  const requestId = requestLogs[0].args.requestId;
  const taskId = requestLogs[0].args.taskId as Hex;

  console.log("[challengePayAivmJob] request mined", {
    requestId: requestId.toString(),
    taskId,
    tx: requestTxHash,
  });

  if (input.onRequestMined) {
    await input.onRequestMined({
      requestId,
      taskId,
      requestTxHash,
      wallet: account.address,
    });
  }

  console.log("[challengePayAivmJob] binding request to challenge...");
  const bindTxHash = await retry(
    () =>
      walletClient.writeContract({
        address: input.registryAddress,
        abi: TASK_REGISTRY_ABI,
        functionName: "recordBinding",
        args: [
          input.challengeId,
          input.subject,
          requestId,
          taskId,
          input.modelDigest,
          input.paramsHash,
          input.benchmarkHash,
          schemaVersion,
        ],
        account,
        chain,
      }),
    "recordBinding:send"
  );

  await retry(
    () => publicClient.waitForTransactionReceipt({ hash: bindTxHash }),
    "recordBinding:receipt"
  );

  const bindingRaw = await retry(
    () =>
      publicClient.readContract({
        address: input.registryAddress,
        abi: TASK_REGISTRY_ABI,
        functionName: "getBinding",
        args: [input.challengeId, input.subject],
      }),
    "getBinding"
  );

  const binding = bindingRaw as unknown as BindingTuple;
  const bindingRecorded = binding[6];

  console.log("[challengePayAivmJob] submitted to Lightchain AIVM", {
    requestId: requestId.toString(),
    taskId,
    bindingRecorded,
    note: "Lightchain workers will commit/reveal; validators will attest. aivmIndexer watches for finalization.",
  });

  return {
    wallet: account.address,
    requestId,
    taskId,
    bindingRecorded,
    requestTxHash,
    bindTxHash,
  };
}

