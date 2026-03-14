import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ethers";
// scripts/unregisterValidator.ts
import hre from "hardhat";
import hre from "hardhat";
const { ethers } = hre;
import fs from "fs";

type BigNumberish = bigint;

const {
  MODE = "request",            // "request" | "withdraw"
  SIGNER_INDEX = "0",
  AMOUNT_WEI,                  // exact wei to request
  AMOUNT_ETH,                  // or decimal ether to request
  PERCENT,                     // or percent of current stake (e.g. "50")
  ALL,                         // "1" => request full stake
  DISPLAY_SYMBOL = "LCAI",
  CONTRACT_ADDR,               // optional override
} = process.env;

const fmt = (wei: BigNumberish, sym = DISPLAY_SYMBOL) =>
  `${ethers.formatEther(wei)} ${sym}`;

function readDeploymentAddress(networkName: string): string | null {
  const p = `deployments/${networkName}.json`;
  if (!fs.existsSync(p)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(p, "utf8"));
    const keys = ["ChallengePay", "challenge", "main", "core", "address"];
    for (const k of keys) {
      const v = json[k];
      if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return v;
    }
  } catch {}
  return null;
}

// Return a bigint amount (never null). 0n means “nothing to request”.
function amountFromEnv(staked: bigint, minStake: bigint): bigint {
  if (ALL === "1") return staked;
  if (AMOUNT_WEI) return BigInt(AMOUNT_WEI);
  if (AMOUNT_ETH) return ethers.parseEther(AMOUNT_ETH);
  if (PERCENT) {
    const p = Number(PERCENT);
    if (!Number.isFinite(p) || p <= 0) return 0n;
    const pct = Math.min(100, Math.max(0, Math.floor(p)));
    return (staked * BigInt(pct)) / 100n;
  }
  // default: staked - minStake (not below 0)
  return staked > minStake ? staked - minStake : 0n;
}

async function main() {
  const net = hre.network.name;
  const addr =
    CONTRACT_ADDR ||
    readDeploymentAddress(net) ||
    "";

  if (!addr) {
    throw new Error(
      `❌ Could not determine contract address for '${net}'. Set CONTRACT_ADDR or create deployments/${net}.json with {"ChallengePay":"0x..."}`
    );
  }

  const signers = await ethers.getSigners();
  const signer = signers[Number(SIGNER_INDEX) || 0];
  const who = await signer.getAddress();

  // Minimal ABI with the EXACT functions your ChallengePay exposes
  const abi = [
    "function minValidatorStake() view returns (uint256)",
    "function unstakeCooldownSec() view returns (uint256)",
    "function validatorStake(address) view returns (uint256)",
    "function pendingUnstake(address) view returns (uint256)",
    "function pendingUnstakeUnlockAt(address) view returns (uint256)",
    "function voteLocks(address) view returns (uint256)",
    "function requestUnstake(uint256 amount)",
    "function withdrawUnstaked()",
  ];

  const c = new ethers.Contract(addr, abi, signer);

  // Reads (exact names)
  const minStake: bigint = await c.minValidatorStake();
  const cooldown: bigint = await c.unstakeCooldownSec();
  const staked: bigint = await c.validatorStake(who);
  const pending: bigint = await c.pendingUnstake(who);
  const unlockAt: bigint = await c.pendingUnstakeUnlockAt(who);
  const voteLocks: bigint = await c.voteLocks(who);

  const banner = (s: string) => {
    console.log("\n" + "=".repeat(80));
    console.log(s);
    console.log("=".repeat(80) + "\n");
  };

  banner("Unstake / Withdraw Validator");
  console.log(`Network           : ${net}`);
  console.log(`Artifact          : ChallengePay (min ABI)`);
  console.log(`Signer            : ${who}`);
  console.log(`Contract          : ${addr}\n`);
  console.log(`staked            : ${fmt(staked)}`);
  console.log(`minStake          : ${fmt(minStake)}`);
  console.log(`pendingUnstake    : ${fmt(pending)}`);
  console.log(`unlockAt          : ${unlockAt > 0n ? unlockAt.toString() : "-"}`);
  console.log(`cooldown          : ${cooldown} s`);
  console.log(`voteLocks         : ${voteLocks}\n`);

  const mode = MODE.toLowerCase();

  if (mode === "withdraw") {
    if (pending === 0n) {
      console.log("ℹ️  No pending unstake to withdraw.");
      return;
    }
    const latest = await ethers.provider.getBlock("latest");
    const now = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));
    if (unlockAt > 0n && now < unlockAt) {
      console.log("❌ Cooldown not elapsed; try withdraw later.");
      return;
    }

    try {
      const tx = await c.withdrawUnstaked();
      console.log(`Tx                : ${tx.hash}`);
      await tx.wait();
      console.log("✅ Withdraw successful.");
    } catch (e: any) {
      const msg = e?.error?.message || e?.message || String(e);
      console.log(`❌ Withdraw failed: ${msg}`);
    }
    return;
  }

  // MODE = request
  if (voteLocks > 0n) {
    console.log("❌ You are vote-locked on an active challenge; finalize first.");
    return;
  }
  if (pending > 0n) {
    console.log(
      `Unstake already requested: ${fmt(pending)} pending until ${unlockAt > 0n ? unlockAt.toString() : "-"}. ✅`
    );
    return;
  }

  let amount: bigint = amountFromEnv(staked, minStake);
  if (amount <= 0n) {
    console.log("❌ Computed request amount is zero. Nothing to request.");
    return;
  }

  // Unless ALL=1, keep at least minStake staked
  if (ALL !== "1" && minStake > 0n) {
    const maxRemovable = staked > minStake ? staked - minStake : 0n;
    if (amount > maxRemovable) amount = maxRemovable;
  }

  if (amount === 0n) {
    console.log("ℹ️  Already at or below minStake; nothing to request (try ALL=1 if full exit is allowed).");
    return;
  }
  if (amount > staked) {
    console.log(`❌ Amount (${fmt(amount)}) is greater than staked (${fmt(staked)}). Lower the amount.`);
    return;
  }

  console.log(`requestUnstake    : ${fmt(amount)}`);
  try {
    const tx = await c.requestUnstake(amount);
    console.log(`Tx                : ${tx.hash}`);
    await tx.wait();
    console.log("✅ Unstake request submitted.");
  } catch (e: any) {
    const msg = e?.error?.message || e?.message || String(e);
    if (/HasOpenVoteLocks|vote/i.test(msg)) {
      console.log("❌ Vote-locked; finalize the challenge first.");
    } else if (/MinStakeNotMet/i.test(msg)) {
      console.log("❌ Amount exceeds current stake; lower the amount.");
    } else {
      console.log(`❌ Unstake request failed: ${msg}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});