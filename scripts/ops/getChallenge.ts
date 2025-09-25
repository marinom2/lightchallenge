// scripts/getChallenge.ts
import { context, header, info, fmtTs, fmtWei, latestId, fail, NATIVE_SYMBOL } from "../dev/utils";

async function main() {
  header("Get Challenge (detailed)");

  const { cp, net, addr, signer } = await context();
  info("Network", net);
  info("Reader", await signer.getAddress() + ` (index ${process.env.SIGNER_INDEX ?? "?"})`);
  info("Contract", addr);

  const idStr = process.env.CH_ID ?? "";
  let id: bigint;

  if (!/^\d+$/.test(idStr)) {
    const lid = await latestId(cp);
    if (lid == null) {
      console.log("\n(no challenges yet)\n");
      return;
    }
    id = lid;
  } else {
    id = BigInt(idStr);
  }

  const ch = await cp.getChallenge(id);

  console.log(`\nChallenge ${id.toString()} ->`);
  console.log(`  status          : ${ch.status} (0=pending,1=approved,2=rejected,3=finalized)`);
  console.log(`  outcome         : ${ch.outcome} (0=None,1=Success,2=Fail)`);
  console.log(`  challenger      : ${ch.challenger}`);
  console.log(`  currency        : ${Number(ch.currency) === 0 ? "native" : "erc20"}`);
  console.log(`  token           : ${ch.token}`);
  console.log(`  stake           : ${fmtWei(ch.stake)} ${NATIVE_SYMBOL}`);
  console.log(`  bond            : ${fmtWei(ch.proposalBond)} ${NATIVE_SYMBOL}`);
  console.log(`  approvalDeadline: ${fmtTs(ch.approvalDeadline)}`);
  console.log(`  startTs         : ${fmtTs(ch.startTs)}`);
  console.log(`  peers M/N       : ${ch.peerApprovalsNeeded}/${ch.peers.length}`);
  console.log(`  peer votes      : approvals=${ch.peerApprovals} rejections=${ch.peerRejections}`);
  console.log(`  validator stake : yes=${fmtWei(ch.yesWeight)} no=${fmtWei(ch.noWeight)} part=${fmtWei(ch.partWeight)}`);
  console.log(`  participants    : ${ch.participantsCount}`);
  console.log(`  charityBps      : ${ch.charityBps}  charity: ${ch.charity}`);
  console.log(`  proof required? : ${ch.proofRequired}  verifier: ${ch.verifier}  proofOk: ${ch.proofOk}`);
  console.log(`  pools S/F       : ${fmtWei(ch.poolSuccess)} / ${fmtWei(ch.poolFail)} ${NATIVE_SYMBOL}\n`);
}

main().catch(fail);