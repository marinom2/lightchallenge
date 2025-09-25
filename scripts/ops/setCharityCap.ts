// scripts/setCharityCap.ts
import { header, info, fail, context, confirmDangerousAction } from "../dev/utils";

async function main() {
  header("Set Charity Cap (BPS via setFeeCaps)");
  const { net, addr, signer, signerIndex, cp } = await context();

  const bps = Number(process.env.CHARITY_MAX_BPS ?? "100");
  if (!Number.isFinite(bps) || bps < 0 || bps > 10000) {
    throw new Error("Set CHARITY_MAX_BPS to 0..10000");
  }

  const curr = await cp.feeCaps();

  info("Network", net);
  info("Sender ", `${signer.address} (index ${signerIndex})`);
  info("Contract", addr);
  info("charityMaxBps ->", String(bps));

  await confirmDangerousAction("update charityMaxBps (caps)");

  const tx = await cp.setFeeCaps({
    losersFeeMaxBps: curr.losersFeeMaxBps,
    charityMaxBps: bps,
    loserCashbackMaxBps: curr.loserCashbackMaxBps
  });
  const rec = await tx.wait();
  info("Tx", tx.hash);
  info("Block", rec.blockNumber);
}

main().catch(fail);