// scripts/dev/grant-operator.ts
import * as hre from "hardhat";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as readline from "readline";

type Deployments = {
  chainId?: number;
  rpcUrl?: string;
  contracts?: Record<string, string>;
};

function loadDeployments(): Deployments | undefined {
  const p = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json");
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf8")) as Deployments;
}

function mustAddress(label: string, v?: string): string {
  if (!v) throw new Error(`Missing ${label}. Set ${label}=0x... in env or deployments.`);
  try {
    return hre.ethers.getAddress(v);
  } catch {
    throw new Error(`Invalid address for ${label}: ${v}`);
  }
}

async function confirm(promptText: string) {
  if (process.env.YES === "1" || process.env.CI === "1") return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans: string = await new Promise((resolve) =>
    rl.question(`\n⚠️  Confirm: ${promptText}\nType "yes" to continue: `, resolve)
  );
  rl.close();
  if (ans.trim().toLowerCase() !== "yes") throw new Error("Aborted by user.");
}

async function main() {
  const { ethers, network } = hre;
  const dep = loadDeployments();

  const TREASURY = mustAddress(
    "TREASURY_ADDR",
    process.env.TREASURY_ADDR || process.env.TREASURY || dep?.contracts?.Treasury
  );

  const CHALLENGEPAY = mustAddress(
    "CHALLENGEPAY_ADDR",
    process.env.CHALLENGEPAY_ADDR ||
      process.env.CP_ADDR ||
      process.env.CHALLENGE_PAY ||
      dep?.contracts?.ChallengePay
  );

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available");
  const signerAddr = ethers.getAddress(await signer.getAddress());

  console.log(`\n==============================`);
  console.log(`Grant Treasury OPERATOR_ROLE`);
  console.log(`==============================`);
  console.log(`Network      : ${network.name}`);
  console.log(`Signer       : ${signerAddr}`);
  console.log(`Treasury     : ${TREASURY}`);
  console.log(`ChallengePay : ${CHALLENGEPAY}\n`);

  const treasury = new ethers.Contract(
    TREASURY,
    [
      "function OPERATOR_ROLE() view returns (bytes32)",
      "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
      "function hasRole(bytes32 role, address account) view returns (bool)",
      "function grantRole(bytes32 role, address account)",
    ],
    signer
  );

  const OPERATOR_ROLE: string = await treasury.OPERATOR_ROLE();
  const DEFAULT_ADMIN_ROLE: string = await treasury.DEFAULT_ADMIN_ROLE();

  console.log(`OPERATOR_ROLE      : ${OPERATOR_ROLE}`);
  console.log(`DEFAULT_ADMIN_ROLE : ${DEFAULT_ADMIN_ROLE}`);

  const already: boolean = await treasury.hasRole(OPERATOR_ROLE, CHALLENGEPAY);
  console.log(`Already operator?  : ${already ? "YES" : "NO"}`);

  if (already) {
    console.log(`\n✅ Nothing to do.\n`);
    return;
  }

  const isAdmin: boolean = await treasury.hasRole(DEFAULT_ADMIN_ROLE, signerAddr);
  console.log(`Signer is admin?   : ${isAdmin ? "YES" : "NO"}`);

  if (!isAdmin) {
    console.log(
      `\n❌ This signer cannot grant roles (not DEFAULT_ADMIN_ROLE on Treasury).\n` +
        `✅ Fix: run with the Treasury admin wallet private key, then rerun.\n`
    );
    process.exit(2);
  }

  await confirm(`grant OPERATOR_ROLE to ${CHALLENGEPAY} on ${network.name}`);

  const tx = await treasury.grantRole(OPERATOR_ROLE, CHALLENGEPAY);
  console.log(`\n⏳ Tx sent: ${tx.hash}`);
  const rec = await tx.wait();
  console.log(`✅ Mined: block ${rec.blockNumber}`);

  const after: boolean = await treasury.hasRole(OPERATOR_ROLE, CHALLENGEPAY);
  console.log(`Granted?          : ${after ? "YES" : "NO"}`);

  if (!after) throw new Error("grantRole tx mined but role still not present (unexpected).");

  console.log(`\n✅ Done.\n`);
}

main().catch((e) => {
  console.error("\nERROR:", e?.message ?? e);
  process.exit(1);
});