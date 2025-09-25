import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

type Deps = {
  ChallengePay?: string;
  zkProofVerifier?: string;
  plonkVerifier?: string;         // optional external verifier (from your zk tool)
  multiSigProofVerifier?: string; // optional, if you redeploy events verifier
  daoTreasury?: string;
};

function loadJson(p: string): any {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

function saveJson(p: string, obj: any) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

async function maybeDeploy(name: string, ...ctor: any[]): Promise<string> {
  const F = await ethers.getContractFactory(name);
  const c = await F.deploy(...ctor);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`• Deployed ${name}: ${addr}`);
  return addr;
}

function pickDaoAddress(dep: Deps): string | undefined {
  // Normalize env naming differences:
  // Prefer explicit envs, then fall back to previous deployment cache
  const candidates = [
    process.env.DAO_ADDRESS,
    process.env.DAO_TREASURY,
    process.env.ADMIN_ADDRESS, // legacy/canonical admin
    dep.daoTreasury,
  ].filter(Boolean) as string[];

  for (const a of candidates) {
    if (ethers.isAddress(a)) return a;
  }
  return undefined;
}

async function main() {
  const net = process.env.HARDHAT_NETWORK || network.name;
  const outPath = path.join("deployments", `${net}.json`);
  const dep: Deps = loadJson(outPath);

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${await deployer.getAddress()} on ${net}`);

  // ── DAO / Treasury (supports DAO_TREASURY, DAO_ADDRESS, ADMIN_ADDRESS)
  const DAO = pickDaoAddress(dep);
  if (!DAO) {
    throw new Error(
      "Set a DAO address in .env (DAO_TREASURY preferred; also accept DAO_ADDRESS or ADMIN_ADDRESS)"
    );
  }
  dep.daoTreasury = DAO;
  console.log(`• DAO Treasury: ${dep.daoTreasury}`);

  // ── (A) ChallengePay
  if (!dep.ChallengePay || process.env.REDEPLOY_CP === "1") {
    dep.ChallengePay = await maybeDeploy("ChallengePay", DAO);
  } else {
    console.log(`• Reuse ChallengePay: ${dep.ChallengePay}`);
  }

  // ── (B) ZkProofVerifier
  if (!dep.zkProofVerifier || process.env.REDEPLOY_ZK === "1") {
    dep.zkProofVerifier = await maybeDeploy("ZkProofVerifier");
  } else {
    console.log(`• Reuse ZkProofVerifier: ${dep.zkProofVerifier}`);
  }

  // ── (C) PLONK Verifier (optional — if you have one from your zk tool)
  // If you already deployed it elsewhere, pass PLONK_VERIFIER=0x... (or VERIFIER=0x...)
  if (!dep.plonkVerifier || process.env.DEPLOY_PLONK === "1") {
    const provided =
      process.env.PlonkVerifier || // odd cases
      process.env.PLONK_VERIFIER ||
      process.env.VERIFIER;

    if (provided) {
      if (!ethers.isAddress(provided)) {
        throw new Error(`PLONK_VERIFIER/VERIFIER is not a valid address: ${provided}`);
      }
      dep.plonkVerifier = provided;
      console.log(`• Use external PlonkVerifier: ${dep.plonkVerifier}`);
    } else if (process.env.DEPLOY_PLONK === "1") {
      // Name should match your generated verifier contract (e.g., "PlonkVerifier" or "Verifier")
      const name = process.env.PLONK_NAME || "PlonkVerifier";
      dep.plonkVerifier = await maybeDeploy(name);
    } else {
      console.log("• Skipping PlonkVerifier deployment (set PLONK_VERIFIER=0x... or DEPLOY_PLONK=1)");
    }
  } else {
    console.log(`• Reuse PlonkVerifier: ${dep.plonkVerifier}`);
  }

  // ── (D) MultiSigProofVerifier (optional — events)
  if (process.env.DEPLOY_MS === "1") {
    dep.multiSigProofVerifier = await maybeDeploy("MultiSigProofVerifier");
  } else if (dep.multiSigProofVerifier) {
    console.log(`• Reuse MultiSigProofVerifier: ${dep.multiSigProofVerifier}`);
  } else {
    console.log("• No MultiSigProofVerifier action (set DEPLOY_MS=1 to deploy)");
  }

  // Persist so far
  saveJson(outPath, dep);

  // ── (E) Register zk model in ZkProofVerifier (if requested)
  // MODEL => label that will be keccak'd if MODEL_HASH not set
  if (process.env.REGISTER_MODEL === "1") {
    if (!dep.zkProofVerifier) throw new Error("ZkProofVerifier address not found");
    const zk = await ethers.getContractAt("ZkProofVerifier", dep.zkProofVerifier);

    const label = process.env.MODEL || "steps-circuit@1.0.0";
    const modelHash =
      (process.env.MODEL_HASH as `0x${string}`) ||
      ethers.keccak256(ethers.toUtf8Bytes(label));

    const verifier =
      (process.env.VERIFIER as `0x${string}`) ||
      (process.env.PLONK_VERIFIER as `0x${string}`) ||
      (dep.plonkVerifier as `0x${string}`);

    if (!verifier) throw new Error("No PLONK verifier address (set VERIFIER or PLONK_VERIFIER)");
    if (!ethers.isAddress(verifier)) {
      throw new Error(`Invalid verifier address provided: ${verifier}`);
    }

    const enforce = (process.env.BINDING || "true").toLowerCase() === "true";

    const tx = await zk.setModel(modelHash, verifier, true, enforce);
    console.log(`• setModel(${label}, ${modelHash}) → ${tx.hash}`);
    await tx.wait();
  }

  // ── (F) Optionally point a challenge at a verifier now
  if (process.env.CONFIGURE_CH) {
    const chId = BigInt(process.env.CONFIGURE_CH);
    const cp = await ethers.getContractAt("ChallengePay", dep.ChallengePay!);
    const required = (process.env.REQUIRED || "true").toLowerCase() === "true";
    const which =
      (process.env.CONFIG_VERIFIER as `0x${string}`) ||
      (process.env.USE_ZK === "1"
        ? (dep.zkProofVerifier as `0x${string}`)
        : (dep.multiSigProofVerifier as `0x${string}`));

    if (!which) throw new Error("CONFIG_VERIFIER not provided and no default to use");
    if (!ethers.isAddress(which)) throw new Error(`Invalid verifier address: ${which}`);

    const tx = await cp.setProofConfig(chId, required, which);
    console.log(`• setProofConfig(${chId}, required=${required}, verifier=${which}) → ${tx.hash}`);
    await tx.wait();
  }

  // Save final
  saveJson(outPath, dep);
  console.log(`\n✅ Deployments written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});