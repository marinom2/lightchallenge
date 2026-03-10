// scripts/inspect/status.ts
// Pretty / JSON status for a deployed ChallengePay (global contract config view).
//
// Usage:
//   MODE=table|json [NATIVE_SYMBOL=ETH] [CONTRACT_ADDR=0x...] \
//   npx hardhat run scripts/inspect/status.ts --network <net>
//
import hre from "hardhat";
const { ethers, network } = hre;
import * as fs from "fs";
import * as path from "path";

/** ───────────── Small local helpers (no utils dependency) ───────────── */
function header(title: string) {
  const line = "=".repeat(80);
  console.log(`\n${line}\n${title}\n${line}\n`);
}
function info(label: string, value: string) {
  console.log(`${label.padEnd(16)}: ${value}`);
}
function warn(msg: string) {
  console.log(`\n⚠️  ${msg}\n`);
}
function fail(e: any) {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
}
function fmtWei(v: bigint): string {
  const s = ethers.formatUnits(v, 18);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
function pickAddressFromDeployment(dep: any): string | undefined {
  const keys = ["address", "contract", "ChallengePay", "cp", "Contract", "contractAddress"];
  for (const k of keys) {
    const v = dep?.[k];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return v;
  }
  return undefined;
}
const iso = (n: number | bigint) => new Date(Number(n) * 1000).toISOString();

/** ───────────── Main ───────────── */
async function main() {
  const MODE = (process.env.MODE || "table").toLowerCase(); // "table" | "json"
  const net = process.env.HARDHAT_NETWORK || network.name || "lightchain";
  const NATIVE_SYMBOL = process.env.NATIVE_SYMBOL || "ETH";

  header("Status / Config");

  // Resolve contract address (deployments/<net>.json or env CONTRACT_ADDR)
  const envAddr = process.env.CONTRACT_ADDR || process.env.CONTRACT;
  let addr = (envAddr && /^0x[0-9a-fA-F]{40}$/.test(envAddr)) ? envAddr : "";

  const deployFile = path.join("deployments", `${net}.json`);
  let dep: any = {};
  if (!addr) {
    if (!fs.existsSync(deployFile)) {
      throw new Error(
        `Missing contract address. Set CONTRACT_ADDR=0x... or create ${deployFile} with an "address" field.`
      );
    }
    dep = JSON.parse(fs.readFileSync(deployFile, "utf8"));
    addr = pickAddressFromDeployment(dep) || "";
    if (!addr) {
      throw new Error(
        `No valid address found in ${deployFile}. Present keys: [${Object.keys(dep).join(", ")}].`
      );
    }
  }

  // Check on-chain code exists
  const code = await ethers.provider.getCode(addr);
  if (!code || code === "0x") {
    throw new Error(
      `No bytecode found at ${addr} on ${net}. If the node was reset, re-deploy then update deployments/${net}.json.`
    );
  } else {
    console.log(`✅ Deployment file points to active contract ${addr}`);
  }

  // Wire the contract (named "ChallengePay")
  const [signer] = await ethers.getSigners();
  const cp = await ethers.getContractAt("ChallengePay", addr, signer);

  info("Network", net);
  info("Reader", `${await signer.getAddress()} (index ${process.env.SIGNER_INDEX ?? "?"})`);
  info("Contract", addr);

  // Pull fields defensively (supports older ABIs)
  const admin: string =
    await (cp as any).admin?.().catch(() => "0x0000000000000000000000000000000000000000");
  const dao: string =
    await (cp as any).daoTreasury?.().catch(() => "0x0000000000000000000000000000000000000000");
  const threshold: bigint =
    await (cp as any).approvalThresholdBps?.().catch(() => 0n);
  const lead: bigint =
    (await (cp as any).approvalLeadTime?.().catch(() => undefined)) ??
    (await (cp as any).approvalLeadTimeSec?.().catch(() => 0n)) ??
    0n;

  const caps = await (cp as any).feeCaps?.().catch(() => null as any);
  const f = await (cp as any).feeConfig?.().catch(() => null as any);

  const totalStake: bigint = await (cp as any).totalValidatorStake?.().catch(() => 0n);
  const minStake:   bigint = await (cp as any).minValidatorStake?.().catch(() => 0n);
  const quorumBps:  bigint = await (cp as any).quorumBps?.().catch(() => 0n);
  const cooldown:   bigint = await (cp as any).unstakeCooldownSec?.().catch(() => 0n);

  const paused: boolean =
    await (cp as any).paused?.().catch(() => false);

  // nextChallengeId supports both nextChallengeIdView() and nextChallengeId()
  const next: bigint =
    (await (cp as any).nextChallengeIdView?.().catch(() => undefined)) ??
    (await (cp as any).nextChallengeId?.().catch(() => 0n)) ??
    0n;

  const latest = await ethers.provider.getBlock("latest");
  const now = Number(latest?.timestamp ?? Math.floor(Date.now() / 1000));

  if (MODE === "json") {
    const out = {
      network: net,
      contract: addr,
      reader: await signer.getAddress(),
      now,
      nowISO: iso(now),
      paused,
      config: {
        admin,
        daoTreasury: dao,
        thresholdBps: Number(threshold),
        approvalLeadTimeSec: Number(lead),
        quorumBps: Number(quorumBps),
        unstakeCooldownSec: Number(cooldown),
      },
      feeCaps: caps
        ? {
            losersFeeMaxBps: Number(caps.losersFeeMaxBps ?? caps[0] ?? 0),
            charityMaxBps: Number(caps.charityMaxBps ?? caps[1] ?? 0),
            loserCashbackMaxBps: Number(caps.loserCashbackMaxBps ?? caps[2] ?? 0),
          }
        : null,
      feeConfig: f
        ? {
            losersFeeBps: Number(f.losersFeeBps ?? f[0] ?? 0),
            daoBps: Number(f.daoBps ?? f[1] ?? 0),
            creatorBps: Number(f.creatorBps ?? f[2] ?? 0),
            validatorsBps: Number(f.validatorsBps ?? f[3] ?? 0),
            rejectFeeBps: Number(f.rejectFeeBps ?? f[4] ?? 0),
            rejectDaoBps: Number(f.rejectDaoBps ?? f[5] ?? 0),
            rejectValidatorsBps: Number(f.rejectValidatorsBps ?? f[6] ?? 0),
            loserCashbackBps: Number(f.loserCashbackBps ?? f[7] ?? 0),
          }
        : null,
      validators: {
        totalStake: fmtWei(totalStake),
        minStake: fmtWei(minStake),
        quorumBps: Number(quorumBps),
        unstakeCooldownSec: Number(cooldown),
      },
      nextChallengeId: Number(next),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // Pretty (table) output
  console.log("\nRUNTIME");
  console.log("=======");
  console.log(`now                  : ${now} (${iso(now)})`);
  console.log(`paused               : ${paused ? "true" : "false"}`);

  console.log("\nCONFIG");
  console.log("=======");
  console.log(`admin                 : ${admin}`);
  console.log(`daoTreasury           : ${dao}`);
  console.log(`thresholdBps          : ${threshold}`);
  console.log(`approvalLeadTime      : ${lead} sec`);
  console.log(`quorumBps             : ${quorumBps}`);
  console.log(`unstakeCooldown       : ${cooldown} sec`);

  if (!caps) warn("feeCaps() not available on this ABI.");
  console.log("\nFEE CAPS");
  console.log("========");
  console.log(
    `losersFeeMaxBps       : ${caps ? Number(caps.losersFeeMaxBps ?? caps[0]) : "-"}`
  );
  console.log(
    `charityMaxBps         : ${caps ? Number(caps.charityMaxBps ?? caps[1]) : "-"}`
  );
  console.log(
    `loserCashbackMaxBps   : ${caps ? Number(caps.loserCashbackMaxBps ?? caps[2]) : "-"}`
  );

  if (!f) warn("feeConfig() not available on this ABI.");
  console.log("\nFEE CONFIG (current)");
  console.log("=====================");
  console.log(`losersFeeBps          : ${f ? Number(f.losersFeeBps ?? f[0]) : "-"}`);
  console.log(`  daoBps              : ${f ? Number(f.daoBps ?? f[1]) : "-"}`);
  console.log(`  creatorBps          : ${f ? Number(f.creatorBps ?? f[2]) : "-"}`);
  console.log(`  validatorsBps       : ${f ? Number(f.validatorsBps ?? f[3]) : "-"}`);
  console.log(`rejectFeeBps          : ${f ? Number(f.rejectFeeBps ?? f[4]) : "-"}`);
  console.log(`  rejectDaoBps        : ${f ? Number(f.rejectDaoBps ?? f[5]) : "-"}`);
  console.log(`  rejectValidatorsBps : ${f ? Number(f.rejectValidatorsBps ?? f[6]) : "-"}`);
  console.log(`loserCashbackBps      : ${f ? Number(f.loserCashbackBps ?? f[7]) : "-"}`);

  console.log("\nVALIDATORS");
  console.log("==========");
  console.log(`totalStake            : ${fmtWei(totalStake)} ${NATIVE_SYMBOL}`);
  console.log(`minStake              : ${fmtWei(minStake)} ${NATIVE_SYMBOL}`);
  console.log(`quorumBps             : ${quorumBps}`);
  console.log(`unstakeCooldown       : ${cooldown} sec`);

  console.log("\nNEXT");
  console.log("====");
  console.log(`nextChallengeId       : ${next}\n`);
}

main().catch(fail);