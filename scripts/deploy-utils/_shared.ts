import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";



export type DeploymentsFile = {
  chainId: number;
  rpcUrl?: string;
  contracts: Record<string, string>;
};

export const OUT_DIR = join(process.cwd(), "webapp", "public", "deployments");
export const ABI_DIR = join(process.cwd(), "webapp", "public", "abi");
export const OUT_FILE = join(OUT_DIR, "lightchain.json");

export function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export function readDeploymentsFile(): DeploymentsFile | null {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8"));
  } catch {
    return null;
  }
}

export async function writeAbi(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  outFileName?: string
) {
  ensureDir(ABI_DIR);
  const art = await hre.artifacts.readArtifact(contractName);
  const file = outFileName ?? `${contractName}.abi.json`;
  writeFileSync(join(ABI_DIR, file), JSON.stringify({ abi: art.abi }, null, 2));
  hre.deployments.log(`✓ wrote ABI ${file}`);
}

export async function mergeDeployments(
  hre: HardhatRuntimeEnvironment,
  contractsPartial: Record<string, string>
) {
  const { ethers: hhEthers, deployments } = hre;
  const net = await hhEthers.provider.getNetwork();
  const chainId = Number(net.chainId);

  ensureDir(OUT_DIR);
  const RESET = (process.env.RESET_DEPLOYMENTS ?? "false").toLowerCase() === "true";
  const current = readDeploymentsFile();

  const out: DeploymentsFile = {
    chainId,
    rpcUrl: process.env.LIGHTCHAIN_RPC || process.env.NEXT_PUBLIC_RPC_URL || current?.rpcUrl,
    contracts: {
      ...(RESET ? {} : (current?.contracts || {})),
      ...contractsPartial,
    },
  };

  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  deployments.log(`✓ wrote deployments to ${OUT_FILE}`);
}

export async function hasCode(hre: HardhatRuntimeEnvironment, address: string) {
  const code = await hre.ethers.provider.getCode(address);
  return code && code !== "0x";
}

export function envAddr(name: string, v?: string) {
  if (!v) throw new Error(`Missing ${name} in env`);
  return v;
}

export function getAddrOrThrow(df: DeploymentsFile, key: string) {
  const v = df.contracts?.[key];
  if (!v) throw new Error(`Missing deployments.contracts.${key} in ${OUT_FILE}`);
  return v;
}

/**
 * Returns an ADMIN signer connected to the current Hardhat provider.
 * Requires ADMIN_PRIVATE_KEY.
 */
export function getAdminSigner(hre: HardhatRuntimeEnvironment) {
  const pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) throw new Error("Missing ADMIN_PRIVATE_KEY in env");
  return new hre.ethers.Wallet(pk, hre.ethers.provider);
}

/**
 * Optional: run admin post-deploy configuration automatically at end of deploy.
 * Currently a no-op shell — AivmProofVerifier config was removed (contract archived).
 * Extend here if future contracts need post-deploy admin calls.
 */
export async function runPostDeployConfigIfEnabled(hre: HardhatRuntimeEnvironment) {
  const enabled = (process.env.RUN_POST_DEPLOY_CONFIG ?? "true").toLowerCase() === "true";
  if (!enabled) return;

  const pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) {
    hre.deployments.log("(info) ADMIN_PRIVATE_KEY not set; skipping post-deploy config");
    return;
  }

  hre.deployments.log("✅ Post-deploy config done (no active config steps).\n");
}