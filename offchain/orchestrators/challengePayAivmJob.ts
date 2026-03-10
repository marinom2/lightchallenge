import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  parseAbi,
  parseEventLogs,
  defineChain,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

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
  workerBondWei?: bigint;

  response: string;
  secret: Hex;
  transcriptHash?: Hex;
  slot?: bigint;

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
  responseHash: Hex;
  commitment: Hex;
  poiAttestationCount: bigint;
  poiQuorum: bigint;
  status: bigint;
  finalizedAt: bigint;
  bindingRecorded: boolean;
  requestTxHash: Hex;
  bindTxHash: Hex;
  commitTxHash: Hex;
  revealTxHash: Hex;
  poiTxHash: Hex;
};

const ZERO32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

const AIVM_ABI = parseAbi([
  "function depositWorkerBond() payable",
  "function requestInferenceV2(string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash) payable returns (uint256 requestId, bytes32 taskId)",
  "function commitInference(uint256 requestId, bytes32 commitment)",
  "function revealInference(uint256 requestId, bytes32 secret, string response)",
  "function submitPoIAttestation(bytes32 taskId, bytes32 resultHash, bytes32 transcriptHash, uint64 slot, bytes signature)",
  "function requestIdByTaskId(bytes32 taskId) view returns (uint256)",
  "function poiAttestationCount(bytes32 taskId) view returns (uint64)",
  "function poiQuorum() view returns (uint64)",
  "function poiResultHashByTask(bytes32 taskId) view returns (bytes32)",
  "function requests(uint256 requestId) view returns (address requester, string model, bytes32 modelDigest, bytes32 detConfigHash, bytes32 promptHash, bytes32 promptId, bytes32 taskId, uint256 fee, uint64 createdAt, uint64 commitDeadline, uint64 revealDeadline, uint64 finalizeDeadline, uint8 status, address worker, bytes32 commitment, uint64 committedAt, bytes32 responseHash, string response, uint64 revealedAt, uint64 finalizedAt)",
  "event InferenceRequestedV2(uint256 indexed requestId, address indexed requester, bytes32 indexed taskId, string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash)",
]);

const TASK_REGISTRY_ABI = parseAbi([
  "function recordBinding(uint256 challengeId, address subject, uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion)",
  "function getBinding(uint256 challengeId, address subject) view returns (uint256 requestId, bytes32 taskId, bytes32 modelDigest, bytes32 paramsHash, bytes32 benchmarkHash, uint16 schemaVersion, bool exists)",
]);

type RequestTuple = readonly [
  requester: Address,
  model: string,
  modelDigest: Hex,
  detConfigHash: Hex,
  promptHash: Hex,
  promptId: Hex,
  taskId: Hex,
  fee: bigint,
  createdAt: bigint,
  commitDeadline: bigint,
  revealDeadline: bigint,
  finalizeDeadline: bigint,
  status: number,
  worker: Address,
  commitment: Hex,
  committedAt: bigint,
  responseHash: Hex,
  response: string,
  revealedAt: bigint,
  finalizedAt: bigint
];

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

function padUint256Hex(v: bigint): Hex {
  return `0x${v.toString(16).padStart(64, "0")}` as Hex;
}

function concatHex(parts: Hex[]): Hex {
  return `0x${parts.map((p) => p.slice(2)).join("")}` as Hex;
}

function computeResponseHash(response: string): Hex {
  return keccak256(stringToHex(response));
}

