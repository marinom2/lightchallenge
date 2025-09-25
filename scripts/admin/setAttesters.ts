// scripts/admin/setAttesters.ts
import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import fs from "fs";
import path from "path";

// ✅ Use TypeChain factory for strong typing
import { MultiSigProofVerifier__factory } from "../../typechain-types";

function load(p: string) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

function parseAddrs(envVal: string | undefined): string[] {
  return (envVal ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const dep = load(path.join("deployments", `${network.name}.json`));
  const addr: string | undefined = process.env.VERIFIER ?? dep.multiSigVerifier;
  if (!addr) throw new Error("Missing VERIFIER or deployments.multiSigVerifier");

  const [signer] = await ethers.getSigners();

  // Connect with TypeChain factory (gives us typed methods)
  const v = MultiSigProofVerifier__factory.connect(addr, signer);

  const toSet = parseAddrs(process.env.SET);
  const toUnset = parseAddrs(process.env.UNSET);
  const thrStr = process.env.THRESH;

  console.log(`Network: ${network.name}`);
  console.log(`Sender : ${await signer.getAddress()}`);
  console.log(`Verifier: ${addr}`);

  for (const a of toSet) {
    console.log("setAttester", a, true);
    const tx = await v.setAttester(a, true);
    await tx.wait();
  }
  for (const a of toUnset) {
    console.log("setAttester", a, false);
    const tx = await v.setAttester(a, false);
    await tx.wait();
  }
  if (thrStr) {
    const m = Number(thrStr);
    if (!Number.isFinite(m) || m <= 0) throw new Error("THRESH must be a positive number");
    console.log("setThreshold", m);
    const tx = await v.setThreshold(m);
    await tx.wait();
  }

  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});