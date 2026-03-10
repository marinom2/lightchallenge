import {
  createPublicClient,
  http,
  parseAbi,
  defineChain,
  type Hex,
} from "viem";
import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const RPC = process.env.NEXT_PUBLIC_RPC_URL!;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 504);
const AIVM = process.env.AIVM_INFERENCE_V2_ADDRESS as `0x${string}`;
const DATABASE_URL = process.env.DATABASE_URL;

if (!RPC) throw new Error("NEXT_PUBLIC_RPC_URL missing");
if (!AIVM) throw new Error("AIVM_INFERENCE_V2_ADDRESS missing");
if (!DATABASE_URL) throw new Error("DATABASE_URL missing");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const chain = defineChain({
  id: CHAIN_ID,
  name: "lightchain-testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC] },
    public: { http: [RPC] },
  },
});

const client = createPublicClient({
  chain,
  transport: http(RPC),
});

const ABI = parseAbi([
  "event InferenceRequestedV2(uint256 indexed requestId, address indexed requester, bytes32 indexed taskId, string model, bytes32 promptHash, bytes32 promptId, bytes32 modelDigest, bytes32 detConfigHash)",
  "event InferenceCommitted(uint256 indexed requestId, address indexed worker, bytes32 commitment)",
  "event InferenceRevealed(uint256 indexed requestId, address indexed worker, bytes32 responseHash, string response)",
  "event PoIAttested(bytes32 indexed taskId, address indexed signer, uint64 count, bytes32 resultHash, bytes32 transcriptHash, uint64 slot)",
]);

const EVENT_INFERENCE_REQUESTED = ABI[0];
const EVENT_INFERENCE_COMMITTED = ABI[1];
const EVENT_INFERENCE_REVEALED = ABI[2];
const EVENT_POI_ATTESTED = ABI[3];

const MAX_BLOCK_RANGE = 2000n;
const POLL_MS = Number(process.env.AIVM_INDEXER_POLL_MS || 4000);
const REORG_BUFFER = 6n;

const ZERO32_STRING =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

let lastBlock: bigint = 0n;
let running = false;
let timer: NodeJS.Timeout | null = null;

type IndexedEvent =
  | {
      eventName: "InferenceRequestedV2";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        requestId?: bigint;
        requester?: `0x${string}`;
        taskId?: Hex;
        model?: string;
        promptHash?: Hex;
        promptId?: Hex;
        modelDigest?: Hex;
        detConfigHash?: Hex;
      };
    }
  | {
      eventName: "InferenceCommitted";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        requestId?: bigint;
        worker?: `0x${string}`;
        commitment?: Hex;
      };
    }
  | {
      eventName: "InferenceRevealed";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        requestId?: bigint;
        worker?: `0x${string}`;
        responseHash?: Hex;
        response?: string;
      };
    }
  | {
      eventName: "PoIAttested";
      blockNumber: bigint | null;
      transactionIndex: number | null;
      logIndex: number | null;
      args: {
        taskId?: Hex;
        signer?: `0x${string}`;
        count?: bigint | number;
        resultHash?: Hex;
        transcriptHash?: Hex;
        slot?: bigint | number;
      };
    };

function eventSort(a: IndexedEvent, b: IndexedEvent): number {
  const aBlock = a.blockNumber ?? 0n;
  const bBlock = b.blockNumber ?? 0n;
  if (aBlock !== bBlock) return aBlock < bBlock ? -1 : 1;

  const aTx = a.transactionIndex ?? 0;
  const bTx = b.transactionIndex ?? 0;
  if (aTx !== bTx) return aTx - bTx;

  const aLog = a.logIndex ?? 0;
  const bLog = b.logIndex ?? 0;
  return aLog - bLog;
}

