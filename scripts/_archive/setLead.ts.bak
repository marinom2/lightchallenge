import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ethers";
// scripts/setLead.ts
import hre from "hardhat";
const { ethers, network } = hre;
import { header, info, warn, fail, context, confirmDangerousAction } from "../dev/utils";

function parseLead(): number | null {
  // support both LEAD and LEAD_SECS, prefer LEAD if both are present
  const raw = (process.env.LEAD ?? process.env.LEAD_SECS ?? "").trim();
  if (raw === "") return null;

  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return NaN as any;
  return n;
}

async function main() {
  header("Set Approval Lead Time (seconds)");
  const { net, addr, signer, signerIndex, cp } = await context();

  // Ensure the address actually has code (fresh local nodes reset state)
  const code = await ethers.provider.getCode(addr);
  if (code === "0x") {
    const redeployCmd =
      net === "localhost" ? "npm run deploy:local" :
      net === "lightchain" ? "npm run deploy" : `hardhat run scripts/deploy.ts --network ${net}`;
    throw new Error(
      `No contract code at ${addr} on ${net}. ` +
      `Did you restart the node? Redeploy (e.g. "${redeployCmd}") and try again.`
    );
  }

  const desired = parseLead();
  if (desired === null) {
    warn(
      [
        "No lead seconds provided.",
        "Usage examples:",
        "  # Lightchain / testnet:",
        "  CONFIRM=YES LEAD=21600 npx hardhat run scripts/setLead.ts --network lightchain",
        "",
        "  # Localhost: allow zero for fast iteration",
        "  LEAD=0 npx hardhat run scripts/setLead.ts --network localhost",
        "  # or",
        "  LEAD_SECS=0 npx hardhat run scripts/setLead.ts --network localhost",
      ].join("\n")
    );
    process.exit(1);
  }
  if (Number.isNaN(desired)) {
    throw new Error(`Invalid LEAD/LEAD_SECS value. Must be an integer number of seconds (>=0 on localhost, >0 elsewhere).`);
  }

  const isLocal = network.name === "localhost" || net === "localhost";
  if (!isLocal && desired <= 0) {
    throw new Error(`LEAD must be a positive integer on ${net}. (Zero is only allowed on localhost.)`);
  }

  const current: bigint = await cp.approvalLeadTime();

  info("Network", net);
  info("Sender ", `${signer.address} (index ${signerIndex})`);
  info("Contract", addr);
  info("currentLeadSec", current.toString());
  info("newLeadSec    ", String(desired));

  if (current === BigInt(desired)) {
    warn("Already set to this value. Nothing to do.");
    return;
  }

  if (!isLocal) {
    await confirmDangerousAction(`set approval lead time on ${net} to ${desired}s`);
  }

  const tx = await cp.setApprovalLeadTime(desired);
  const rec = await tx.wait();
  info("Tx   ", tx.hash);
  info("Block", rec.blockNumber);

  const after: bigint = await cp.approvalLeadTime();
  info("updatedLeadSec", after.toString());
}

main().catch(fail);