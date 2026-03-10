// npx ts-node scripts/admin/setModels.ts --network lightchain
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { createPublicClient, createWalletClient, http, Hex, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const AIVM_VERIFIER_ADDR = process.env.AIVM_VERIFIER_ADDR as Hex;
const ZK_VERIFIER_ADDR = process.env.ZK_VERIFIER_ADDR as Hex;

const chain = {
  id: 504,
  name: "Lightchain Testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }
} as const;

const abi = parseAbi([
  "function setModel(bytes32 modelHash, address verifierAdapter, bool active, bool enforceBinding) external",
]);

async function main() {
  const modelsPath = path.join(process.cwd(), "webapp/public/models/models.json");
  const models = JSON.parse(fs.readFileSync(modelsPath, "utf8")) as Array<{
    modelHash: Hex; verifier: "AIVM" | "ZK" | "MULTISIG"; enforceBinding: boolean;
  }>;

  const account = privateKeyToAccount(PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
  const pub = createPublicClient({ chain, transport: http(RPC_URL) });

  // Your ZkProofVerifier’s address (the registry). Replace with your actual registry if different.
  const REGISTRY_ADDR = ZK_VERIFIER_ADDR; // assuming registry lives here

  for (const m of models) {
    const adapter =
      m.verifier === "AIVM" ? (AIVM_VERIFIER_ADDR) :
      m.verifier === "ZK"   ? (ZK_VERIFIER_ADDR)   :
      (() => { throw new Error(`Unsupported verifier ${m.verifier}`) })();

    const hash = m.modelHash as Hex;
    console.log(`Setting model ${hash} → adapter ${adapter}, enforce=${m.enforceBinding}`);
    const hashTx = await wallet.writeContract({
      address: REGISTRY_ADDR,
      abi,
      functionName: "setModel",
      args: [hash, adapter, true, m.enforceBinding],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash: hashTx });
    console.log(`✔ setModel tx: ${receipt.transactionHash}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });