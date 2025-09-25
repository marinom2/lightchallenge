import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ethers";
// scripts/getSnapshot.ts
import hre, { artifacts } from "hardhat";
import hardhat from "hardhat";
const { ethers } = hardhat;
import fs from "fs";

const {
  CH_ID,
  CONTRACT_ADDR,
  CONTRACT_NAME,
  DISPLAY_SYMBOL = "LCAI",
} = process.env;

if (CH_ID === undefined) {
  console.error("❌ Set CH_ID, e.g.  CH_ID=4 npx hardhat run scripts/getSnapshot.ts --network localhost");
  process.exit(1);
}

const CANDIDATE_ARTIFACTS = [
  CONTRACT_NAME || "",
  "ChallengePay",
  "LightChallenge",
  "LightChallengeCore",
  "Challenge",
  "Main",
  "Core",
].filter(Boolean);

function readDeploymentAddress(networkName: string): string | null {
  const p = `deployments/${networkName}.json`;
  if (!fs.existsSync(p)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    const keys = [
      "ChallengePay", "challenge", "main", "core",
      "LightChallenge", "LightChallengeCore", "address",
    ];
    for (const k of keys) {
      const val = json[k];
      if (typeof val === "string" && /^0x[0-9a-fA-F]{40}$/.test(val)) return val;
    }
  } catch {}
  return null;
}

const fmt = (wei: bigint) => `${ethers.formatEther(wei)} ${DISPLAY_SYMBOL}`;

function rightSideToStr(v: number) {
  // enum RightSide { None(0), Approval(1), Reject(2) }
  return v === 1 ? "Approval" : v === 2 ? "Reject" : "None";
}

async function bindContract() {
  const net = hre.network.name;
  const addr = CONTRACT_ADDR || readDeploymentAddress(net) || "";
  let lastErr: unknown;

  for (const name of CANDIDATE_ARTIFACTS) {
    try {
      const c = await ethers.getContractAt(name, addr);
      await c.getAddress();
      const art = await artifacts.readArtifact(name);
      return { c, address: addr, artifactName: name, abi: art.abi };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `❌ Unable to bind contract at ${addr || "<unknown>"}.\n` +
    `Provide CONTRACT_ADDR / CONTRACT_NAME, or ensure 'ChallengePay' is in deployments/${hre.network.name}.json.\n` +
    `Last error: ${String(lastErr)}`
  );
}

async function main() {
  const net = hre.network.name;
  const id = BigInt(CH_ID!);

  const { c, address, artifactName } = await bindContract();

  // types from ChallengePay.SnapshotView
  type SnapshotView = {
    set: boolean;
    success: boolean;
    rightSide: bigint;           // uint8
    eligibleValidators: bigint;  // uint32
    winnersPool: bigint;
    losersPool: bigint;
    loserCashback: bigint;
    losersAfterCashback: bigint;
    charityAmt: bigint;
    daoAmt: bigint;
    creatorAmt: bigint;
    validatorsAmt: bigint;
    perWinnerBonusX: bigint;     // 1e18 scale
    perLoserCashbackX: bigint;   // 1e18 scale
    perValidatorAmt: bigint;
  };

  const s = (await c.getSnapshot(id)) as SnapshotView;

  console.log("\n" + "=".repeat(80));
  console.log("Snapshot (post-finalize)");
  console.log("=".repeat(80) + "\n");

  console.log(`Network           : ${net}`);
  console.log(`Artifact          : ${artifactName}`);
  console.log(`Contract          : ${address}`);
  console.log(`Challenge         : ${id}\n`);

  if (!s.set) {
    console.log("⛔ Snapshot not set yet. Finalize the challenge first.");
    return;
  }

  console.log(`Outcome           : ${s.success ? "SUCCESS" : "FAIL"}`);
  console.log(`Right side        : ${rightSideToStr(Number(s.rightSide))}`);
  console.log(`Elig. validators  : ${s.eligibleValidators.toString()}\n`);

  console.log("POOLS");
  console.log("-----");
  console.log(`winnersPool       : ${fmt(s.winnersPool)}`);
  console.log(`losersPool        : ${fmt(s.losersPool)}\n`);

  console.log("FEES & CASHBACK");
  console.log("---------------");
  console.log(`loserCashback     : ${fmt(s.loserCashback)}`);
  console.log(`afterCashback     : ${fmt(s.losersAfterCashback)}`);
  console.log(`  - charity       : ${fmt(s.charityAmt)}`);
  console.log(`  - dao           : ${fmt(s.daoAmt)}`);
  console.log(`  - creator       : ${fmt(s.creatorAmt)}`);
  console.log(`  - validators    : ${fmt(s.validatorsAmt)}\n`);

  console.log("PER-UNIT CONSTANTS");
  console.log("-------------------");
  // Note: perWinnerBonusX/perLoserCashbackX are 1e18-scaled multipliers
  const toPct = (x: bigint) => (Number(x) / 1e16).toFixed(4) + "%"; // ~ (x / 1e18)*100
  console.log(`perWinnerBonusX   : ${s.perWinnerBonusX.toString()}  (~${toPct(s.perWinnerBonusX)} of principal)`);
  console.log(`perLoserCashbackX : ${s.perLoserCashbackX.toString()}  (~${toPct(s.perLoserCashbackX)} of principal)`);
  console.log(`perValidatorAmt   : ${fmt(s.perValidatorAmt)}\n`);

  console.log("✅ Snapshot loaded.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});