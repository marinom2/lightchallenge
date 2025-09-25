import { header, info, fail, context } from "../dev/utils";

async function main() {
  header("Set Fee Caps (DAO)");
  const { net, addr, signer, signerIndex, cp } = await context();

  const losersFeeMaxBps = Number(process.env.LOSERS_FEE_MAX_BPS ?? "1000");
  const charityMaxBps   = Number(process.env.CHARITY_MAX_BPS ?? "500");
  const loserCashbackMaxBps = Number(process.env.LOSER_CASHBACK_MAX_BPS ?? "200");

  const tx = await cp.setFeeCaps({
    losersFeeMaxBps,
    charityMaxBps,
    loserCashbackMaxBps
  });
  const rec = await tx.wait();
  info("Tx", tx.hash);
  info("Block", rec.blockNumber);
}

main().catch(fail);