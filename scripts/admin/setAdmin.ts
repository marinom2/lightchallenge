// scripts/admin/setAdmin.ts
import * as hre from "hardhat";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import * as readline from "readline";

type Deployments = {
  chainId?: number;
  rpcUrl?: string;
  contracts?: Record<string, string>;
};

function loadDeploymentsChallengePay(): string | undefined {
  const p = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json");
  if (!existsSync(p)) return undefined;
  const j = JSON.parse(readFileSync(p, "utf8")) as Deployments;
  return j?.contracts?.ChallengePay || j?.contracts?.CHALLENGEPAY || j?.contracts?.challengePay;
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

function formatAddr(a?: string) {
  if (!a) return "(n/a)";
  const x = hre.ethers.getAddress(a);
  return `${x.slice(0, 6)}…${x.slice(-4)} (${x})`;
}

function decodeWithArtifact(e: any, iface: any): string {
  const data =
    e?.data ||
    e?.error?.data ||
    e?.error?.error?.data ||
    e?.info?.error?.data ||
    e?.info?.error?.error?.data;

  const short = e?.shortMessage || e?.reason || e?.message;
  const lines: string[] = [];
  if (short) lines.push(String(short));

  if (typeof data === "string" && data !== "0x") {
    try {
      const parsed = iface.parseError(data);
      lines.push(`CustomError: ${parsed?.name}(${(parsed?.args || []).join(",")})`);
      return lines.join("\n");
    } catch {
      // ignore
    }
    try {
      const parsed = iface.parseTransaction({ data });
      lines.push(`TxSig: ${parsed?.name}`);
    } catch {
      // ignore
    }
    lines.push(`revertData: ${data}`);
  } else if (typeof data === "string") {
    lines.push(`revertData: ${data}`);
  }

  return lines.join("\n");
}

async function main() {
  const { ethers, network, artifacts } = hre;

  const CP_ADDR = mustAddress(
    "CHALLENGEPAY_ADDR",
    process.env.CHALLENGEPAY_ADDR ||
      process.env.CP_ADDR ||
      process.env.CHALLENGE_PAY ||
      process.env.CHALLENGEPAY ||
      loadDeploymentsChallengePay()
  );

  const NEW_ADMIN = mustAddress("NEW_ADMIN", process.env.NEW_ADMIN || process.env.ADMIN_ADDRESS);

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available (ethers.getSigners())");
  const signerAddr = ethers.getAddress(await signer.getAddress());

  console.log(`\n========================`);
  console.log(`Set ChallengePay Admin`);
  console.log(`========================`);
  console.log(`Network      : ${network.name}`);
  console.log(`Signer       : ${formatAddr(signerAddr)}`);
  console.log(`ChallengePay : ${CP_ADDR}`);
  console.log(`New admin    : ${NEW_ADMIN}\n`);

  const artifact = await artifacts.readArtifact("ChallengePay");
  const iface = new ethers.Interface(artifact.abi);

  const cp = await ethers.getContractAt("ChallengePay", CP_ADDR, signer);

  const currentAdmin = await cp.admin();
  let pendingAdmin: string | undefined;
  try {
    pendingAdmin = await (cp as any).pendingAdmin();
  } catch {
    pendingAdmin = undefined;
  }

  console.log(`Current admin : ${formatAddr(currentAdmin)}`);
  if (pendingAdmin !== undefined) console.log(`Pending admin : ${formatAddr(pendingAdmin)}`);

  if (ethers.getAddress(currentAdmin) === ethers.getAddress(NEW_ADMIN)) {
    console.log(`\n✅ admin already set to NEW_ADMIN. Nothing to do.\n`);
    return;
  }

  // If pending already equals NEW_ADMIN, don't re-run transfer — just instruct accept.
  if (pendingAdmin && ethers.getAddress(pendingAdmin) === ethers.getAddress(NEW_ADMIN)) {
    console.log(`\n✅ Pending admin already set to NEW_ADMIN.`);
    console.log(`Next: run acceptAdmin with the NEW_ADMIN signer (USE_ADMIN_KEY=1).\n`);
    console.log(
      `Example:\n` +
        `  export CHALLENGEPAY_ADDR=${CP_ADDR}\n` +
        `  USE_ADMIN_KEY=1 YES=1 npx hardhat run scripts/admin/acceptAdmin.ts --network ${network.name}\n`
    );
    return;
  }

  // Candidate transfer methods (most likely first)
  const candidates = [
    "setAdmin(address)",
    "transferAdmin(address)",
    "transferOwnership(address)",
    "setOwner(address)",
  ];

  // Only consider signatures that actually exist in this artifact ABI
  const available = new Set(
    artifact.abi
      .filter((x: any) => x.type === "function")
      .map((x: any) => `${x.name}(${(x.inputs || []).map((i: any) => i.type).join(",")})`)
  );

  const usable = candidates.filter((sig) => available.has(sig));
  if (!usable.length) {
    console.log(`\n❌ No known admin-transfer methods found in ABI.`);
    console.log(`Looked for: ${candidates.join(", ")}`);
    console.log(`\nFunctions that look relevant:`);
    const rel = [...available].filter((s) => /(admin|owner|transfer|set)/i.test(s)).sort();
    for (const f of rel) console.log(`- ${f}`);
    throw new Error("No usable admin-transfer signature found.");
  }

  // Try each usable method with staticCall to ensure it’s callable
  let pickedSig: string | null = null;
  for (const sig of usable) {
    const fnName = sig.slice(0, sig.indexOf("("));
    try {
      // ethers v6: staticCall is available on functions
      await (cp as any)[fnName].staticCall(NEW_ADMIN);
      pickedSig = sig;
      break;
    } catch (e: any) {
      console.log(`\n--- Candidate ${sig} reverted during staticCall ---`);
      console.log(decodeWithArtifact(e, iface));
      console.log(`--- end ---`);
    }
  }

  if (!pickedSig) {
    throw new Error("All candidate admin-transfer methods reverted. See logs above.");
  }

  const pickedName = pickedSig.slice(0, pickedSig.indexOf("("));
  console.log(`\n✅ Using: ${pickedSig}`);

  await confirm(`execute ${pickedSig} -> ${NEW_ADMIN} on ${network.name}`);

  const tx = await (cp as any)[pickedName](NEW_ADMIN);
  console.log(`\n⏳ Tx: ${tx.hash}`);
  const rec = await tx.wait();
  console.log(`✅ Mined: block ${rec.blockNumber}`);

  const afterAdmin = await cp.admin();
  let afterPending: string | undefined;
  try {
    afterPending = await (cp as any).pendingAdmin();
  } catch {
    afterPending = undefined;
  }

  console.log(`\nAfter admin   : ${formatAddr(afterAdmin)}`);
  if (afterPending !== undefined) console.log(`After pending : ${formatAddr(afterPending)}`);

  // If 2-step, guide user clearly
  if (afterPending && ethers.getAddress(afterPending) === ethers.getAddress(NEW_ADMIN)) {
    console.log(`\n✅ Admin transfer started (2-step).`);
    console.log(`Next: NEW_ADMIN must accept.\n`);
    console.log(
      `Run:\n` +
        `  export CHALLENGEPAY_ADDR=${CP_ADDR}\n` +
        `  USE_ADMIN_KEY=1 YES=1 npx hardhat run scripts/admin/acceptAdmin.ts --network ${network.name}\n`
    );
  } else if (ethers.getAddress(afterAdmin) === ethers.getAddress(NEW_ADMIN)) {
    console.log(`\n✅ Admin updated in one step. Done.\n`);
  } else {
    console.log(`\n⚠️ Admin did not update and no pendingAdmin detected. Check contract methods/pauses.\n`);
  }
}

main().catch((e) => {
  console.error("\nERROR:", e?.message ?? e);
  process.exit(1);
});