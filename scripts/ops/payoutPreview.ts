// scripts/payoutPreview.ts
import { context, header, info, fmtWei, fail } from "../dev/utils";

function bps(x: bigint, b: number) { return (x * BigInt(b)) / 10_000n; }

async function main() {
  header("Payout Preview (what-if)");
  const { cp, net, addr, signer } = await context();

  const idStr = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(idStr)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(idStr);

  info("Network", net);
  info("Reader", await signer.getAddress());
  info("Contract", addr);
  info("Challenge", id.toString());

  const f = await cp.feeConfig();
  const caps = await cp.feeCaps().catch(() => null);
  const ch = await cp.getChallenge(id);

  const poolS: bigint = ch.poolSuccess;
  const poolF: bigint = ch.poolFail;
  function preview(success: boolean) {
    const winners = success ? poolS : poolF;
    const losers  = success ? poolF : poolS;

    const loserCashback = bps(losers, Number(f.loserCashbackBps));
    const losersAfterCashback = losers - loserCashback;

    const totalFee = bps(losersAfterCashback, Number(f.losersFeeBps));
    const dao      = bps(losersAfterCashback, Number(f.daoBps));
    const creator  = bps(losersAfterCashback, Number(f.creatorBps));
    const validators = bps(losersAfterCashback, Number(f.validatorsBps));

    // distributable to winners (excludes winners' own principal — this is “winnings” pot)
    const distributable = losersAfterCashback - totalFee;

    return { winners, losers, loserCashback, losersAfterCashback, dao, creator, validators, distributable };
  }

  const succ = preview(true);
  const failP = preview(false);

  console.log("\nIf OUTCOME = SUCCESS");
  console.log("--------------------");
  console.log(`winnersPool        : ${fmtWei(succ.winners)} LCAI`);
  console.log(`losersPool         : ${fmtWei(succ.losers)} LCAI`);
  console.log(`  loserCashback    : ${fmtWei(succ.loserCashback)} LCAI`);
  console.log(`  afterCashback    : ${fmtWei(succ.losersAfterCashback)} LCAI`);
  console.log(`  fee total        : ${fmtWei(succ.dao + succ.creator + succ.validators)} LCAI`);
  console.log(`    - dao          : ${fmtWei(succ.dao)} LCAI`);
  console.log(`    - creator      : ${fmtWei(succ.creator)} LCAI`);
  console.log(`    - validators   : ${fmtWei(succ.validators)} LCAI`);
  console.log(`distributable(win) : ${fmtWei(succ.distributable)} LCAI (shared pro-rata across winners)\n`);

  console.log("If OUTCOME = FAIL");
  console.log("-----------------");
  console.log(`winnersPool        : ${fmtWei(failP.winners)} LCAI`);
  console.log(`losersPool         : ${fmtWei(failP.losers)} LCAI`);
  console.log(`  loserCashback    : ${fmtWei(failP.loserCashback)} LCAI`);
  console.log(`  afterCashback    : ${fmtWei(failP.losersAfterCashback)} LCAI`);
  console.log(`  fee total        : ${fmtWei(failP.dao + failP.creator + failP.validators)} LCAI`);
  console.log(`    - dao          : ${fmtWei(failP.dao)} LCAI`);
  console.log(`    - creator      : ${fmtWei(failP.creator)} LCAI`);
  console.log(`    - validators   : ${fmtWei(failP.validators)} LCAI`);
  console.log(`distributable(win) : ${fmtWei(failP.distributable)} LCAI (shared pro-rata across winners)\n`);

  if (caps) {
    console.log("Caps (from contract)");
    console.log("--------------------");
    console.log(`losersFeeMaxBps    : ${caps.losersFeeMaxBps}`);
    console.log(`loserCashbackMaxBps: ${caps.loserCashbackMaxBps}\n`);
  }
}

main().catch(fail);