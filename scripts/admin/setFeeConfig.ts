// scripts/admin/setFeeConfig.ts
import { header, info, fail, context } from "../dev/utils";

/** Parse number with default */
function n(v: any, d: number) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

async function main() {
  header("Set Fee Config (DAO)");
  const { net, addr, signer, signerIndex, cp } = await context();

  // Desired values (can be overridden by env)
  const losersFeeBps        = n(process.env.LOSERS_FEE_BPS,        600); // 6%
  const daoBps              = n(process.env.BPS,               200);
  const creatorBps          = n(process.env.CREATOR_BPS,           200);
  const validatorsBps       = n(process.env.VALIDATORS_BPS,        200);

  const rejectFeeBps        = n(process.env.REJECT_FEE_BPS,        200);
  const rejectDaoBps        = n(process.env.REJECT_BPS,        200);
  const rejectValidatorsBps = n(process.env.REJECT_VALIDATORS_BPS,   0);

  const loserCashbackBps    = n(process.env.LOSER_CASHBACK_BPS,    100); // 1%

  // Fetch on-chain caps so we can fail fast with friendly messages.
  const caps = await cp.feeCaps();
  const capsObj = {
    losersFeeMaxBps: Number(caps.losersFeeMaxBps),
    charityMaxBps: Number(caps.charityMaxBps),
    loserCashbackMaxBps: Number(caps.loserCashbackMaxBps),
  };

  // Off-chain guardrails (the contract enforces too; these just help earlier)
  const sumLosersSplit = daoBps + creatorBps + validatorsBps;
  if (sumLosersSplit !== losersFeeBps) {
    throw new Error(
      `Invalid losers split: dao+creator+validators (${sumLosersSplit}) != losersFeeBps (${losersFeeBps})`
    );
  }
  const sumRejectSplit = rejectDaoBps + rejectValidatorsBps;
  if (sumRejectSplit !== rejectFeeBps) {
    throw new Error(
      `Invalid reject split: rejectDaoBps+rejectValidatorsBps (${sumRejectSplit}) != rejectFeeBps (${rejectFeeBps})`
    );
  }
  if (losersFeeBps > capsObj.losersFeeMaxBps) {
    throw new Error(
      `losersFeeBps (${losersFeeBps}) exceeds cap losersFeeMaxBps (${capsObj.losersFeeMaxBps})`
    );
  }
  if (loserCashbackBps > capsObj.loserCashbackMaxBps) {
    throw new Error(
      `loserCashbackBps (${loserCashbackBps}) exceeds cap loserCashbackMaxBps (${capsObj.loserCashbackMaxBps})`
    );
  }

  // Log context + before/after
  info("Network", net);
  info("Sender ", `${signer.address} (index ${signerIndex})`);
  info("Contract", addr);
  console.log("Caps:", capsObj);

  const before = await cp.feeConfig();
  console.log("Current config:", {
    losersFeeBps: Number(before.losersFeeBps),
    daoBps: Number(before.daoBps),
    creatorBps: Number(before.creatorBps),
    validatorsBps: Number(before.validatorsBps),
    rejectFeeBps: Number(before.rejectFeeBps),
    rejectDaoBps: Number(before.rejectDaoBps),
    rejectValidatorsBps: Number(before.rejectValidatorsBps),
    loserCashbackBps: Number(before.loserCashbackBps),
  });

  const newCfg = {
    losersFeeBps,
    daoBps,
    creatorBps,
    validatorsBps,
    rejectFeeBps,
    rejectDaoBps,
    rejectValidatorsBps,
    loserCashbackBps,
  };
  console.log("Setting config to:", newCfg);

  const tx = await cp.setFeeConfig(newCfg);
  const rec = await tx.wait();

  info("Tx", tx.hash);
  info("Block", rec.blockNumber);

  const after = await cp.feeConfig();
  console.log("Updated config:", {
    losersFeeBps: Number(after.losersFeeBps),
    daoBps: Number(after.daoBps),
    creatorBps: Number(after.creatorBps),
    validatorsBps: Number(after.validatorsBps),
    rejectFeeBps: Number(after.rejectFeeBps),
    rejectDaoBps: Number(after.rejectDaoBps),
    rejectValidatorsBps: Number(after.rejectValidatorsBps),
    loserCashbackBps: Number(after.loserCashbackBps),
  });
}

main().catch(fail);