async function getEventLogs(
  fromBlock: bigint,
  toBlock: bigint
): Promise<IndexedEvent[]> {
  const [requested, committed, revealed, poi] = await Promise.all([
    client.getLogs({
      address: AIVM,
      event: EVENT_INFERENCE_REQUESTED,
      fromBlock,
      toBlock,
      strict: false,
    }),
    client.getLogs({
      address: AIVM,
      event: EVENT_INFERENCE_COMMITTED,
      fromBlock,
      toBlock,
      strict: false,
    }),
    client.getLogs({
      address: AIVM,
      event: EVENT_INFERENCE_REVEALED,
      fromBlock,
      toBlock,
      strict: false,
    }),
    client.getLogs({
      address: AIVM,
      event: EVENT_POI_ATTESTED,
      fromBlock,
      toBlock,
      strict: false,
    }),
  ]);

  const normalized: IndexedEvent[] = [
    ...requested.map((log) => ({
      eventName: "InferenceRequestedV2" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
    ...committed.map((log) => ({
      eventName: "InferenceCommitted" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
    ...revealed.map((log) => ({
      eventName: "InferenceRevealed" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
    ...poi.map((log) => ({
      eventName: "PoIAttested" as const,
      blockNumber: log.blockNumber,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      args: log.args ?? {},
    })),
  ];

  return normalized.sort(eventSort);
}

async function ensureIndexerStateKey() {
  await pool.query(`
    insert into indexer_state (key, value)
    values ('last_aivm_block', '0')
    on conflict (key) do nothing
  `);
}

async function getLastIndexedBlock(): Promise<bigint> {
  const res = await pool.query<{ value: string }>(
    `
    select value
    from indexer_state
    where key = 'last_aivm_block'
    `
  );

  if (!res.rows.length) return 0n;

  try {
    return BigInt(res.rows[0].value);
  } catch {
    return 0n;
  }
}

async function setLastIndexedBlock(block: bigint) {
  await pool.query(
    `
    update indexer_state
    set value = $1::text
    where key = 'last_aivm_block'
    `,
    [block.toString()]
  );
}

async function bindTask(requestId: string, taskId: string) {
  const linked = await pool.query<{ challenge_id: string }>(
    `
    select challenge_id::text
    from public.aivm_jobs
    where lower(coalesce(task_id, '')) = lower($1::text)
    limit 1
    `,
    [taskId]
  );

  if (!linked.rows.length) {
    console.log("[aivmIndexer] bindTask skipped: no aivm_jobs row for taskId", {
      requestId,
      taskId,
    });
    return;
  }

  const challengeId = linked.rows[0].challenge_id;

  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          coalesce(proof, '{}'::jsonb),
          '{taskBinding}',
          jsonb_build_object(
            'requestId', $2::text,
            'taskId', $3::text,
            'schemaVersion', 1
          ),
          true
        ),
        '{verificationStatus}',
        '"requested"'::jsonb,
        true
      ),
      updated_at = now()
    where id = $1::bigint
    `,
    [challengeId, requestId, taskId]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      status = case
        when status = 'done' then status
        else 'submitted'
      end,
      updated_at = now()
    where challenge_id = $1::bigint
    `,
    [challengeId]
  );
}

async function markCommitted(requestId: string) {
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        coalesce(proof, '{}'::jsonb),
        '{verificationStatus}',
        '"committed"'::jsonb,
        true
      ),
      updated_at = now()
    where proof->'taskBinding'->>'requestId' = $1::text
    `,
    [requestId]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      status = case
        when status = 'done' then status
        else 'committed'
      end,
      updated_at = now()
    where challenge_id in (
      select id
      from public.challenges
      where proof->'taskBinding'->>'requestId' = $1::text
    )
    `,
    [requestId]
  );
}

async function markRevealed(
  requestId: string,
  responseHash: string,
  response: string
) {
  await pool.query(
    `
    update public.challenges
    set
      proof = jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(proof, '{}'::jsonb),
            '{responseHash}',
            to_jsonb($1::text),
            true
          ),
          '{response}',
          to_jsonb($2::text),
          true
        ),
        '{verificationStatus}',
        '"revealed"'::jsonb,
        true
      ),
      updated_at = now()
    where proof->'taskBinding'->>'requestId' = $3::text
    `,
    [responseHash, response, requestId]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      status = case
        when status = 'done' then status
        else 'revealed'
      end,
      updated_at = now()
    where challenge_id in (
      select id
      from public.challenges
      where proof->'taskBinding'->>'requestId' = $1::text
    )
    `,
    [requestId]
  );
}

async function markPoi(
  taskId: string,
  resultHash: string,
  transcriptHash: string,
  slot: bigint,
  count: bigint
) {
  await pool.query(
    `
    update public.challenges
    set
      status = 'Finalized',
      proof = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                coalesce(proof, '{}'::jsonb),
                '{poiResultHash}',
                to_jsonb($1::text),
                true
              ),
              '{transcriptHash}',
              to_jsonb($2::text),
              true
            ),
            '{slot}',
            to_jsonb($3::bigint),
            true
          ),
          '{poiCount}',
          to_jsonb($4::bigint),
          true
        ),
        '{verificationStatus}',
        '"finalized"'::jsonb,
        true
      ),
      updated_at = now()
    where lower(coalesce(proof->'taskBinding'->>'taskId', '')) = lower($5::text)
    `,
    [resultHash, transcriptHash, slot.toString(), count.toString(), taskId]
  );

  await pool.query(
    `
    update public.aivm_jobs
    set
      status = 'done',
      updated_at = now()
    where lower(coalesce(task_id, '')) = lower($1::text)
    `,
    [taskId]
  );
}

async function runIndexer() {
  if (running) return;
  running = true;

  try {
    const head = await client.getBlockNumber();

    if (lastBlock > head) return;

    const toBlock =
      head - lastBlock > MAX_BLOCK_RANGE
        ? lastBlock + MAX_BLOCK_RANGE
        : head;

    const fromBlock = lastBlock > REORG_BUFFER ? lastBlock - REORG_BUFFER : 0n;
    const logs = await getEventLogs(fromBlock, toBlock);

    if (logs.length > 0) {
      console.log(
        `[aivmIndexer] processing ${logs.length} event(s) from block ${fromBlock} to ${toBlock}`
      );
    }

    for (const log of logs) {
      if (log.eventName === "InferenceRequestedV2") {
        const requestId = log.args.requestId?.toString();
        const taskId = log.args.taskId ? String(log.args.taskId) : null;

        if (!requestId || !taskId) continue;

        console.log("[aivmIndexer] REQUEST", {
          requestId,
          taskId,
          block: log.blockNumber?.toString(),
        });

        await bindTask(requestId, taskId);
        continue;
      }

      if (log.eventName === "InferenceCommitted") {
        const requestId = log.args.requestId?.toString();
        if (!requestId) continue;

        console.log("[aivmIndexer] COMMIT", {
          requestId,
          block: log.blockNumber?.toString(),
        });

        await markCommitted(requestId);
        continue;
      }

      if (log.eventName === "InferenceRevealed") {
        const requestId = log.args.requestId?.toString();
        const responseHash = log.args.responseHash
          ? String(log.args.responseHash)
          : null;
        const response =
          typeof log.args.response === "string" ? log.args.response : "";

        if (!requestId || !responseHash) continue;

        console.log("[aivmIndexer] REVEAL", {
          requestId,
          responseHash,
          block: log.blockNumber?.toString(),
        });

        await markRevealed(requestId, responseHash, response);
        continue;
      }

      if (log.eventName === "PoIAttested") {
        const taskId = log.args.taskId ? String(log.args.taskId) : null;
        const resultHash = log.args.resultHash
          ? String(log.args.resultHash)
          : null;
        const transcriptHash = log.args.transcriptHash
          ? String(log.args.transcriptHash)
          : ZERO32_STRING;
        const slot = BigInt(log.args.slot ?? 0);
        const count = BigInt(log.args.count ?? 0);

        if (!taskId || !resultHash) continue;

        console.log("[aivmIndexer] POI", {
          taskId,
          resultHash,
          count: count.toString(),
          slot: slot.toString(),
          block: log.blockNumber?.toString(),
        });

        await markPoi(taskId, resultHash, transcriptHash, slot, count);
      }
    }

    lastBlock = toBlock + 1n;
    await setLastIndexedBlock(lastBlock);
  } catch (err) {
    console.error("[aivmIndexer] error:", err);
  } finally {
    running = false;
  }
}

async function shutdown(code: number) {
  try {
    if (timer) clearInterval(timer);
    console.log("[aivmIndexer] shutting down...");
    await pool.end();
  } finally {
    process.exit(code);
  }
}

async function main() {
  console.log("[aivmIndexer] starting");
  console.log("[aivmIndexer] RPC:", RPC);
  console.log("[aivmIndexer] AIVM:", AIVM);

  await ensureIndexerStateKey();

  lastBlock = await getLastIndexedBlock();

  if (lastBlock === 0n) {
    lastBlock = await client.getBlockNumber();
    await setLastIndexedBlock(lastBlock);
  }

  console.log("[aivmIndexer] starting from block", lastBlock.toString());

  await runIndexer();

  timer = setInterval(() => {
    void runIndexer();
  }, POLL_MS);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch(async (err) => {
  console.error("[aivmIndexer] fatal", err);
  await shutdown(1);
});