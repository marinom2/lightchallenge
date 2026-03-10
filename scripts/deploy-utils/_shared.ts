import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";


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

export function parseCsv(env?: string): string[] {
  return (env || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
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

/* -------------------------------------------------------------------------- */
/* Helpers for post-deploy config                                              */
/* -------------------------------------------------------------------------- */

function isHexBytes32(s: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

async function tryReadOwner(contract: any): Promise<string | null> {
  try {
    if (typeof contract.owner === "function") {
      const o = await contract.owner();
      if (typeof o === "string" && o.startsWith("0x") && o.length === 42) return o;
    }
  } catch {
    // ignore
  }
  return null;
}

function shortErr(e: any) {
  return e?.shortMessage || e?.reason || e?.message || String(e);
}

/**
 * Optional: run admin post-deploy configuration automatically at end of deploy.
 * IMPORTANT: This must NEVER fail the deploy scripts. It should be best-effort.
 */
export async function runPostDeployConfigIfEnabled(hre: HardhatRuntimeEnvironment) {
  const enabled = (process.env.RUN_POST_DEPLOY_CONFIG ?? "true").toLowerCase() === "true";
  if (!enabled) return;

  const pk = process.env.ADMIN_PRIVATE_KEY;
  if (!pk) {
    hre.deployments.log("(info) ADMIN_PRIVATE_KEY not set; skipping post-deploy config");
    return;
  }

  const df = readDeploymentsFile();
  if (!df) {
    hre.deployments.log(`(info) Missing ${OUT_FILE}; skipping post-deploy config`);
    return;
  }

  const admin = getAdminSigner(hre);
  const adminAddr = (await admin.getAddress()).toLowerCase();
  hre.deployments.log(`\n🔧 Running post-deploy config as ADMIN=${await admin.getAddress()}`);

  /* ------------------------------- AIVM ---------------------------------- */
  if (df.contracts.AivmProofVerifier) {
    try {
      const aivmAddr = df.contracts.AivmProofVerifier;
      const aivm = await hre.ethers.getContractAt("AivmProofVerifier", aivmAddr, admin);

      // seed signers
      const signers = parseCsv(process.env.AIVM_SIGNERS);
      if (signers.length) {
        await (await aivm.setAivmSigners(signers, true)).wait();
        hre.deployments.log(`✓ AIVM: setAivmSigners(${signers.length})`);
      }

      // allowlist toggle
      const enforceAllow = (process.env.AIVM_ENFORCE_ALLOWLIST ?? "false").toLowerCase() === "true";
      await (await aivm.setEnforceModelAllowlist(enforceAllow)).wait();
      hre.deployments.log(`✓ AIVM: setEnforceModelAllowlist(${enforceAllow})`);

      // allowlist models (bytes32 only; skip invalid)
      const models = parseCsv(process.env.AIVM_ALLOWED_MODELS);
      let okModels = 0;
      for (const m of models) {
        if (!isHexBytes32(m)) {
          hre.deployments.log(`⚠️ AIVM: skipping invalid model hash: ${m}`);
          continue;
        }
        await (await aivm.setModelAllowed(m as `0x${string}`, true)).wait();
        okModels++;
      }
      if (okModels) hre.deployments.log(`✓ AIVM: setModelAllowed(${okModels})`);

      // min version
      const enforceMin = (process.env.AIVM_ENFORCE_MIN_VERSION ?? "false").toLowerCase() === "true";
      await (await aivm.setEnforceMinVersion(enforceMin)).wait();
      hre.deployments.log(`✓ AIVM: setEnforceMinVersion(${enforceMin})`);

      const minV = Number(process.env.AIVM_MIN_VERSION_DEFAULT || "0");
      if (enforceMin && minV > 0 && okModels) {
        for (const m of models) {
          if (!isHexBytes32(m)) continue;
          await (await aivm.setMinModelVersion(m as `0x${string}`, minV)).wait();
        }
        hre.deployments.log(`✓ AIVM: setMinModelVersion(default=${minV})`);
      }

      // ERC-1271
      const enable1271 = (process.env.AIVM_ENABLE_ERC1271 ?? "false").toLowerCase() === "true";
      await (await aivm.setEnableERC1271(enable1271)).wait();
      hre.deployments.log(`✓ AIVM: setEnableERC1271(${enable1271})`);

      const contractSigners = parseCsv(process.env.AIVM_CONTRACT_SIGNERS);
      if (enable1271 && contractSigners.length) {
        for (const w of contractSigners) {
          await (await aivm.setAivmContractSigner(w, true)).wait();
        }
        hre.deployments.log(`✓ AIVM: setAivmContractSigner(${contractSigners.length})`);
      }
    } catch (e: any) {
      // non-fatal by design
      hre.deployments.log(`⚠️ AIVM post-config failed (non-fatal): ${shortErr(e)}`);
    }
  }

  /* -------------------------- AutoApprovalStrategy ------------------------- */
  if (df.contracts.AutoApprovalStrategy) {
    try {
      const stratAddr = df.contracts.AutoApprovalStrategy;
      const strat = await hre.ethers.getContractAt("AutoApprovalStrategy", stratAddr, admin);

      const owner = await tryReadOwner(strat);
      if (owner && owner.toLowerCase() !== adminAddr) {
        hre.deployments.log(`⚠️ Strategy config skipped: ADMIN is not owner (owner=${owner})`);
      } else {
        const MIN_LEAD = Number(process.env.STRAT_MIN_LEAD || 120);
        const MAX_DUR = Number(process.env.STRAT_MAX_DUR || 30 * 24 * 3600);
        const ALLOW_NATIVE = (process.env.STRAT_ALLOW_NATIVE ?? "true").toLowerCase() === "true";
        const REQ_CREATOR_LIST = (process.env.STRAT_REQUIRE_CREATOR_ALLOWLIST ?? "false").toLowerCase() === "true";

        await (await strat.setLeadAndDuration(MIN_LEAD, MAX_DUR)).wait();
        await (await strat.setNativeAllowed(ALLOW_NATIVE)).wait();
        await (await strat.setRequireCreatorAllowlist(REQ_CREATOR_LIST)).wait();
        hre.deployments.log(
          `✓ Strategy: policy seeded (lead=${MIN_LEAD}s dur=${MAX_DUR}s native=${ALLOW_NATIVE} creatorAllow=${REQ_CREATOR_LIST})`
        );

        const erc20 = parseCsv(process.env.STRAT_ERC20_ALLOWLIST);
        for (const t of erc20) await (await strat.setERC20Allowed(t, true)).wait();

        const creators = parseCsv(process.env.STRAT_CREATOR_ALLOWLIST);
        for (const w of creators) await (await strat.setCreatorAllowed(w, true)).wait();

        if (erc20.length) hre.deployments.log(`✓ Strategy: ERC20 allowlist (${erc20.length})`);
        if (creators.length) hre.deployments.log(`✓ Strategy: creator allowlist (${creators.length})`);
      }
    } catch (e: any) {
      // non-fatal by design
      hre.deployments.log(`⚠️ Strategy post-config failed (non-fatal): ${shortErr(e)}`);
    }
  }

  hre.deployments.log("✅ Post-deploy config done.\n");
}