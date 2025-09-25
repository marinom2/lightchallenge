// scripts/ops/claimValidator.ts
import hardhat from "hardhat";
const { ethers } = hardhat;
import { context, header, info, fail } from "../dev/utils";

async function main() {
  header("Claim — Validator Reward");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const me = await signer.getAddress();

  info("Network", net);
  info("Signer", me);
  info("Contract", addr);
  info("Challenge", id.toString());

  // Preferred path: use helper to pre-check claimability (new enhanced contract)
  try {
    const infoTuple = await cp.getValidatorClaimInfo(id, me);
    const snapshotSet          = infoTuple[0] as boolean;
    const isRejected           = infoTuple[1] as boolean;
    const voted                = infoTuple[2] as boolean;
    const rightSide            = infoTuple[3] as boolean;
    const alreadyClaimedFinal  = infoTuple[4] as boolean;
    const alreadyClaimedReject = infoTuple[5] as boolean;
    const perValidatorFinal    = BigInt(infoTuple[6]);
    const perValidatorReject   = BigInt(infoTuple[7]);

    console.log("Helper:", {
      snapshotSet, isRejected, voted, rightSide,
      alreadyClaimedFinal, alreadyClaimedReject,
      perValidatorFinal: ethers.formatUnits(perValidatorFinal, 18),
      perValidatorReject: ethers.formatUnits(perValidatorReject, 18),
    });

    const canFinalized = snapshotSet && rightSide && !alreadyClaimedFinal && perValidatorFinal > 0n;
    const canReject    = !snapshotSet && isRejected && voted && !alreadyClaimedReject && perValidatorReject > 0n;

    if (!canFinalized && !canReject) {
      console.log("\nℹ️  Nothing claimable for this validator right now.\n");
      return;
    }
  } catch {
    // Helper not present on older deployments — continue with feature detection below.
  }

  // Detect available claim function name (supports older/newer builds)
  const hasFn = (name: string) =>
    !!(
      (cp.interface && typeof (cp.interface as any).getFunction === "function" &&
        ((cp.interface as any).getFunction(name) ||
          (cp.interface as any).functions?.[name])) ||
      (cp as any)[name]
    );

  const fnName =
    hasFn("claimValidator(uint256)") ? "claimValidator" :
    hasFn("claimValidatorReward(uint256)") ? "claimValidatorReward" :
    "";

  if (!fnName) {
    console.log(
      "\nℹ️  This build has no claimable validator function.\n" +
      "    Either validators were paid in finalize(), validator share is 0, or this is an old build.\n"
    );
    return;
  }

  const tx = await (cp as any)[fnName](id);
  info("Tx", tx.hash);
  const rec = await tx.wait();
  info("Block", rec.blockNumber);
  console.log(`\n✅ Validator claim executed via ${fnName}().\n`);
}

main().catch(fail);