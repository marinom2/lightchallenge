// scripts/inspect/listChallenges.ts
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();

type Mode = "table" | "json";

function getModeFromArgs(): Mode | null {
  const args = process.argv.slice(2);
  if (args.includes("--json")) return "json";
  const modeArg = args.find((a) => a.startsWith("--mode="));
  if (modeArg) {
    const v = modeArg.split("=")[1];
    if (v === "json" || v === "table") return v as Mode;
  }
  return null;
}

const STATUS = ["Active", "Finalized", "Canceled"] as const;
const OUTCOME = ["None", "Success", "Fail"] as const;

function toIso(n: bigint | number): string {
  const v = typeof n === "bigint" ? Number(n) : n;
  if (!Number.isFinite(v) || v <= 0) return "-";
  return new Date(v * 1000).toISOString();
}
const iso = (n: number | bigint) => new Date(Number(n) * 1000).toISOString();

function pickContractAddress(dep: any, envContract?: string): string | undefined {
  const env = envContract || process.env.CONTRACT_ADDR || process.env.CONTRACT;
  if (env && /^0x[0-9a-fA-F]{40}$/.test(env)) return env;

  const candidates = ["address", "contract", "Contract", "contractAddress", "cp", "ChallengePay"]
    .map((k) => dep?.[k])
    .filter(Boolean);

  const first = candidates.find((v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v));
  return first;
}

function fmtLCAIFromWeiStr(weiStr: string): string {
  try {
    return ethers.formatEther(BigInt(weiStr));
  } catch {
    return "0";
  }
}

async function main() {
  const cliMode = getModeFromArgs();
  const envMode = (process.env.MODE as Mode) ?? undefined;
  const mode: Mode = cliMode ?? envMode ?? "table";

  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const envContract = process.env.CONTRACT || process.env.CONTRACT_ADDR;

  const deploymentsPath = path.join("deployments", `${net}.json`);
  if (!fs.existsSync(deploymentsPath) && !envContract) {
    throw new Error(
      `contract address missing: set CONTRACT=0x... (or CONTRACT_ADDR) or create ${deploymentsPath} with an "address" field`
    );
  }
  const dep = fs.existsSync(deploymentsPath)
    ? JSON.parse(fs.readFileSync(deploymentsPath, "utf8"))
    : {};
  const contract = pickContractAddress(dep, envContract);
  if (!contract) {
    const keys = Object.keys(dep);
    throw new Error(
      `contract address missing in deployments JSON (${deploymentsPath}). Present keys: [${keys.join(
        ", "
      )}]. You can bypass by setting env CONTRACT=0x...`
    );
  }

  const rpc = process.env.LIGHTCHAIN_RPC;
  const pk = process.env.PRIVATE_KEY;
  if (!rpc) throw new Error("LIGHTCHAIN_RPC not set in env");
  if (!pk) throw new Error("PRIVATE_KEY not set in env");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);

  // Load ABI straight from artifacts (built by `hardhat compile`)
  const artifactPath = path.join(
    "artifacts",
    "contracts",
    "ChallengePay.sol",
    "ChallengePay.json"
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `ABI not found at ${artifactPath}. Run "npx hardhat compile" first.`
    );
  }
  const abi = JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
  const cp = new ethers.Contract(contract, abi, wallet);

  // Pull current time once for "finalizable now" flag
  const latest = await provider.getBlock("latest");
  const now = Number(latest?.timestamp ?? Math.floor(Date.now() / 1000));

  const next: bigint =
    (await (cp as any).nextChallengeIdView?.().catch(() => undefined)) ??
    (await (cp as any).nextChallengeId?.().catch(() => 0n)) ??
    0n;

  const out: any[] = [];
  for (let i = 0n; i < next; i++) {
    const ch = await (cp as any).getChallenge(i);

    const status = Number(ch.status ?? ch[0] ?? 0);
    const outcome = Number(ch.outcome ?? ch[1] ?? 0);
    const challenger = (ch.challenger ?? ch[2]) as string;

    const startTs = BigInt(ch.startTs ?? ch[8] ?? 0);

    // pools (defensively)
    const poolSuccess = BigInt(ch.poolSuccess ?? ch[12] ?? 0);
    const poolFail    = BigInt(ch.poolFail ?? ch[13] ?? 0);

    // proof (defensive reads with index fallbacks)
    const proofRequired = Boolean(ch.proofRequired ?? ch[19] ?? false);
    const proofOk       = Boolean(ch.proofOk ?? ch[20] ?? false);

    // finalization helpers
    const canFinalizeAt = Number(startTs);
    const finalizableNow =
      status !== 1 && // not already Finalized
      status !== 2 && // not Canceled
      now >= canFinalizeAt &&
      (!proofRequired || proofOk);

    out.push({
      id: Number(i),
      status: ["Active", "Finalized", "Canceled"][status] ?? String(status),
      outcome: ["None", "Success", "Fail"][outcome] ?? String(outcome),
      challenger,
      startTs: Number(startTs),
      startTsISO: toIso(startTs),
      poolSuccessWei: poolSuccess.toString(),
      poolFailWei: poolFail.toString(),
      poolSuccessLCAI: fmtLCAIFromWeiStr(poolSuccess.toString()),
      poolFailLCAI: fmtLCAIFromWeiStr(poolFail.toString()),
      proofRequired,
      proofOk,
      canFinalizeAt,
      canFinalizeAtISO: iso(canFinalizeAt),
      finalizableNow,
    });
  }

  if (mode === "json") {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log("\n================ CHALLENGES (table) ================\n");
  console.log(
    "ID | STATUS     | OUTCOME  | START (UTC)             | Proof  | Finalizable"
  );
  console.log("------------------------------------------------------------------------------------");
  for (const r of out) {
    const id = String(r.id).padStart(2);
    const st = (r.status + "        ").slice(0, 10);
    const oc = (r.outcome + "        ").slice(0, 8);
    const proofCell = r.proofRequired ? (r.proofOk ? "req✓" : "req✗") : "n/a ";
    const finCell = r.finalizableNow ? "yes" : "no";
    console.log(
      `${id} | ${st} | ${oc} | ${r.startTsISO.padEnd(24)} | ${proofCell} | ${finCell}`
    );
  }
  console.log("----------------------------------------------------------------------------------------------------------------\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});