function computeCommitment(args: {
  requestId: bigint;
  worker: Address;
  secret: Hex;
  responseHash: Hex;
}): Hex {
  const packed = concatHex([
    padUint256Hex(args.requestId),
    args.worker.toLowerCase() as Hex,
    args.secret,
    args.responseHash,
  ]);

  return keccak256(packed);
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

async function waitUntilTimestamp(args: {
  publicClient: PublicClient;
  targetTs: bigint;
  label: string;
  extraMs?: number;
}) {
  const { publicClient, targetTs, label, extraMs = 1500 } = args;

  while (true) {
    const nowBlock = await publicClient.getBlock();
    const nowTs = BigInt(nowBlock.timestamp);

    if (nowTs > targetTs) {
      return;
    }

    const waitMs = Number((targetTs - nowTs + 1n) * 1000n) + extraMs;

    console.log(`[challengePayAivmJob] waiting for ${label}...`, {
      nowTs: nowTs.toString(),
      targetTs: targetTs.toString(),
      waitMs,
    });

    await new Promise((r) => setTimeout(r, Math.max(waitMs, extraMs)));
  }
}

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
  assertHex32("secret", input.secret);

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

  const transcriptHash = input.transcriptHash ?? ZERO32;
  const slot = BigInt(input.slot ?? 0n);
  const schemaVersion = input.schemaVersion ?? 1;
  const detConfigHash = input.detConfigHash ?? input.paramsHash;

  assertHex32("transcriptHash", transcriptHash);
  assertHex32("detConfigHash", detConfigHash);

  console.log("[challengePayAivmJob] starting", {
    challengeId: input.challengeId.toString(),
    subject: input.subject,
    aivmAddress: input.aivmAddress,
    registryAddress: input.registryAddress,
    worker: account.address,
  });

  if ((input.workerBondWei ?? 0n) > 0n) {
    console.log("[challengePayAivmJob] depositing worker bond...");
    const bondTxHash = await retry(
      () =>
        walletClient.writeContract({
          address: input.aivmAddress,
          abi: AIVM_ABI,
          functionName: "depositWorkerBond",
          value: input.workerBondWei,
          account,
          chain,
        }),
      "depositWorkerBond:send"
    );

    await retry(
      () => publicClient.waitForTransactionReceipt({ hash: bondTxHash }),
      "depositWorkerBond:receipt"
    );
  }

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

  const responseHash = computeResponseHash(input.response);
  const commitment = computeCommitment({
    requestId,
    worker: account.address,
    secret: input.secret,
    responseHash,
  });

  const domain = {
    name: "AIVMInferenceV2",
    version: "1",
    chainId: input.chainId,
    verifyingContract: input.aivmAddress,
  } as const;

  const types = {
    PoIAttestation: [
      { name: "taskId", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
      { name: "transcriptHash", type: "bytes32" },
      { name: "slot", type: "uint64" },
    ],
  } as const;

  const signature = await retry(
    () =>
      walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType: "PoIAttestation",
        message: {
          taskId,
          resultHash: responseHash,
          transcriptHash,
          slot,
        },
      }),
    "signTypedData"
  );

  console.log("[challengePayAivmJob] binding request...");
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

  console.log("[challengePayAivmJob] committing inference...");
  const commitTxHash = await retry(
    () =>
      walletClient.writeContract({
        address: input.aivmAddress,
        abi: AIVM_ABI,
        functionName: "commitInference",
        args: [requestId, commitment],
        account,
        chain,
      }),
    "commitInference:send"
  );

  await retry(
    () => publicClient.waitForTransactionReceipt({ hash: commitTxHash }),
    "commitInference:receipt"
  );

  const committedReqRaw = await retry(
    () =>
      publicClient.readContract({
        address: input.aivmAddress,
        abi: AIVM_ABI,
        functionName: "requests",
        args: [requestId],
      }),
    "requests:afterCommit"
  );

  const committedReq = committedReqRaw as unknown as RequestTuple;
  const commitDeadline = committedReq[9];
  const revealDeadline = committedReq[10];

  await waitUntilTimestamp({
    publicClient,
    targetTs: commitDeadline,
    label: "reveal window",
  });

  console.log("[challengePayAivmJob] revealing inference...");
  const revealTxHash = await retry(
    () =>
      walletClient.writeContract({
        address: input.aivmAddress,
        abi: AIVM_ABI,
        functionName: "revealInference",
        args: [requestId, input.secret, input.response],
        account,
        chain,
      }),
    "revealInference:send"
  );

  await retry(
    () => publicClient.waitForTransactionReceipt({ hash: revealTxHash }),
    "revealInference:receipt"
  );

  await waitUntilTimestamp({
    publicClient,
    targetTs: revealDeadline,
    label: "PoI / finalize window",
  });

  console.log("[challengePayAivmJob] submitting PoI attestation...");
  const poiTxHash = await retry(
    () =>
      walletClient.writeContract({
        address: input.aivmAddress,
        abi: AIVM_ABI,
        functionName: "submitPoIAttestation",
        args: [taskId, responseHash, transcriptHash, slot, signature],
        account,
        chain,
      }),
    "submitPoIAttestation:send"
  );

  await retry(
    () => publicClient.waitForTransactionReceipt({ hash: poiTxHash }),
    "submitPoIAttestation:receipt"
  );

  console.log("[challengePayAivmJob] pipeline confirmed");

  const [poiAttestationCountRaw, poiQuorumRaw, reqRaw, bindingRaw] =
    await Promise.all([
      retry(
        () =>
          publicClient.readContract({
            address: input.aivmAddress,
            abi: AIVM_ABI,
            functionName: "poiAttestationCount",
            args: [taskId],
          }),
        "poiAttestationCount"
      ),
      retry(
        () =>
          publicClient.readContract({
            address: input.aivmAddress,
            abi: AIVM_ABI,
            functionName: "poiQuorum",
          }),
        "poiQuorum"
      ),
      retry(
        () =>
          publicClient.readContract({
            address: input.aivmAddress,
            abi: AIVM_ABI,
            functionName: "requests",
            args: [requestId],
          }),
        "requests"
      ),
      retry(
        () =>
          publicClient.readContract({
            address: input.registryAddress,
            abi: TASK_REGISTRY_ABI,
            functionName: "getBinding",
            args: [input.challengeId, input.subject],
          }),
        "getBinding"
      ),
    ]);

  const poiAttestationCount = BigInt(poiAttestationCountRaw as bigint);
  const poiQuorum = BigInt(poiQuorumRaw as bigint);
  const req = reqRaw as unknown as RequestTuple;
  const binding = bindingRaw as unknown as BindingTuple;

  const status = BigInt(req[12]);
  const finalizedAt = req[19];
  const bindingExists = binding[6];

  console.log("[challengePayAivmJob] finished", {
    requestId: requestId.toString(),
    taskId,
    poiAttestationCount: poiAttestationCount.toString(),
    poiQuorum: poiQuorum.toString(),
    status: status.toString(),
    finalizedAt: finalizedAt.toString(),
    bindingRecorded: bindingExists,
  });

  return {
    wallet: account.address,
    requestId,
    taskId,
    responseHash,
    commitment,
    poiAttestationCount,
    poiQuorum,
    status,
    finalizedAt,
    bindingRecorded: bindingExists,
    requestTxHash,
    bindTxHash,
    commitTxHash,
    revealTxHash,
    poiTxHash,
  };
}