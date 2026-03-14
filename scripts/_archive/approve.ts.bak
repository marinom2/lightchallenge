import hre from "hardhat";
const { ethers } = hre;
import { header, info, fail, context } from "../dev/utils";

function toBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  throw new Error(`DECISION must be true|false (got: ${v})`);
}

async function main() {
  header("Validator Approve/Reject");

  const { net, addr, signer, signerIndex, cp } = await context();
  const idStr = process.env.CH_ID ?? "";
  if (!/^[0-9]+$/.test(idStr)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(idStr);

  const yes = toBool(process.env.DECISION);

  // Show validator stake vs threshold
  const minStake = await cp.minValidatorStake();
  const stake = await cp.validatorStake(await signer.getAddress());

  info("Network", net);
  info("Sender", `${signer.address} (index ${signerIndex})`);
  info("Contract", addr);
  console.log("Validator stake:", ethers.formatUnits(stake, 18));
  console.log("Min validator stake:", ethers.formatUnits(minStake, 18));
  console.log("approveChallenge:", { id: idStr, yes });

  const tx = await cp.approveChallenge(id, yes);
  const rec = await tx.wait();

  info("Tx", tx.hash);
  info("Block", rec.blockNumber);
}

main().catch(fail);