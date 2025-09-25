// scripts/shared/deployments.ts
import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

export type Deps = {
  daoTreasury?: string;
  ChallengePay?: string;
  zkProofVerifier?: string;
  plonkVerifier?: string;
  multiSigProofVerifier?: string;
  // extend as your system grows
};

export function netName() {
  return process.env.HARDHAT_NETWORK || network.name;
}

export function filePath(): string {
  return path.join("deployments", `${netName()}.json`);
}

export function loadDeps(): Deps {
  const p = filePath();
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

export function saveDeps(d: Deps) {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}

export async function signer() {
  const [s] = await ethers.getSigners();
  return s;
}

export async function maybeDeploy(
  name: string,
  key: keyof Deps,
  dep: Deps,
  ...ctor: any[]
): Promise<string> {
  if ((dep as any)[key] && process.env.REDEPLOY_ALL !== "1") {
    console.log(`• Reuse ${String(key)}: ${(dep as any)[key]}`);
    return (dep as any)[key];
  }
  const F = await ethers.getContractFactory(name);
  const c = await F.deploy(...ctor);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`• Deployed ${name}: ${addr}`);
  (dep as any)[key] = addr;
  saveDeps(dep);
  return addr;
}

export function requireAddr(dep: Deps, label: keyof Deps): string {
  const v = (dep as any)[label];
  if (!v) throw new Error(`Missing ${String(label)} in ${filePath()}`);
  return v;
}

export function isAddr(x?: string): x is `0x${string}` {
  return !!x && /^0x[a-fA-F0-9]{40}$/.test(x);
}